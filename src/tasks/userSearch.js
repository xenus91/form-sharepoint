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
// Запросы идут через apiClient текущего SharePoint-сайта: /web/siteusers,
// People Picker и /SP.UserProfiles.PeopleManager/*. Для siteusers предусмотрен
// локальный фолбэк по странице списка.

import apiClient from "../api";
import {
  isDistributionListPrincipalType,
  isGroupPrincipalType,
  normalizePrincipalType,
  PRINCIPAL_TYPE_MASK,
} from "./principalTypes";

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const POSITION_STORAGE_PREFIX = "sp:userOrg:v3:"; // v3: должность + департамент + офис (JSON)
const USERS_PAGE_LIMIT = 1000;

const _positions = new Map();      // loginKey -> «должность · департамент»|null
// Если пакетный запрос к списку сведений о пользователях недоступен (нет полей
// JobTitle/Department или нет прав) — не долбим его на каждый поиск.
let _userInfoBatchBroken = false;
const _allUsers = new Map(); // base → { loaded, list } — фолбэк-страница siteusers
let _allUsersPromise = new Map(); // base → Promise

/** Сброс кэшей (тесты/отладка). */
export function clearUserSearchCache() {
  _positions.clear();
  _userInfoBatchBroken = false;
  _allUsers.clear();
  _allUsersPromise = new Map();
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
      const parsed = JSON.parse(raw);
      _positions.set(key, parsed);
      return parsed;
    }
  } catch (_e) { void _e; }
  return undefined;
}

function cacheWritePosition(key, value) {
  _positions.set(key, value);
  try {
    sessionStorage.setItem(`${POSITION_STORAGE_PREFIX}${key}`, JSON.stringify(value ?? null));
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
  const principalType = Number(raw.PrincipalType);
  return {
    Id: id,
    Title: String(raw.Title || "").trim() || accountLocalPart(loginName),
    LoginName: loginName,
    Email: String(raw.Email || raw.EMail || "").trim(),
    ...(Number.isFinite(principalType) ? { PrincipalType: principalType } : {}),
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

async function fetchUsersPage(get, base = "", limit = USERS_PAGE_LIMIT) {
  const cached = _allUsers.get(base);
  if (cached?.loaded) return cached.list;
  if (!_allUsersPromise.has(base)) {
    _allUsersPromise.set(base, (async () => {
      const url = `${base}/web/siteusers?$select=Id,Title,LoginName,Email,IsHiddenInUI,PrincipalType&$top=${limit}`;
      try {
        const resp = await get(url, ACCEPT);
        const list = resultsOf(resp).map(mapUser).filter(Boolean)
          .filter((u) => !/^sharepoint\|/i.test(u.LoginName) && !/\bsystem\b/i.test(u.Title));
        _allUsers.set(base, { loaded: true, list });
        return list;
      } catch (e) {
        console.warn("[userSearch] siteusers page failed", e?.response?.status || e?.message);
        return [];
      } finally {
        _allUsersPromise.delete(base);
      }
    })());
  }
  return _allUsersPromise.get(base);
}

/**
 * Поиск пользователей и групп по запросу.
 * @param {string} query — учётная запись (можно с `_`), ФИО, название или e-mail
 * @param {{ limit?: number, get?: Function, groupsOnly?: boolean, distributionListsOnly?: boolean, base?: string }} [opts]
 *   groupsOnly — вернуть группы SharePoint (PrincipalType 2, 4 или 8);
 *   distributionListsOnly — вернуть только почтовые рассылки (PrincipalType 2);
 *   base — префикс базы другого сайта.
 * @returns {Promise<Array<{Id:number,Title:string,LoginName:string,Email:string,PrincipalType?:number}>>}
 */
export async function searchSiteUsers(query, opts = {}) {
  const { limit = 20, groupsOnly = false, distributionListsOnly = false, base = "" } = opts;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const variants = accountQueryVariants(query);
  if (variants.length === 0) return [];

  const principalTypeFilter = distributionListsOnly
    ? " and PrincipalType eq 2"
    : groupsOnly
      ? " and PrincipalType ne 1"
      : "";
  const needsPrincipalType = groupsOnly || distributionListsOnly;
  const select = `Id,Title,LoginName,Email,IsHiddenInUI${needsPrincipalType ? ",PrincipalType" : ""}`;
  const filterPrincipalType = (users) => {
    if (distributionListsOnly) {
      return users.filter((u) => normalizePrincipalType(u.PrincipalType) === PRINCIPAL_TYPE_MASK.DISTRIBUTION_LIST);
    }
    if (groupsOnly) return users.filter((u) => isGroupPrincipalType(u.PrincipalType));
    return users;
  };

  const collected = [];
  for (const variant of variants) {
    const q = escapeODataString(variant);
    const url = `${base}/web/siteusers?$filter=(substringof('${q}',LoginName) or substringof('${q}',Title) or substringof('${q}',Email))${principalTypeFilter}`
      + `&$select=${select}&$top=${limit}`;
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

  let users = filterPrincipalType(dedupeUsers(collected));
  if (users.length === 0) {
    // Фолбэк: страница siteusers + локальная фильтрация (учитывает `_` → `.`)
    const all = await fetchUsersPage(get, base);
    users = filterPrincipalType(all.filter((u) => matchesUser(u, query)));
  } else if (variants.length > 1 || needsPrincipalType) {
    // Сервер мог вернуть только точное совпадение; добавляем другие совпадения
    // из уже загруженной страницы siteusers. Фильтр типа сохраняем и здесь.
    const all = _allUsers.get(base);
    if (all?.loaded) {
      users = filterPrincipalType(dedupeUsers([...users, ...all.list.filter((u) => matchesUser(u, query))]));
    }
  }
  return users.slice(0, limit);
}

function peoplePickerResults(response) {
  const body = response?.data?.d ?? response?.data ?? {};
  let value = body?.ClientPeoplePickerSearchUser ?? body?.results ?? body?.value ?? body;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.value)) return value.value;
  return [];
}

function mapPeoplePickerDistributionList(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = raw.EntityData || raw.entityData || {};
  const returnedType = normalizePrincipalType(data.PrincipalType ?? raw.PrincipalType);
  // People Picker запрашивается только с PrincipalType=2. Если ответ явно
  // размечен как пользователь, security group или SharePoint group — отсекаем.
  if (returnedType !== null && !isDistributionListPrincipalType(returnedType)) return null;

  const id = [data.SPUserID, data.UserId, data.Id, raw.Id]
    .map((candidate) => Number(candidate))
    .find((candidate) => Number.isSafeInteger(candidate) && candidate > 0);
  if (!id) return null;

  const loginName = String(
    raw.Key || data.AccountName || data.LoginName || data.Key || "",
  ).trim();
  const email = String(data.Email || raw.Email || raw.EMail || "").trim();
  const title = String(raw.DisplayText || raw.Title || data.Title || "").trim()
    || accountLocalPart(loginName)
    || email;
  if (!title) return null;

  return {
    Id: id,
    Title: title,
    LoginName: loginName,
    Email: email,
    // Некоторые версии People Picker не возвращают PrincipalType; запрос уже
    // ограничен рассылками, поэтому отсутствие типа безопасно нормализуем в 2.
    PrincipalType: PRINCIPAL_TYPE_MASK.DISTRIBUTION_LIST,
  };
}

function distributionListQueryVariants(query) {
  const raw = String(query ?? "").trim();
  const withoutLeadingUnderscore = raw.replace(/^_+/, "").trim();
  const variants = withoutLeadingUnderscore !== raw
    ? [raw, ...accountQueryVariants(withoutLeadingUnderscore)]
    : accountQueryVariants(raw);
  return [...new Set(variants.map((value) => String(value).trim()).filter((value) => value.length >= 2))];
}

/**
 * Поиск почтовых рассылок для поля AssignedTo.
 * People Picker — основной источник: он находит рассылки, которых может ещё
 * не быть в User Information List. REST siteusers используется как fallback.
 * @param {string} query
 * @param {{limit?:number, get?:Function, post?:Function}} [opts]
 * @returns {Promise<Array<{Id:number,Title:string,LoginName:string,Email:string,PrincipalType:2}>>}
 */
export async function searchDistributionLists(query, opts = {}) {
  const queryString = String(query ?? "").trim();
  const queryVariants = distributionListQueryVariants(queryString);
  if (queryVariants.length === 0) return [];

  const limit = Math.max(1, Number(opts.limit) || 20);
  const get = opts.get || ((url, config) => apiClient.get(url, config));
  const post = opts.post || ((url, body, config) => apiClient.post(url, body, config));
  const peoplePickerLists = [];
  for (const searchTerm of queryVariants) {
    try {
      const response = await post(
        "/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.ClientPeoplePickerSearchUser",
        {
          queryParams: {
            __metadata: { type: "SP.UI.ApplicationPages.ClientPeoplePickerQueryParameters" },
            AllowEmailAddresses: true,
            AllowMultipleEntities: true,
            AllUrlZones: false,
            MaximumEntitySuggestions: limit,
            PrincipalSource: 15,
            PrincipalType: PRINCIPAL_TYPE_MASK.DISTRIBUTION_LIST,
            QueryString: searchTerm,
          },
        },
        ACCEPT,
      );
      peoplePickerLists.push(...peoplePickerResults(response)
        .map(mapPeoplePickerDistributionList)
        .filter(Boolean));
    } catch (error) {
      if (error?.response?.status && ![400, 403, 404].includes(error.response.status)) {
        console.warn("[userSearch] distribution list People Picker search failed", error.response.status);
      }
    }
    if (dedupeUsers(peoplePickerLists).length >= limit) break;
  }

  const foundByPeoplePicker = dedupeUsers(peoplePickerLists);
  if (foundByPeoplePicker.length > 0) return foundByPeoplePicker.slice(0, limit);

  // Fallback покрывает рассылки в User Information List. Запускаем его по тем
  // же вариантам, включая поисковый термин без начального `_` (например, `_РЦ` → `РЦ`).
  const siteUserLists = [];
  for (const searchTerm of queryVariants) {
    const remaining = limit - dedupeUsers(siteUserLists).length;
    if (remaining <= 0) break;
    const matches = await searchSiteUsers(searchTerm, {
      limit: remaining,
      get,
      distributionListsOnly: true,
    });
    siteUserLists.push(...matches);
  }
  return dedupeUsers(siteUserLists).slice(0, limit);
}

/**
 * Подпись «Должность · Департамент · Офис» (что доступно).
 * @param {string} position
 * @param {string} department
 * @param {string} office — поле Office сотрудника (из списка сведений о пользователях)
 */
export function positionLabel(position, department, office) {
  const parts = [String(position || "").trim(), String(department || "").trim(), String(office || "").trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Структурированные сведения о человеке: то, что показываем в подсказке/чипе. */
export function userOrgDetails(position, department, office) {
  const info = {
    position: String(position || "").trim(),
    department: String(department || "").trim(),
    office: String(office || "").trim(),
  };
  return { ...info, label: positionLabel(info.position, info.department, info.office) };
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
  const needle = String(property).toLowerCase();
  const list = profilePropertyList(body);
  const hit = list.find((p) => String(p?.Key || "").toLowerCase() === needle);
  if (hit && hit.Value !== undefined && hit.Value !== null) {
    const value = String(hit.Value).trim();
    if (value) return value;
  }
  // Иногда значение приходит прямо в теле (фолбэк).
  const direct = body?.[property] ?? body?.GetPropertiesFor?.[property];
  return direct ? String(direct).trim() : "";
}

/** Офис из профиля: в разных тенантах свойство называется по-разному. */
function profileOffice(body) {
  for (const key of ["Office", "SPS-Office", "SPS-Location"]) {
    const value = profileValue(body, key);
    if (value) return value;
  }
  return "";
}

/**
 * Должность+департамент+офис одного человека ОДНИМ запросом (GetPropertiesFor).
 * @returns {Promise<{position:string,department:string,office:string,label:string|null}>}
 */
async function fetchPositionFromProfile(login, get) {
  const url = `/SP.UserProfiles.PeopleManager/GetPropertiesFor(accountName=@v)?@v=${accountNameParam(login)}`;
  try {
    const resp = await get(url, ACCEPT);
    const body = verboseBody(resp);
    const details = userOrgDetails(
      profileValue(body, "SPS-JobTitle"),
      profileValue(body, "SPS-Department"),
      profileOffice(body),
    );
    if (details.label) return details;
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
  const [position, department, office] = await Promise.all([
    readOne("SPS-JobTitle"),
    readOne("SPS-Department"),
    readOne("Office"),
  ]);
  return userOrgDetails(position, department, office);
}

/**
 * Должность+департамент ПАЧКОЙ — один запрос на всех: «Список сведений о
 * пользователях» (SiteUserInfoList) хранит JobTitle/Department для участников сайта.
 * @returns {Promise<Record<string, string>>} loginName(lower) → подпись
 */
async function fetchPositionsFromUserInfo(users, get, { withOffice = true } = {}) {
  const ids = [...new Set(users.map((u) => Number(u?.Id)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 50);
  if (ids.length === 0) return {};
  const filter = ids.map((n) => `Id eq ${n}`).join(" or ");
  const select = withOffice
    ? "Id,UserName,JobTitle,Department,Office"
    : "Id,UserName,JobTitle,Department";
  const url = `/web/SiteUserInfoList/items?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=50`;
  const resp = await get(url, ACCEPT);
  const out = {};
  for (const item of resultsOf(resp)) {
    const details = userOrgDetails(item?.JobTitle, item?.Department, withOffice ? item?.Office : "");
    const key = lower(String(item?.UserName || ""));
    if (details.label && key) out[key] = details;
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
  if (cached !== undefined) return cached?.label ?? null;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const details = await fetchPositionFromProfile(login, get);
  cacheWritePosition(key, details.label ? details : null);
  return details.label;
}

/** Сведения об организации человека (должность/департамент/офис) — из кэша или из профиля. */
export async function getUserOrgDetails(loginName, opts = {}) {
  const login = String(loginName || "").trim();
  if (!login) return null;
  const key = lower(login);
  const cached = cacheReadPosition(key);
  if (cached !== undefined) return cached;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const details = await fetchPositionFromProfile(login, get);
  const value = details.label ? details : null;
  cacheWritePosition(key, value);
  return value;
}

/**
 * Сведения о людях («должность · департамент · офис») для подсказок автокомплита
 * и уже выбранных.
 *
 * Сначала — ОДИН пакетный запрос к списку сведений о пользователях (JobTitle,
 * Department, Office); если в тенанте нет колонки Office, повторяем без неё.
 * Для тех, кого в списке нет — профиль (не больше 8 человек за раз), тоже одним
 * запросом на человека. Уже известные значения берутся из кэша.
 *
 * @param {Array<{LoginName?:string, Id?:number}>} users
 * @returns {Promise<Record<string, {position:string,department:string,office:string,label:string|null}>>}
 *   loginName(lower) → сведения о человеке
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
      if (cached) out[key] = cached;
      continue;
    }
    unknown.push({ Id: u?.Id, LoginName: login, __key: key });
  }
  if (unknown.length === 0) return out;
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));

  // 1) Один запрос: должность+департамент(+офис) по всем, кого ищем.
  const resolved = new Set();
  if (!_userInfoBatchBroken) {
    const writeBatch = (batch) => {
      for (const u of unknown) {
        const details = batch[u.__key];
        if (!details || !details.label) continue;
        out[u.__key] = details;
        cacheWritePosition(u.__key, details);
        resolved.add(u.__key);
      }
    };
    try {
      writeBatch(await fetchPositionsFromUserInfo(unknown, get));
    } catch (e) {
      const status = e?.response?.status;
      if (status === 400) {
        // В списке сведений нет колонки Office — пробуем без неё (и запоминаем).
        try {
          writeBatch(await fetchPositionsFromUserInfo(unknown, get, { withOffice: false }));
        } catch (e2) {
          const st = e2?.response?.status;
          if (st === 400 || st === 403 || st === 404) _userInfoBatchBroken = true;
          else if (st) console.warn("[userSearch] SiteUserInfoList failed", st);
        }
      } else if (status === 403 || status === 404) {
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
    const details = await fetchPositionFromProfile(u.LoginName, get);
    if (details.label) {
      out[u.__key] = details;
      cacheWritePosition(u.__key, details);
    } else {
      cacheWritePosition(u.__key, null);
    }
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
