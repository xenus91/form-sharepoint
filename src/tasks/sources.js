// src/tasks/sources.js
// Конфиг источников задач (multi-source загрузка).
// План: см. artifacts/plan.md (этапы 1, 5, 10).
//
// Источник — first-class объект, описывающий:
//   - id             : строковый идентификатор ("main" | "dob" | …)
//   - label          : короткий человеко-читаемый лейбл
//   - clientKind     : какой HTTP-клиент обслуживает ("main" | "dob")
//   - listGuid       : GUID списка задач на сайте-источнике (если известен)
//   - listTitle      : заголовок списка задач (для fallback-резолва по Title)
//   - enabled        : глобальный флаг (если false — источник выключен)
//   - resolveListApi : async () => listApi строка (для случаев, когда нужен runtime-резолв)
//
// Override через localStorage["tasks.sources"] (для отладки без пересборки):
//   JSON: { "dob": { "enabled": false } } — мержится поверх дефолта

import { TASKS_LIST_GUID, TASKS_LIST_API } from "./config";

/**
 * @typedef {object} TaskSource
 * @property {string} id
 * @property {string} label
 * @property {"main"|"dob"} clientKind
 * @property {string|null} [listGuid]
 * @property {string|null} [listTitle]
 * @property {boolean} [enabled=true]
 * @property {(() => string|Promise<string>)|null} [resolveListApi=null]
 */

/**
 * Runtime резолв listApi по Title — для случаев, когда GUID неизвестен.
 * Кэширует результат в sessionStorage["sp:listByTitle:<site>:<title>"].
 * @param {{apiBase: string, get: Function}} client
 * @param {string} title
 * @returns {Promise<string|null>}
 */
async function resolveListApiByTitle(client, title) {
  if (!title) return null;
  const cacheKey = `sp:listByTitle:${client.apiBase}:${title}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (_e) { void _e; }
  try {
    const url = `${client.apiBase}/web/lists?$filter=Title eq '${title.replace(/'/g, "''")}'&$select=Id,Title&$top=1`;
    const resp = await client.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    const results = resp?.data?.d?.results || [];
    if (results.length > 0 && results[0].Id) {
      const api = `${client.apiBase}/web/lists(guid'${results[0].Id}')`;
      try { sessionStorage.setItem(cacheKey, api); } catch (_e) { void _e; }
      return api;
    }
  } catch (e) {
    console.warn(`[sources] resolveListApiByTitle(${title}) failed`, e?.response?.status, e?.message);
  }
  return null;
}

/** @type {TaskSource[]} */
export const DEFAULT_TASK_SOURCES = [
  {
    id: "main",
    label: "Образцово",
    clientKind: "main",
    listGuid: TASKS_LIST_GUID,
    listApi: TASKS_LIST_API, // legacy alias — готовая строка "/web/lists(guid'…')"
    listTitle: "Tasks",
    enabled: true,
    resolveListApi: null,
  },
  {
    id: "dob",
    label: "DOB Logistic",
    clientKind: "dob",
    listGuid: null, // неизвестен на момент ADR — резолвим по Title "RequestsTask"
    listTitle: "RequestsTask",
    enabled: true, // Title-based резолв; override через localStorage["tasks.sources"]
    // Резолвер инициализируется в makeSourceClient через проксирование на dobClient
    // Здесь только пометка, что источник активен
    resolveListApi: null,
  },
];

const OVERRIDE_KEY = "tasks.sources";

/** @returns {TaskSource[]} */
export function getTaskSources() {
  let sources = DEFAULT_TASK_SOURCES.map((s) => ({ ...s }));
  // Override из localStorage
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(OVERRIDE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const src of sources) {
            if (parsed[src.id] && typeof parsed[src.id] === "object") {
              Object.assign(src, parsed[src.id]);
            }
          }
        }
      }
    } catch (_e) {
      void _e;
    }
  }
  return sources;
}

/** @param {string} id @returns {TaskSource|null} */
export function getSourceById(id) {
  return getTaskSources().find((s) => s.id === id) || null;
}

/**
 * Возвращает listApi для источника: либо готовую строку, либо резолвит через Title.
 * @param {TaskSource} source
 * @param {{apiBase: string, get: Function}} [client] — нужен для title-based резолва
 * @returns {Promise<string>}
 */
export async function resolveSourceListApi(source, client) {
  if (!source) throw new Error("[sources] source is required");
  if (source.listApi) return source.listApi;
  if (source.resolveListApi) {
    return await source.resolveListApi();
  }
  // Title-based fallback (dob source без GUID)
  if (client && source.listTitle) {
    const api = await resolveListApiByTitle(client, source.listTitle);
    if (api) {
      source.listApi = api; // кэшируем на объекте (на время сессии)
      return api;
    }
    throw new Error(`[sources] could not resolve listApi by Title "${source.listTitle}" for source ${source.id}`);
  }
  throw new Error(`[sources] no listApi for source ${source.id}`);
}