// TaskBehaviour: единственная загрузка конфигурации, sessionStorage-кэш и CT.Name → Title resolver.
import { parseBehaviour } from "./behaviourParser";
import { parseStyling } from "./stylingConfig";

const LIST_TITLE = "TaskBehaviour";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskBehaviour:map:v2";
const STORAGE_AT = "sp:taskBehaviour:at:v2";
const FIELD_SELECT = "Id,Title,Description,Behaviour,StylingResultButton,StylingActions,Enabled,Modified";
const debugEnabled = () => {
  try { return typeof window !== "undefined" && (new URLSearchParams(location.search).get("dbg") === "1" || localStorage.getItem("dbg_tasks") === "1"); } catch { return false; }
};
const tbDebug = (...args) => { if (debugEnabled()) console.info("[TaskBehaviour]", ...args); };

let cache = null;
let cacheAt = 0;
let inflight = null;

function getStorage() { try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; } }
function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  const valueNorm = String(value).trim().toLowerCase();
  if (["да", "true", "yes"].includes(valueNorm)) return true;
  if (["нет", "false", "no"].includes(valueNorm)) return false;
  return fallback;
}
function normaliseRecord(raw) {
  if (!raw || raw.Id == null) return null;
  return {
    id: Number(raw.Id),
    title: String(raw.Title || "").trim(),
    description: String(raw.Description || "").trim(),
    behaviour: String(raw.Behaviour || ""),
    styling: String(raw.StylingResultButton || ""),
    stylingActions: String(raw.StylingActions || ""),
    enabled: parseBool(raw.Enabled, true),
    modified: String(raw.Modified || ""),
  };
}
function loadFromStorage() {
  try {
    const store = getStorage();
    const at = Number(store?.getItem(STORAGE_AT) || 0);
    const saved = JSON.parse(store?.getItem(STORAGE_KEY) || "null");
    if (!saved || !at || Date.now() - at >= CACHE_TTL_MS || !Array.isArray(saved.records)) return false;
    cache = new Map(saved.records.map((record) => [record.id, record]));
    cacheAt = at;
    return true;
  } catch { return false; }
}
function saveToStorage() {
  try {
    const store = getStorage();
    if (!store || !cache) return;
    store.setItem(STORAGE_KEY, JSON.stringify({ records: [...cache.values()] }));
    store.setItem(STORAGE_AT, String(cacheAt));
  } catch {}
}

/** Получает активные записи одним запросом и сохраняет полный ответ в sessionStorage. */
export async function fetchTaskBehaviour(apiClient, { forceRefresh = false } = {}) {
  if (!forceRefresh && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  if (!forceRefresh && loadFromStorage()) return cache;
  if (!forceRefresh && inflight) return inflight;

  const request = (async () => {
    const url = `/web/lists/getbytitle('${LIST_TITLE}')/items?$filter=Enabled eq 1&$select=${FIELD_SELECT}&$top=500`;
    try {
      const { data } = await apiClient.get(url, {
        headers: { Accept: "application/json;odata=verbose" },
        __noCache: forceRefresh,
      });
      const records = (data?.d?.results || []).map(normaliseRecord).filter(Boolean);
      cache = new Map(records.map((record) => [record.id, record]));
      cacheAt = Date.now();
      saveToStorage();
      tbDebug("loaded", { request: url, count: cache.size, cache: "sessionStorage", fields: FIELD_SELECT });
      return cache;
    } catch (error) {
      tbDebug("request failed", { status: error?.response?.status, message: error?.message });
      if (cache) return cache;
      cache = new Map();
      cacheAt = Date.now();
      return cache;
    }
  })();
  if (!forceRefresh) inflight = request;
  try { return await request; } finally { if (!forceRefresh) inflight = null; }
}
export function clearTaskBehaviourCache() {
  cache = null; cacheAt = 0; inflight = null;
  try { getStorage()?.removeItem(STORAGE_KEY); getStorage()?.removeItem(STORAGE_AT); } catch {}
}
export function getTaskBehaviourDebug() { return { size: cache?.size || 0, age_ms: cacheAt ? Date.now() - cacheAt : null, cached: !!cache }; }
function norm(value) { return String(value || "").trim().toLowerCase(); }

export function resolveTaskBehaviourByName(contentTypeName, taskBehaviourMap) {
  if (!contentTypeName || !taskBehaviourMap?.size) return null;
  const record = [...taskBehaviourMap.values()].find((item) => item.enabled && norm(item.title) === norm(contentTypeName));
  if (!record) return null;
  const behaviour = parseBehaviour(record.behaviour);
  const styling = parseStyling(record.styling);
  tbDebug("resolved", { contentTypeName, title: record.title, id: record.id, behaviourOk: behaviour.ok, stylingOk: styling.ok });
  return { configId: record.id, raw: record, behaviour, styling, matchedBy: "ContentType.Name → TaskBehaviour.Title" };
}

export function findContentTypeMeta(contentTypeId, ctMetaMap) {
  if (!contentTypeId || !ctMetaMap?.size) return null;
  const target = norm(contentTypeId);
  let best = null;
  let bestLength = -1;
  for (const [key, value] of ctMetaMap.entries()) {
    const candidate = norm(key);
    if ((target === candidate || target.startsWith(candidate)) && candidate.length > bestLength) {
      best = value; bestLength = candidate.length;
    }
  }
  return best;
}

export function resolveTaskBehaviour(contentType, taskBehaviourMap) { return null; }
export const TASK_BEHAVIOUR_LIST_TITLE = LIST_TITLE;

// Удобная диагностика без автоматических запросов: await window.__debugTaskBehaviour().
if (typeof window !== "undefined") {
  window.__debugTaskBehaviour = () => getTaskBehaviourDebug();
  window.__taskBehaviourForceRefresh = async (client) => {
    clearTaskBehaviourCache();
    const api = client || (await import("../api/sharepoint/client.js").then((module) => module.default).catch(() => null));
    return api ? fetchTaskBehaviour(api, { forceRefresh: true }) : null;
  };
}
