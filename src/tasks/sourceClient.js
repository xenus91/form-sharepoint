// src/tasks/sourceClient.js
// HTTP-абстракция над источником задач.
// Возвращает унифицированный клиент: get/post/merge + listApi() + apiBase.
// Digest-логика уже встроена в базовых клиентах:
//   - main → apiClient (axios, прокси /api, digest через contextinfo)
//   - dob  → dobAxios (axios, прокси /dob-api, digest через getDobDigest())
//
// План: см. artifacts/plan.md (этап 1).

import apiClient from "../api";
import {
  dobAxios,
  dobApiBase,
  // NOTE: getDobDigest() вызывается автоматически интерцептором dobAxios.
} from "../features/dob/api/dobClient";

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
  if (source.clientKind === "dob") {
    // dobAxios НЕ имеет baseURL (см. src/features/dob/api/dobClient.js),
    // поэтому apiBase берётся из dobApiBase() и URL префиксуется в fetchTasksForSource.
    return {
      name: source.id,
      apiBase: dobApiBase(),
      listApi: async () => {
        if (source.listApi) return source.listApi;
        if (source.resolveListApi) return await source.resolveListApi();
        throw new Error(`[sourceClient:${source.id}] no listApi / resolveListApi`);
      },
      get: (url, opts) => dobAxios.get(url, opts),
      post: (url, body, opts) => dobAxios.post(url, body, opts),
      merge: (url, body, opts) =>
        dobAxios.post(url, body, {
          ...(opts || {}),
          headers: { ...(opts?.headers || {}), ...MERGE_HEADERS },
        }),
    };
  }
  throw new Error(`[sourceClient] unknown clientKind: ${source.clientKind}`);
}