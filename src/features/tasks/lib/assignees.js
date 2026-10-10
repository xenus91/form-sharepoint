// src/features/tasks/lib/assignees.js
//
// «Кому назначено» (AssignedTo) — список принципалов задачи и уточнение
// «это человек или группа».
//
// Зачем: в интерфейсах AssignedTo показывали просто строкой. Нужно показывать
// КНОПКУ с иконкой (человек / группа) и по клику — информацию о принципале.
//
// ВАЖНО про определение типа. В SharePoint и пользователь, и группа лежат в
// User Information List, поэтому `/web/getuserbyid(<id>)` СПОКОЙНО возвращает
// ГРУППУ — и первая версия кода считала любую найденную запись человеком.
// Тип даёт поле PrincipalType:
//   1 — User, 2 — DistributionList, 4 — SecurityGroup, 8 — SharePointGroup.
// Если PrincipalType не приехал — проверяем `/web/sitegroups/getbyid(<id>)`:
// оттуда отдаются только группы.

import apiClient from "../../../api";
import { dobApiBase, dobAxios } from "../../dob/api/dobClient";
import { toRequestUrl } from "../../../tasks/sourceClient";

const MAIN_TASKS_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639";
const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const CACHE_PREFIX = "sp:assigneeInfo:";
const _memCache = new Map();

// SP.PrincipalType: 1 — пользователь, 2/4/8 — разновидности группы.
const KIND_BY_PRINCIPAL_TYPE = { 1: "user", 2: "group", 4: "group", 8: "group" };

const asArray = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  return [value];
};

const titleOf = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return String(value.Title || value.title || value.LoginName || value.loginName || "").trim();
};

const idOf = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    const n = Number(value.Id ?? value.id);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Принципалы задачи «Кому назначено».
 * @param {object|null} task
 * @returns {{title:string, id:number|null}[]}
 */
export function parseAssignees(task) {
  if (!task) return [];
  const rawTitles = asArray(task.AssignedTo).map(titleOf).filter(Boolean);
  const ids = asArray(task.AssignedToId).map(idOf).filter((n) => Number.isFinite(n) && n > 0);

  let titles = rawTitles;
  if (rawTitles.length === 1) {
    const single = rawTitles[0];
    // SharePoint склеивает многозначный выбор как «A;#B» — это приходит ОДНОЙ
    // строкой, поэтому режем. Обычную запятую не трогаем: она может быть
    // частью названия («Группа ООБ, ТК-12»).
    if (single.includes(";#")) titles = single.split(";#").map((s) => s.trim()).filter(Boolean);
  }

  if (titles.length === 0 && ids.length === 0) return [];
  if (titles.length === 0) return ids.map((id) => ({ title: "", id }));
  if (titles.length === ids.length) return titles.map((title, i) => ({ title, id: ids[i] ?? null }));
  // Один Id на несколько имён (или наоборот) — Id относим к первому.
  if (ids.length === 1) return titles.map((title, i) => ({ title, id: i === 0 ? ids[0] : null }));
  return titles.map((title, i) => ({ title, id: ids[i] ?? null }));
}

/** Задача НЕ из основного списка (сайт ДОБ и т.п.)? */
export function isExternalTask(task) {
  const source = String(task?.sourceId || "").trim();
  if (source && source !== "main") return true;
  const guid = String(task?.listGuid || task?.sourceListGuid || "").trim();
  return !!guid && guid.toUpperCase() !== MAIN_TASKS_GUID;
}

/**
 * Клиент для уточнения принципала: у задачи внешнего сайта Id живёт в ЕГО
 * сайт-коллекции — на основном сайте тот же Id указывает на ДРУГОГО человека.
 */
export function principalGetForTask(task) {
  if (!isExternalTask(task)) return (url, cfg) => apiClient.get(url, cfg);
  const apiBase = dobApiBase();
  return (url, cfg) => dobAxios.get(toRequestUrl(apiBase, url), cfg);
}

function cacheRead(key) {
  if (_memCache.has(key)) return _memCache.get(key);
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        _memCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    /* sessionStorage недоступен — работаем без кэша */
  }
  return null;
}

function cacheWrite(key, value) {
  _memCache.set(key, value);
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    /* переполнение/приватный режим — не страшно */
  }
}

/** Сброс кэша (тесты). */
export function clearAssigneeCache() {
  _memCache.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

async function getUserEntry(get, id) {
  try {
    const { data } = await get(
      `/web/getuserbyid(${id})?$select=Id,Title,LoginName,Email,PrincipalType`,
      ACCEPT,
    );
    const d = data?.d || data;
    if (d && (d.Title || d.LoginName)) return d;
  } catch {
    /* нет такого пользователя (или нет доступа) — пробуем группу */
  }
  return null;
}

async function getGroupEntry(get, id) {
  try {
    const { data } = await get(
      `/web/sitegroups/getbyid(${id})?$select=Id,Title,LoginName,Description`,
      ACCEPT,
    );
    const d = data?.d || data;
    if (d && (d.Title || d.LoginName)) return d;
  } catch {
    /* не группа */
  }
  return null;
}

/**
 * Кто это — человек или группа.
 * @param {Function} get — http-клиент сайта задачи
 * @param {number} id
 * @returns {Promise<{id:number, kind:"user"|"group", title:string|null, loginName:string|null, email:string|null}|null>}
 */
export async function resolvePrincipal(get, id) {
  // 1) User Information List: там лежат И пользователи, И группы.
  const user = await getUserEntry(get, id);
  if (user) {
    const fromType = KIND_BY_PRINCIPAL_TYPE[Number(user.PrincipalType)];
    const base = {
      id,
      kind: fromType || "user",
      title: user.Title || null,
      loginName: user.LoginName || null,
      email: user.Email || user.EMail || null,
    };
    if (fromType) return base; // тип известен — дальше не спрашиваем
    // PrincipalType не приехал (бывает) — уточняем, не группа ли это.
    const group = await getGroupEntry(get, id);
    if (group) {
      return { ...base, kind: "group", title: group.Title || base.title, loginName: group.LoginName || base.loginName };
    }
    return base;
  }
  // 2) Только группы.
  const group = await getGroupEntry(get, id);
  if (group) {
    return {
      id,
      kind: "group",
      title: group.Title || null,
      loginName: group.LoginName || null,
      email: group.Email || null,
    };
  }
  return null;
}

/**
 * Уточнить принципала задачи: { kind, title, loginName, email }.
 * Без Id уточнить нечего — возвращаем то, что знаем из самой задачи
 * (kind: "unknown" → в интерфейсе иконка «человек»).
 *
 * Кэш — с учётом САЙТА: один и тот же Id на разных сайтах — разные принципалы.
 */
export async function resolveAssignee(task, assignee) {
  const id = Number(assignee?.id);
  const known = {
    id: Number.isFinite(id) ? id : null,
    kind: "unknown",
    title: assignee?.title || "",
    loginName: null,
    email: null,
  };
  if (!Number.isFinite(id) || id <= 0) return known;

  const scope = isExternalTask(task) ? "dob" : "main";
  const key = `${scope}:${id}`;
  const cached = cacheRead(key);
  if (cached) return { ...cached, title: cached.title || known.title };

  try {
    const info = await resolvePrincipal(principalGetForTask(task), id);
    if (info) {
      const result = { ...info, title: info.title || known.title };
      cacheWrite(key, result);
      return result;
    }
  } catch {
    // Нет доступа/сети — остаёмся при известном названии.
  }
  return known;
}

// Одинаковых исполнителей в списке много: один и тот же Id не должен
// уходить на сервер по разу на каждую строку. Держим «в полёте» по принципалу.
const _inflight = new Map();

/** То же, что resolveAssignee, но с дедупом одновременных запросов. */
export function resolveAssigneeCached(task, assignee) {
  const scope = isExternalTask(task) ? "dob" : "main";
  const key = `${scope}:${assignee?.id ?? "no-id"}`;
  const existing = _inflight.get(key);
  if (existing) return existing;
  const promise = resolveAssignee(task, assignee);
  _inflight.set(key, promise);
  return promise;
}

/** Сброс кэша «в полёте» (тесты). */
export function clearAssigneesInflight() {
  _inflight.clear();
}
