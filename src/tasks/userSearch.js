// src/tasks/userSearch.js
// Поиск пользователей по УЧЁТНОЙ ЗАПИСИ для полей «Пользователь или группа»
// (Guilty, UserFail, AssignedTo…): автокомплит с многократным выбором.
//
// Что умеет:
//   • ищет по учётной записи (LoginName), ФИО (Title) и e-mail;
//   • приводит разделители: «ivanov_ii» находит «ivanov.ii» (ключ `_` → `.`);
//   • подтягивает ДОЛЖНОСТЬ из профиля SharePoint (SPS-JobTitle), чтобы показать
//     её рядом с именем в подсказке/выборе;
//   • кэширует и результаты поиска, и должности (sessionStorage + память).
//
// Все запросы идут через apiClient ОСНОВНОГО сайта: /web/siteusers и
// /SP.UserProfiles.PeopleManager/*. Если серверный фильтр не поддерживается —
// есть фолбэк: один раз вычитываем страницу siteusers и фильтруем локально.

import apiClient from "../api";

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const POSITION_STORAGE_PREFIX = "sp:userOrg:"; // v2: должность + департамент
const USERS_PAGE_LIMIT = 1000;

const _positions = new Map();      // loginKey -> «должность · департамент»|null
// Если пакетный запрос к списку сведений о пользователях недоступен (нет полей
// JobTitle/Department или нет прав) — не долбим его на каждый поиск.
let _userInfoBatchBroken = false;
const _allUsers = { loaded: false, list: [] }; // фолбэк-страница siteusers
let _allUsersPromise = null;

/** Сброс кэшей (тесты/отладка). */
export function clearUserSearchCache() {
  _positions.clear();
  _userInfoBatchBroken = false;
  _allUsers.loaded = false;
  _allUsers.list = [];
  _allUsersPromise = null;
  try {
    if (typeof sessionStorage !== "undefined") {
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(POSITION_STORAGE_PREFIX)) sessionStorage.removeItem(k);
      }
    }
  } catch (_e) { void _e; }
}

/**
 * Приведение разделителей учётной записи: `_` → `.`.
 * «ivanov_ii» → «ivanov.ii», «i:0#.f|membership|ivanov_ii@lenta.com» →
 * «i:0#.f|membership|ivanov.ii@lenta.com».
 * Значения без `_` возвращаются как есть (важно: не ломаем домены и служебные части).
 */
export function normalizeAccountSeparators(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.replace(/_/g, ".");
}

/** Варианты поиска: как ввёл пользователь + с точками вместо подчёркиваний. */
export function accountQueryVariants(query) {
  const raw = String(query ?? "").trim();
  if (!raw) return [];
  const out = [raw];
  const dotted = normalizeAccountSeparators(raw);
  if (dotted && dotted !== raw) out.push(dotted);
  return out;
}

/** Часть учётной записи без претензий на формат: «i:0#.f|membership|ivanov.ii@lenta.com». */
export function accountLocalPart(loginName = "") {
  const login = String(loginName || "");
  if (!login) return "";
  const tail = login.includes("|") ? login.slice(login.lastIndexOf("|") + 1) : login;
  return tail.includes("@") ? tail.slice(0, tail.indexOf("@")) : tail;
}

function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Совпадает ли пользователь с запросом (локальный фолбэк и простые проверки).
 * Учитывает и исходный запрос, и «точечный» вариант.
 */
export function matchesUser(user, query) {
  const variants = accountQueryVariants(query).map(lower).filter(Boolean);
  if (variants.length === 0) return true;
  const haystack = [
    user?.LoginName,
    user?.Title,
    user?.Email || user?.EMail,
    accountLocalPart(user?.LoginName),
  ].map(lower).filter(Boolean);
  return variants.some((v) => haystack.some((h) => h.includes(v)));
}

function cacheReadPosition(key) {
  if (_positions.has(key)) return _positions.get(key);
  try {
    const raw = sessionStorage.getItem(`${POSITION_STORAGE_PREFIX}${key}`);
    if (raw !== null) {
      const parsed = raw === "null" ? null : raw;
      _positions.set(key, parsed);
      return parsed;
    }
  } catch (_e) { void _e; }
  return undefined;
}

function cacheWritePosition(key, value) {
  _positions.set(key, value);
  try {
    sessionStorage.setItem(`${POSITION_STORAGE_PREFIX}${key}`, value === null || value === undefined ? "null" : String(value));
  } catch (_e) { void _e; }
}

function verboseBody(resp) {
  return resp?.data?.d ?? resp?.data ?? null;
}

function resultsOf(resp) {
  const d = verboseBody(resp);
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return Array.isArray(d.results) ? d.results : [];
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

function mapUser(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.Id);
  const loginName = String(raw.LoginName || "").trim();
  if (!Number.isFinite(id) || id <= 0 || !loginName) return null;
  return {
    Id: id,
    Title: String(raw.Title || "").trim() || accountLocalPart(loginName),
    LoginName: loginName,
    Email: String(raw.Email || raw.EMail || "").trim(),
  };
}

function dedupeUsers(users) {
  const seen = new Set();
  const out = [];
  for (const u of users) {
    if (!u) continue;
    const key = `${u.Id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

async function fetchUsersPage(get, limit = USERS_PAGE_LIMIT) {
  if (_allUsers.loaded) return _allUsers.list;
  if (!_allUsersPromise) {
    _allUsersPromise = (async () => {
      const url = `/web/siteusers?$select=Id,Title,LoginName,Email,IsHiddenInUI&$top=${limit}`;
      try {
        const resp = await get(url, ACCEPT);
        const list = resultsOf(resp).map(mapUser).filter(Boolean)
          .filter((u) => !/^sharepoint\|/i.test(u.LoginName) && !/\bsystem\b/i.test(u.Title));
        _allUsers.loaded = true;
        _allUsers.list = list;
        return list;
      } catch (e) {
        console.warn("[userSearch] siteusers page failed", e?.response?.status || e?.message);
        return [];
      } finally {
        _allUsersPromise = null;
      }
    })();
  }
  return _allUsersPromise;
}

/**
 * Поиск пользователей по запросу.
 * @param {string} query — учётная запись (можно с `_`), ФИО или e-mail
 * @param {{ limit?: number, get?: Function }} [opts]
 * @returns {Promise<Array<{Id:number,Title:string,LoginName:string,Email:string}>>}
 */
export async function searchSiteUsers(query, opts = {}) {
  const { limit = 20 } = opts;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const variants = accountQueryVariants(query);
  if (variants.length === 0) return [];

  const collected = [];
  for (const variant of variants) {
    const q = escapeODataString(variant);
    const url = `/web/siteusers?$filter=substringof('${q}',LoginName) or substringof('${q}',Title) or substringof('${q}',Email)`
      + `&$select=Id,Title,LoginName,Email,IsHiddenInUI&$top=${limit}`;
    try {
      const resp = await get(url, ACCEPT);
      collected.push(...resultsOf(resp).map(mapUser).filter(Boolean));
    } catch (e) {
      // 400/403 на substringof(Email) и т.п. — не повод падать: ниже фолбэк
      if (e?.response?.status && e.response.status !== 400 && e.response.status !== 403 && e.response.status !== 404) {
        console.warn("[userSearch] search failed", e.response.status);
      }
      break;
    }
    if (collected.length >= limit) break;
  }

  let users = dedupeUsers(collected);
  if (users.length === 0) {
    // Фолбэк: страница siteusers + локальная фильтрация (учитывает `_` → `.`)
    const all = await fetchUsersPage(get);
    users = all.filter((u) => matchesUser(u, query));
  } else if (variants.length > 1) {
    // сервер вернул только точное совпадение — добавим совпадения с точками из фолбэка, если он уже загружен
    if (_allUsers.loaded) {
      users = dedupeUsers([...users, ..._allUsers.list.filter((u) => matchesUser(u, query))]);
    }
  }
  return users.slice(0, limit);
}

/** Подпись «Должность · Департамент» (что доступно). */
export function positionLabel(position, department) {
  const parts = [String(position || "").trim(), String(department || "").trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * accountName для вызовов профиля.
 *
 * ⚠️ Кодировать ОБЯЗАТЕЛЬНО целиком: в учётной записи есть `#`
 * («i:0#.f|membership|ivanov.ii@lenta.com»), а `#` в URL обрывает строку запроса
 * и начинает fragment — SharePoint получает обрезанный `@v='i:0` и отвечает
 * «Строка запроса "accountName" отсутствует или недопустима».
 * encodeURIComponent превращает `#` в %23, `|` в %7C, `@` в %40.
 */
function accountNameParam(login) {
  return encodeURIComponent(`'${escapeODataString(login)}'`);
}

/** Свойства профиля из ответа GetPropertiesFor/GetUserProfilePropertyFor. */
function profilePropertyList(body) {
  const node = body?.GetPropertiesFor ?? body;
  const raw = node?.UserProfileProperties;
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
  return list;
}

function profileValue(body, property) {
  const list = profilePropertyList(body);
  const hit = list.find((p) => String(p?.Key || "").toLowerCase() === property.toLowerCase());
  if (hit && hit.Value !== undefined && hit.Value !== null) {
    const value = String(hit.Value).trim();
    if (value) return value;
  }
  // Иногда значение приходит прямо в теле (фолбэк).
  const direct = body?.[property] ?? body?.GetPropertiesFor?.[property];
  return direct ? String(direct).trim() : "";
}

/**
 * Должность+департамент одного человека ОДНИМ запросом (GetPropertiesFor).
 * @returns {Promise<string|null>} «Главный специалист · Департамент ИТ»
 */
async function fetchPositionFromProfile(login, get) {
  const url = `/SP.UserProfiles.PeopleManager/GetPropertiesFor(accountName=@v)?@v=${accountNameParam(login)}`;
  try {
    const resp = await get(url, ACCEPT);
    const body = verboseBody(resp);
    const label = positionLabel(profileValue(body, "SPS-JobTitle"), profileValue(body, "SPS-Department"));
    if (label) return label;
  } catch (e) {
    if (e?.response?.status && ![400, 403, 404].includes(e.response.status)) {
      console.warn("[userSearch] GetPropertiesFor failed", e.response.status);
    }
  }
  // Фолбэк: по одному свойству (тоже с корректным кодированием учётной записи).
  const readOne = async (property) => {
    try {
      const resp = await get(
        `/SP.UserProfiles.PeopleManager/GetUserProfilePropertyFor(accountName=@v,propertyName='${property}')?@v=${accountNameParam(login)}`,
        ACCEPT,
      );
      const d = verboseBody(resp);
      const value = typeof d === "string" ? d : (d?.GetUserProfilePropertyFor ?? d?.value ?? null);
      return value ? String(value).trim() : "";
    } catch (_e) {
      void _e;
      return "";
    }
  };
  const [position, department] = await Promise.all([readOne("SPS-JobTitle"), readOne("SPS-Department")]);
  return positionLabel(position, department);
}

/**
 * Должность+департамент ПАЧКОЙ — один запрос на всех: «Список сведений о
 * пользователях» (SiteUserInfoList) хранит JobTitle/Department для участников сайта.
 * @returns {Promise<Record<string, string>>} loginName(lower) → подпись
 */
async function fetchPositionsFromUserInfo(users, get) {
  const ids = [...new Set(users.map((u) => Number(u?.Id)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 50);
  if (ids.length === 0) return {};
  const filter = ids.map((n) => `Id eq ${n}`).join(" or ");
  const url = `/web/SiteUserInfoList/items?$select=Id,UserName,JobTitle,Department&$filter=${encodeURIComponent(filter)}&$top=50`;
  const resp = await get(url, ACCEPT);
  const out = {};
  for (const item of resultsOf(resp)) {
    const label = positionLabel(item?.JobTitle, item?.Department);
    const key = lower(String(item?.UserName || ""));
    if (label && key) out[key] = label;
  }
  return out;
}

/**
 * Должность и департамент пользователя из профиля SharePoint
 * («Главный специалист · Департамент ИТ»).
 * @param {string} loginName — например «i:0#.f|membership|ivanov.ii@lenta.com»
 * @param {{ get?: Function }} [opts]
 * @returns {Promise<string|null>}
 */
export async function getUserPosition(loginName, opts = {}) {
  const login = String(loginName || "").trim();
  if (!login) return null;
  const key = lower(login);
  const cached = cacheReadPosition(key);
  if (cached !== undefined) return cached;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const label = await fetchPositionFromProfile(login, get);
  cacheWritePosition(key, label);
  return label;
}

/**
 * Подписи «должность · департамент» для набора пользователей (для подсказок
 * автокомплита и уже выбранных).
 *
 * Сначала — один пакетный запрос к списку сведений о пользователях; для тех, кого
 * там нет, — профиль (не больше 8 человек за раз, чтобы поиск не превращался в
 * лавину запросов). Уже известные значения берутся из кэша.
 *
 * @param {Array<{LoginName?:string, Id?:number}>} users
 * @returns {Promise<Record<string, string|null>>} loginName(lower) → подпись
 */
export async function getUserPositions(users = [], opts = {}) {
  const out = {};
  const list = (Array.isArray(users) ? users : []).slice(0, 25);
  const unknown = [];
  for (const u of list) {
    const login = String(u?.LoginName || "").trim();
    if (!login) continue;
    const key = lower(login);
    const cached = opts.forceRefresh ? undefined : cacheReadPosition(key);
    if (cached !== undefined) {
      out[key] = cached;
      continue;
    }
    unknown.push({ Id: u?.Id, LoginName: login, __key: key });
  }
  if (unknown.length === 0) return out;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));

  // 1) Один запрос: должность+департамент по всем, кого ищем.
  const resolved = new Set();
  if (!_userInfoBatchBroken) {
    try {
      const batch = await fetchPositionsFromUserInfo(unknown, get);
      for (const u of unknown) {
        if (batch[u.__key] !== undefined) {
          out[u.__key] = batch[u.__key];
          cacheWritePosition(u.__key, batch[u.__key]);
          resolved.add(u.__key);
        }
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 400 || status === 403 || status === 404) {
        // Поля/права недоступны — дальше идём профилем, пакет больше не пробуем.
        _userInfoBatchBroken = true;
      } else if (status) {
        console.warn("[userSearch] SiteUserInfoList failed", status);
      }
    }
  }

  // 2) Кого в списке сведений нет — смотрим профиль (ограниченно).
  const rest = unknown.filter((u) => !resolved.has(u.__key)).slice(0, 8);
  await Promise.all(rest.map(async (u) => {
    const label = await fetchPositionFromProfile(u.LoginName, get);
    out[u.__key] = label;
    cacheWritePosition(u.__key, label);
  }));
  return out;
}

/** Подпись пользователя для чипа/значения: «Иванов Иван Иванович». */
export function personDisplayName(user) {
  if (!user) return "";
  return String(user.Title || "").trim() || accountLocalPart(user.LoginName);
}

/**
 * Подпись для подсказки/выбора: «Иванов Иван Иванович — Главный специалист».
 * Должность необязательна: если её нет, возвращается только имя.
 */
export function personOptionLabel(user, position) {
  const name = personDisplayName(user);
  const pos = String(position || "").trim();
  return pos ? `${name} — ${pos}` : name;
}
