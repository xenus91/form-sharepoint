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

// GUID списка задач на сайте ДОБ (sites/dob/doblogistic, список "RequestsTask").
// Подтверждён рабочим запросом пользователя:
//   /dob-api/sites/dob/doblogistic/_api/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')/items
// Ответ содержит элементы типа SP.Data.RequestsTaskListItem (заявки ООБ).
// Раньше GUID был неизвестен (TODO Этап 0 в ADR) и список резолвился по Title —
// это ломало fetch, если Title в тенанте отличается (пробел/переименование).
export const DOB_TASKS_LIST_GUID = "03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3";
// Путь к списку ОТНОСИТЕЛЬНО api-base источника.
// Полный URL собирает makeSourceClient().toRequestUrl()
// (в dev → /dob-api/sites/dob/doblogistic/_api/web/lists(guid'…'), в prod → origin + /sites/dob/doblogistic/_api/web/lists(guid'…')).
export const DOB_TASKS_LIST_API = `/web/lists(guid'${DOB_TASKS_LIST_GUID.toLowerCase()}')`;

/**
 * @typedef {object} TaskSource
 * @property {string} id
 * @property {string} label
 * @property {"main"|"dob"} clientKind
 * @property {string|null} [listGuid]
 * @property {string|null} [listTitle]
 * @property {boolean} [enabled=true]
 * @property {(() => string|Promise<string>)|null} [resolveListApi=null]
 * @property {string|null} [inProgressStatus] — статус «в работе» на этом сайте.
 *   Если null — берётся первый подходящий choice поля Status (см. takeTaskInWork).
 */

/**
 * Runtime резолв listApi по Title — fallback для случаев, когда GUID неизвестен
 * или отличается в тенанте.
 *
 * Возвращает путь ОТНОСИТЕЛЬНО api-base источника ("/web/lists(guid'…')"),
 * чтобы его можно было одинаково использовать и в fetchTasksForSource,
 * и в useFieldsForSource (оба гоняют URL через client.toRequestUrl()).
 * Кэширует результат в sessionStorage["sp:listByTitle:<apiBase>:<title>"].
 *
 * @param {{apiBase: string, get: Function, toRequestUrl?: Function}} client
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
  const toRequestUrl = typeof client?.toRequestUrl === "function"
    ? client.toRequestUrl
    : (path) => `${client.apiBase || ""}${path}`;
  try {
    const url = toRequestUrl(`/web/lists?$filter=Title eq '${title.replace(/'/g, "''")}'&$select=Id,Title&$top=1`);
    const resp = await client.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    const results = resp?.data?.d?.results || [];
    if (results.length > 0 && results[0].Id) {
      const api = `/web/lists(guid'${results[0].Id}')`;
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
    listGuid: DOB_TASKS_LIST_GUID,
    listApi: DOB_TASKS_LIST_API, // подтверждённый GUID списка "RequestsTask" (см. выше)
    listTitle: "RequestsTask", // fallback-резолв по Title, если GUID в тенанте другой
    enabled: true,
    resolveListApi: null,
    // Вокабуляр статусов на сайте ДОБ может отличаться — определяем автоматически
    // по choice-полям списка; при необходимости задаётся override'ом
    // localStorage["tasks.sources"] = { "dob": { "inProgressStatus": "В работе" } }.
    inProgressStatus: null,
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