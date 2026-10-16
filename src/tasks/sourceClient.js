// src/tasks/sourceClient.js
// HTTP-абстракция над источником задач.
// Возвращает унифицированный клиент: get/post/merge + listApi() + apiBase.
// Digest-логика уже встроена в базовый клиент:
//   - main → apiClient (axios, прокси /api, digest через contextinfo)
//
// Источник задач один — список Tasks на этом сайте, поэтому ветка клиента сайта
// ДОБ удалена вместе с приложением «Заявки ДОБ и задачи» (2026-10-16).

import apiClient from "../api";

/**
 * @typedef {object} SourceClient
 * @property {string} name           — id источника
 * @property {string} apiBase        — базовый URL для запросов
 * @property {() => string|Promise<string>} listApi — путь к списку (для buildTaskListQuery)
 * @property {(url: string, opts?: any) => Promise<{data:any}>} get
 * @property {(url: string, body?: any, opts?: any) => Promise<{data:any}>} post
 * @property {(url: string, body?: any, opts?: any) => Promise<{data:any}>} merge
 */

const MERGE_HEADERS = { "X-HTTP-Method": "MERGE", "If-Match": "*" };

/**
 * Приводит путь к виду, пригодному для передачи в axios-инстанс источника.
 *
 * Правила (см. ADR docs/decisions/dob-task-sources.md, «Lesson learned»):
 *   1. Абсолютный http(s)-URL оставляем как есть, если apiBase абсолютный.
 *      Если apiBase относительный (прокси в dev: "/api", "/dob-api/…") —
 *      отрезаем origin, чтобы запрос ушёл через прокси, а не напрямую.
 *   2. Путь уже с префиксом прокси ("/api/…", "/dob-api/…") — не трогаем.
 *   3. Иначе — префиксуем apiBase источника ("" для main, dobApiBase() для dob).
 *
 * @param {string} apiBase
 * @param {string} url
 * @returns {string}
 */
export function toRequestUrl(apiBase, url) {
  if (!url || typeof url !== "string") return url;
  const isAbsolute = /^https?:\/\//i.test(url);
  if (isAbsolute) {
    if (apiBase && apiBase.startsWith("/")) {
      try {
        const u = new URL(url);
        return `${u.pathname}${u.search}`;
      } catch {
        return url;
      }
    }
    return url;
  }
  if (url.startsWith("/api/") || url.startsWith("/dob-api/")) return url;
  if (!apiBase) return url;
  if (url.startsWith(apiBase)) return url; // защита от двойного префикса
  return `${apiBase}${url.startsWith("/") ? url : `/${url}`}`;
}

/**
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null, resolveListApi?:(() => string|Promise<string>)|null}} source
 * @returns {SourceClient}
 */
export function makeSourceClient(source) {
  if (!source || !source.id || !source.clientKind) {
    throw new Error(`[sourceClient] invalid source: ${JSON.stringify(source)}`);
  }
  if (source.clientKind === "main") {
    // apiClient уже имеет baseURL = "/api" (см. src/api/sharepoint/client.js),
    // поэтому apiBase="" — fetchTasksForSource не должен префиксовать URL,
    // иначе получится "/api/api/..." → 404.
    return {
      name: source.id,
      apiBase: "",
      toRequestUrl: (url) => toRequestUrl("", url),
      listApi: () => source.listApi || "",
      get: (url, opts) => apiClient.get(url, opts),
      post: (url, body, opts) => apiClient.post(url, body, opts),
      merge: (url, body, opts) =>
        apiClient.post(url, body, {
          ...(opts || {}),
          headers: { ...(opts?.headers || {}), ...MERGE_HEADERS },
        }),
    };
  }
  throw new Error(`[sourceClient] unknown clientKind: ${source.clientKind}`);
}