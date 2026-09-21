// src/services/taskTypeConfiguration.js
// Phase 2.1 — TaskTypeConfiguration resolver (VERIFIED-ready, tenant audit pending)
// SharePoint список TaskTypeConfiguration (если существует) хранит per-CT маппинг:
// Title, ContentTypeId (Text, full StringValue 0x0108...), ResultFieldInternalName, AdditionalActionsFieldInternalName, Required
// Graceful fallback: если список отсутствует (404) → возвращает пустой Map → используется sharepoint-metadata (одно поле AdditionalActions).
// Кэш: memory + sessionStorage, TTL 30м (конфигурация меняется редко, но быстрее чем 24ч resultField).

import { TASKS_LIST_API } from "../tasks/config";

const LIST_TITLE = "TaskTypeConfiguration";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30м
const STORAGE_KEY = "sp:taskTypeConfig:map";
const STORAGE_AT = "sp:taskTypeConfig:at";

let _cache = null; // Map<string CtId -> { contentTypeId, resultFieldInternalName, additionalActionsFieldInternalName, required, title, id }>
let _cacheAt = 0;

function getStorage() {
  try { if (typeof sessionStorage !== "undefined") return sessionStorage; } catch {}
  return null;
}

function loadFromStorage() {
  try {
    const s = getStorage();
    if (!s) return;
    const raw = s.getItem(STORAGE_KEY);
    const at = s.getItem(STORAGE_AT);
    if (raw && at) {
      const atNum = Number(at);
      if (Date.now() - atNum < CACHE_TTL_MS) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _cache = new Map(parsed);
          _cacheAt = atNum;
        }
      }
    }
  } catch {}
}

function saveToStorage() {
  try {
    const s = getStorage();
    if (!s || !_cache) return;
    s.setItem(STORAGE_KEY, JSON.stringify(Array.from(_cache.entries())));
    s.setItem(STORAGE_AT, String(_cacheAt));
  } catch {}
}

export function clearTaskTypeConfigCache() {
  _cache = null;
  _cacheAt = 0;
  try {
    const s = getStorage();
    s?.removeItem(STORAGE_KEY);
    s?.removeItem(STORAGE_AT);
  } catch {}
}

/**
 * Загружает TaskTypeConfiguration items → Map<ContentTypeId, config>
 * @param {import('axios').AxiosInstance} apiClient
 * @param {{ forceRefresh?: boolean }} opts
 * @returns {Promise<Map<string, { contentTypeId:string, resultFieldInternalName:string|null, additionalActionsFieldInternalName:string|null, required:boolean|null, title:string, id:number }>|null>}
 *  null = список не существует (fallback), Map пустой = список существует но без items.
 */
export async function fetchTaskTypeConfigurationMap(apiClient, opts = {}) {
  const { forceRefresh = false } = opts;
  loadFromStorage();
  if (!forceRefresh && _cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache;
  }

  const url = `/_api/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,ContentTypeId,ResultFieldInternalName,AdditionalActionsFieldInternalName,Required&$top=100`;
  try {
    const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" }, __noCache: forceRefresh });
    const results = data?.d?.results || [];
    const map = new Map();
    for (const item of results) {
      const ctId = String(item.ContentTypeId || "").trim();
      if (!ctId) continue;
      // Required may be string Да/Нет or boolean
      let required = null;
      if (item.Required !== undefined && item.Required !== null && item.Required !== "") {
        const v = String(item.Required).trim().toLowerCase();
        if (v === "да" || v === "true" || v === "1" || v === "yes") required = true;
        else if (v === "нет" || v === "false" || v === "0" || v === "no") required = false;
        else required = Boolean(item.Required);
      }
      map.set(ctId, {
        contentTypeId: ctId,
        resultFieldInternalName: item.ResultFieldInternalName ? String(item.ResultFieldInternalName).trim() : null,
        additionalActionsFieldInternalName: item.AdditionalActionsFieldInternalName ? String(item.AdditionalActionsFieldInternalName).trim() : null,
        required,
        title: item.Title || "",
        id: item.Id,
      });
    }
    _cache = map;
    _cacheAt = Date.now();
    saveToStorage();
    return map;
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404) {
      // Список не существует — это нормально до аудита/решения B
      _cache = null;
      _cacheAt = Date.now();
      // не кэшируем null надолго — allow retry через TTL, но не писать в storage чтобы следующая проверка могла найти созданный список
      console.info(`[taskTypeConfiguration] list '${LIST_TITLE}' not found (404) — fallback to sharepoint-metadata (single AdditionalActions)`);
      return null;
    }
    console.warn(`[taskTypeConfiguration] fetch failed ${status}`, e?.message);
    // fallback to previous cache if exists
    if (_cache) return _cache;
    _cache = new Map();
    _cacheAt = Date.now();
    saveToStorage();
    return _cache;
  }
}

/**
 * Синхронный резолвер с prefix match (дочерний CT startsWith родительского).
 * @param {string} contentTypeId
 * @param {Map<string, any>|null} map
 * @returns {object|null}
 */
export function resolveTaskTypeConfig(contentTypeId, map) {
  if (!contentTypeId || !map || map.size === 0) return null;
  const ctId = String(contentTypeId).trim();
  if (map.has(ctId)) return map.get(ctId);
  // longest prefix
  let best = null;
  let bestLen = -1;
  for (const [key, val] of map.entries()) {
    if (ctId.startsWith(key) && key.length > bestLen) {
      best = val;
      bestLen = key.length;
    }
  }
  return best;
}

export const TASK_TYPE_CONFIG_LIST_TITLE = LIST_TITLE;
