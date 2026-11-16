// src/tasks/principalDetails.js
// Ленивое уточнение принципалов DcEmail: Id → { kind, title, loginName, email }.
//
// Проблема: DcEmail.Email — multi Person-or-Group (иногда Lookup), и в ответе
// REST приходит только Id (Title/LoginName/EMail либо ломают запрос на части
// тенантов, либо просто не запрашиваются — см. ADR dob-task-sources.md).
// Без типа принципала resolveSourceIdentity не мог понять, пользователь это или
// группа, и молча выбрасывал запись → в #tasks не было задач групп из DcEmail.
//
// Решение: по Id принципала делаем точечные запросы к ОСНОВНОМУ сайту
// (там живёт DcEmail):
//   GET /web/getuserbyid(<Id>)        → SP.User  (пользователь)
//   GET /web/sitegroups/getbyid(<Id>) → SP.Group (группа)
// Результат кэшируем в sessionStorage: "sp:principalDetail:<id>".

import apiClient from "../api";

const STORAGE_PREFIX = "sp:principalDetail:";
const _mem = new Map();

// SP.PrincipalType: 1 — пользователь, 2/4/8 — разновидности группы.
const KIND_BY_PRINCIPAL_TYPE = { 1: "user", 2: "group", 4: "group", 8: "group" };

/**
 * @typedef {object} PrincipalDetail
 * @property {number} id
 * @property {"user"|"group"|"unknown"} kind
 * @property {string|null} title
 * @property {string|null} loginName
 * @property {string|null} email
 */

function cacheRead(id) {
  if (_mem.has(id)) return _mem.get(id);
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        _mem.set(id, parsed);
        return parsed;
      }
    }
  } catch (_e) { void _e; }
  return null;
}

function cacheWrite(id, value) {
  _mem.set(id, value);
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(value));
  } catch (_e) { void _e; }
}

/** Сброс кэша принципалов (отладка/тесты). */
export function clearPrincipalDetailsCache() {
  _mem.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch (_e) { void _e; }
}

/**
 * Уточняет один принципал по Id на основном сайте.
 * @param {number|string} rawId
 * @param {{get?: Function}} [deps] — для тестов
 * @returns {Promise<PrincipalDetail|null>}
 */
export async function resolvePrincipalDetail(rawId, deps = {}) {
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const cached = cacheRead(id);
  if (cached) return cached;
  const get = deps.get || ((url, opts) => apiClient.get(url, opts));
  const accept = { headers: { Accept: "application/json;odata=verbose" } };

  // 1) User Information List: там лежат И пользователи, И группы.
  //    Поэтому «нашлась запись ⇒ человек» — ОШИБКА: группа из UIL получала
  //    kind "user" и считалась пользователем. Тип даёт PrincipalType
  //    (SP.PrincipalType, битовая маска): 1 — пользователь,
  //    2 — список рассылки, 4 — security-группа, 8 — группа SharePoint.
  const groupHit = async () => {
    try {
      const resp = await get(`/web/sitegroups/getbyid(${id})`, accept);
      const g = resp?.data?.d || resp?.data;
      return g && (g.Title || g.LoginName) ? g : null;
    } catch {
      return null;
    }
  };

  try {
    const resp = await get(`/web/getuserbyid(${id})`, accept);
    const d = resp?.data?.d || resp?.data;
    if (d && (d.LoginName || d.Email || d.EMail || d.Title)) {
      const fromType = KIND_BY_PRINCIPAL_TYPE[Number(d.PrincipalType)];
      const detail = {
        id,
        // PrincipalType не приехал (бывает) — уточняем группой: если Id есть
        // только в sitegroups, это ГРУППА, а не человек.
        kind: fromType || ((await groupHit()) ? "group" : "user"),
        title: d.Title || null,
        loginName: d.LoginName || null,
        email: d.Email || d.EMail || null,
      };
      cacheWrite(id, detail);
      return detail;
    }
  } catch (e) {
    if (e?.response?.status && e.response.status !== 404 && e.response.status !== 400) {
      console.warn(`[principalDetails] getuserbyid(${id}) failed`, e.response.status);
    }
  }

  // 2) Только группы
  const group = await groupHit();
  if (group) {
    const detail = {
      id,
      kind: "group",
      title: group.Title || null,
      loginName: group.LoginName || null,
      email: group.Email || null,
    };
    cacheWrite(id, detail);
    return detail;
  }
  return null;
}

/**
 * Обогащает запись DcEmail: для каждого Email-принципала без Title/EMail
 * подтягивает детали и кладёт их ОБРАТНО в Email (не ломая исходную структуру).
 *
 * Возвращает НОВЫЙ объект (иммутабельно), чтобы React Query увидел изменение.
 * Если уточнять нечего — возвращает исходный объект как есть.
 *
 * @param {object|null} distribution
 * @param {{get?: Function}} [deps]
 * @returns {Promise<object|null>}
 */
export async function enrichDistribution(distribution, deps = {}) {
  if (!distribution) return distribution;
  const email = distribution.Email;
  const results = Array.isArray(email?.results)
    ? email.results
    : Array.isArray(email)
      ? email
      : email && typeof email === "object" && email.Id != null
        ? [email]
        : null;
  if (!results || results.length === 0) return distribution;

  const needIds = [];
  for (const item of results) {
    if (item == null || typeof item !== "object") {
      if (typeof item === "number" || typeof item === "string") needIds.push(Number(item));
      continue;
    }
    const id = Number(item.Id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const hasDetails = !!(item.Title || item.EMail || item.Email || item.LoginName || item.kindHint);
    if (!hasDetails) needIds.push(id);
  }
  if (needIds.length === 0) return distribution;

  const details = await Promise.all(needIds.map((id) => resolvePrincipalDetail(id, deps)));
  const byId = new Map();
  for (const d of details) {
    if (d) byId.set(d.id, d);
  }
  if (byId.size === 0) return distribution;

  const enrichedResults = results.map((item) => {
    const id = Number(item && typeof item === "object" ? item.Id : item);
    const d = byId.get(id);
    if (!d) return item;
    const base = item && typeof item === "object" ? item : { Id: id };
    return {
      ...base,
      Id: id,
      Title: base.Title || d.title || undefined,
      EMail: base.EMail || d.email || undefined,
      Email: base.Email || d.email || undefined,
      LoginName: base.LoginName || d.loginName || undefined,
      kindHint: d.kind,
    };
  });

  if (Array.isArray(email?.results)) {
    return { ...distribution, Email: { ...email, results: enrichedResults } };
  }
  if (Array.isArray(email)) {
    return { ...distribution, Email: enrichedResults };
  }
  return { ...distribution, Email: enrichedResults[0] };
}
