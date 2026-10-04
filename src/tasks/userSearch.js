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
const POSITION_STORAGE_PREFIX = "sp:userPosition:";
const USERS_PAGE_LIMIT = 1000;

const _positions = new Map();      // loginKey -> position|null
const _allUsers = { loaded: false, list: [] }; // фолбэк-страница siteusers
let _allUsersPromise = null;

/** Сброс кэшей (тесты/отладка). */
export function clearUserSearchCache() {
  _positions.clear();
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

/**
 * Должность пользователя из профиля SharePoint (SPS-JobTitle).
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
  const quoted = `'${escapeODataString(login)}'`;
  try {
    const resp = await get(
      `/SP.UserProfiles.PeopleManager/GetUserProfilePropertyFor(accountName=@v,propertyName='SPS-JobTitle')?@v=${quoted}`,
      ACCEPT,
    );
    const d = verboseBody(resp);
    const value = typeof d === "string" ? d : (d?.GetUserProfilePropertyFor ?? d?.value ?? null);
    const position = value ? String(value).trim() : null;
    cacheWritePosition(key, position);
    return position;
  } catch (e) {
    if (e?.response?.status && e.response.status !== 404 && e.response.status !== 400) {
      console.warn("[userSearch] job title failed", e.response.status);
    }
    cacheWritePosition(key, null);
    return null;
  }
}

/**
 * Должности для набора пользователей (для подсказок автокомплита).
 * @param {Array<{LoginName?:string}>} users
 * @returns {Promise<Record<string, string|null>>} loginName(lower) → должность
 */
export async function getUserPositions(users = [], opts = {}) {
  const out = {};
  const list = (Array.isArray(users) ? users : []).slice(0, 25);
  await Promise.all(list.map(async (u) => {
    const login = String(u?.LoginName || "").trim();
    if (!login) return;
    out[lower(login)] = await getUserPosition(login, opts);
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
