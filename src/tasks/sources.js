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
    listGuid: null, // TODO Этап 0: получить GUID списка "RequestsTask" на /sites/dob/doblogistic
    listTitle: "RequestsTask",
    enabled: false, // до получения GUID и подтверждения прав ООБ
    resolveListApi: null, // будет подменён на getListApiByTitle(...) ниже
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
 * @returns {Promise<string>}
 */
export async function resolveSourceListApi(source) {
  if (!source) throw new Error("[sources] source is required");
  if (source.listApi) return source.listApi;
  if (source.resolveListApi) {
    return await source.resolveListApi();
  }
  throw new Error(`[sources] no listApi for source ${source.id}`);
}