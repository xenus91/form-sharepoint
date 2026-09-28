// src/services/taskBehaviour.js
// Сервис, объединяющий список `TaskBehaviour` + lookup-поле `BehaviourConfig` на ContentType.
//
// Структура списка (см. plan §1.1):
//   Title, Behaviour (multi-line JSON), StylingResultButton (multi-line JSON),
//   Description, Enabled.
//
// Lookup-поле на ContentType (см. plan §1.2):
//   BehaviourConfig — Lookup → TaskBehaviour:Id; дефолт на CT задаёт нужный configId.
//
// Кэш: sessionStorage `sp:taskBehaviour:map:v1` + fingerprint `sp:taskBehaviour:fp:v1`.
// Если remote fingerprint отличается — invalidate и идём в основной fetch.
// При ошибке сети — cache не трогаем (rate-limit 30s на GET fingerprint).

import { parseBehaviour } from "./behaviourParser";
import { parseStyling } from "./stylingConfig";

const LIST_TITLE = "TaskBehaviour";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30м — кэш конфигов живёт долго, fingerprint ловит апдейты быстрее
const STORAGE_KEY = "sp:taskBehaviour:map:v1";
const STORAGE_AT = "sp:taskBehaviour:at:v1";
const STORAGE_FP = "sp:taskBehaviour:fp:v1";
const FIELD_INTERNAL_BEHAVIOUR = "Behaviour";
const FIELD_INTERNAL_STYLING = "StylingResultButton";

/** @type {Map<number, {id:number,title:string,description:string,behaviour:string,styling:string,enabled:boolean,modified:string}> | null} */
let _cache = null; // Map<configId, rawRecord>
let _cacheAt = 0;
let _cacheFingerprint = "";
let _lastFingerprintCheckAt = 0;

function getStorage() {
  try { if (typeof sessionStorage !== "undefined") return sessionStorage; } catch {}
  return null;
}

function parseBool(v, fallback = true) {
  if (v === undefined || v === null || v === "") return fallback;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  const s = String(v).trim().toLowerCase();
  if (s === "да" || s === "true" || s === "yes") return true;
  if (s === "нет" || s === "false" || s === "no") return false;
  return fallback;
}

function loadFromStorage() {
  try {
    const s = getStorage(); if (!s) return;
    const raw = s.getItem(STORAGE_KEY);
    const at = s.getItem(STORAGE_AT);
    const fp = s.getItem(STORAGE_FP);
    if (!raw || !at) return;
    const atNum = Number(at);
    if (Date.now() - atNum >= CACHE_TTL_MS) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records)) return;
    const m = new Map();
    for (const r of parsed.records) {
      if (r && typeof r.id === "number") m.set(r.id, r);
    }
    _cache = m;
    _cacheAt = atNum;
    _cacheFingerprint = typeof fp === "string" ? fp : "";
  } catch {}
}

function saveToStorage() {
  try {
    const s = getStorage(); if (!s || !_cache) return;
    const records = Array.from(_cache.values());
    s.setItem(STORAGE_KEY, JSON.stringify({ records }));
    s.setItem(STORAGE_AT, String(_cacheAt));
    s.setItem(STORAGE_FP, _cacheFingerprint || "");
  } catch {}
}

/** Лёгкий GET только Id,Modified,Enabled — для fingerprint-сравнения. */
async function fetchFingerprint(apiClient) {
  try {
    const url = `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Modified,Enabled&$top=500`;
    const { data } = await apiClient.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
      __noCache: true,
    });
    const results = data?.d?.results || [];
    const sig = results.map((r) => `${r.Id || ""}=${r.Modified || ""}=${parseBool(r.Enabled, true) ? "1" : "0"}`).sort().join(";");
    return sig;
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404) return null; // список отсутствует — fallback в legacy-слои
    throw e;
  }
}

/**
 * Проверяет, изменился ли remote fingerprint. Если да, invalidate cache и force-fetch на следующем вызове.
 * Возвращает true если cache был invalidated.
 */
async function isFingerprintChanged(apiClient) {
  if (!_cache) return false;
  if (Date.now() - _lastFingerprintCheckAt < 30 * 1000) return false; // rate-limit
  _lastFingerprintCheckAt = Date.now();
  let remoteSig;
  try {
    remoteSig = await fetchFingerprint(apiClient);
  } catch (e) {
    if (typeof window !== "undefined" && window.__forceTaskDbg) console.warn("[taskBehaviour] fingerprint fetch failed", e?.message);
    return false;
  }
  if (remoteSig === null) return false;
  if (remoteSig !== _cacheFingerprint) {
    if (typeof window !== "undefined" && window.__forceTaskDbg) {
      console.log("[taskBehaviour] remote data changed → invalidate cache", {
        cached: _cacheFingerprint ? _cacheFingerprint.slice(0, 80) + "…" : "(empty)",
        remote: remoteSig.slice(0, 80) + "…",
      });
    }
    _cache = null;
    _cacheAt = 0;
    _cacheFingerprint = "";
    try {
      const ss = getStorage();
      ss?.removeItem(STORAGE_KEY);
      ss?.removeItem(STORAGE_AT);
      ss?.removeItem(STORAGE_FP);
    } catch {}
    return true;
  }
  return false;
}

export function clearTaskBehaviourCache() {
  _cache = null;
  _cacheAt = 0;
  _cacheFingerprint = "";
  _lastFingerprintCheckAt = 0;
  try {
    const s = getStorage();
    s?.removeItem(STORAGE_KEY);
    s?.removeItem(STORAGE_AT);
    s?.removeItem(STORAGE_FP);
  } catch {}
}

/**
 * Тянет записи TaskBehaviour из SP, возвращает Map<configId, rawRecord>.
 * @param {object} apiClient
 * @param {{forceRefresh?: boolean}} [opts]
 * @returns {Promise<Map<number, {id:number,title:string,description:string,behaviour:string,styling:string,enabled:boolean,modified:string}> | null>}
 *          null если список 404 (отсутствует)
 */
export async function fetchTaskBehaviour(apiClient, opts = {}) {
  const { forceRefresh = false } = opts;
  loadFromStorage();
  if (!forceRefresh && _cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    // Синхронная fingerprint-проверка — если SP изменился, обнулить кэш и пойти в fetch
    const changed = await isFingerprintChanged(apiClient);
    if (!changed) return _cache;
  }

  try {
    const url = `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,Description,${FIELD_INTERNAL_BEHAVIOUR},${FIELD_INTERNAL_STYLING},Enabled,Modified&$top=500`;
    const { data } = await apiClient.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
      __noCache: forceRefresh,
    });
    const results = data?.d?.results || [];
    const remoteSig = results
      .map((r) => `${r.Id || ""}=${r.Modified || ""}=${parseBool(r.Enabled, true) ? "1" : "0"}`)
      .sort()
      .join(";");
    const m = new Map();
    for (const r of results) {
      if (!r || typeof r.Id !== "number") continue;
      m.set(r.Id, {
        id: r.Id,
        title: String(r.Title || "").trim(),
        description: String(r.Description || "").trim(),
        behaviour: String(r[FIELD_INTERNAL_BEHAVIOUR] || ""),
        styling: String(r[FIELD_INTERNAL_STYLING] || ""),
        enabled: parseBool(r.Enabled, true),
        modified: String(r.Modified || ""),
      });
    }
    _cache = m;
    _cacheAt = Date.now();
    _cacheFingerprint = remoteSig;
    saveToStorage();

    if (typeof window !== "undefined" && window.__forceTaskDbg) {
      console.log("[DBG:taskBehaviour:fetch] parsed", {
        resultsCount: results.length,
        byConfigIdSize: m.size,
        fingerprint: remoteSig.slice(0, 60) + (remoteSig.length > 60 ? "…" : ""),
      });
    }
    return _cache;
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404) {
      if (typeof window !== "undefined" && window.__forceTaskDbg) {
        console.info(`[taskBehaviour] list '${LIST_TITLE}' not found (404) — fallback to legacy layers`);
      }
      _cache = null;
      _cacheAt = Date.now();
      return null;
    }
    if (typeof window !== "undefined" && window.__forceTaskDbg) console.warn(`[taskBehaviour] fetch failed ${status}`, e?.message);
    if (_cache) return _cache;
    _cache = new Map();
    _cacheAt = Date.now();
    saveToStorage();
    return _cache;
  }
}

/**
 * Резолвер Behaviour+Styling для CT по маппингу CT.Name → TaskBehaviour.Title.
 * На вход:
 *   - ctName: имя CT (например "Исправление проблемной ЕО")
 *   - taskBehaviourMap: Map<configId, rawRecord> из fetchTaskBehaviour
 *
 * Сравнение нормализованное (trim + lowercase), точное.
 * Если есть несколько матчей — первый enabled.
 * Возвращает { configId, raw, behaviour:{ok,value,error}, styling:{ok,value,error}, matchedBy }
 * или null если ничего не нашли или найденный disabled.
 */
function normForName(s) {
  return String(s || "").trim().toLowerCase();
}

export function resolveTaskBehaviourByName(ctName, taskBehaviourMap) {
  if (!ctName || !taskBehaviourMap || taskBehaviourMap.size === 0) return null;
  const target = normForName(ctName);
  let rec = null;
  for (const r of taskBehaviourMap.values()) {
    if (!r.enabled) continue;
    if (normForName(r.title) === target) { rec = r; break; }
  }
  if (!rec) return null;
  const behaviour = parseBehaviour(rec.behaviour);
  const styling = parseStyling(rec.styling);
  if (typeof window !== "undefined" && window.__forceTaskDbg) {
    console.log("[DBG:resolveTaskBehaviourByName]", {
      ctName, matchedTitle: rec.title, configId: rec.id,
      behaviourOk: behaviour.ok, behaviourError: behaviour.error,
      stylingOk: styling.ok, stylingError: styling.error,
    });
  }
  return { configId: rec.id, raw: rec, behaviour, styling, matchedBy: "name" };
}

/**
 * ⚠️ DEPRECATED: lookup-поле BehaviourConfig на CT нельзя снабдить default-значением
 * (ограничение SharePoint). Используйте resolveTaskBehaviourByName(ctName, map) с
 * маппингом CT.Name → TaskBehaviour.Title. Эта функция оставлена только как stub,
 * всегда возвращает null, чтобы старые вызовы в TaskCard не падали.
 */
export function resolveTaskBehaviour(contentType, taskBehaviourMap) {
  if (typeof window !== "undefined" && window.__forceTaskDbg) {
    console.warn("[taskBehaviour] resolveTaskBehaviour deprecated — use resolveTaskBehaviourByName(ctName, map)");
  }
  return null;
}

/**
 * Возвращает CT-мета из ctMetaMap (или ctConfigMap) для текущего CT.
 * Поиск по полному CT-Id или по укороченному (prefix-match по SP-конвенции).
 * @param {string} contentTypeId
 * @param {Map<string, object> | null} ctMetaMap — Map<ctId, {name, stringId}> из useTaskConfiguration
 * @returns {object|null} CT-мета с .name или null
 */
export function findContentTypeMeta(contentTypeId, ctMetaMap) {
  if (!contentTypeId || !ctMetaMap || ctMetaMap.size === 0) return null;
  const fullKey = String(contentTypeId).toLowerCase();
  if (ctMetaMap.has(fullKey)) return ctMetaMap.get(fullKey);
  // Prefix-lookup: SP может отдать CT-Id укороченным до родителя
  let best = null;
  let bestLen = -1;
  for (const k of ctMetaMap.keys()) {
    if (fullKey.startsWith(k) && k.length > bestLen) { best = ctMetaMap.get(k); bestLen = k.length; }
  }
  return best;
}

/** Получить отладочное состояние (cache hit/miss, fingerprint и т.п.). */
export function getTaskBehaviourDebug() {
  return {
    size: _cache?.size || 0,
    age_ms: _cacheAt ? Date.now() - _cacheAt : null,
    fingerprint: _cacheFingerprint ? _cacheFingerprint.slice(0, 60) + (_cacheFingerprint.length > 60 ? "…" : "") : "(empty)",
    lastCheckAge_ms: _lastFingerprintCheckAt ? Date.now() - _lastFingerprintCheckAt : null,
  };
}

export const TASK_BEHAVIOUR_LIST_TITLE = LIST_TITLE;

// Debug helpers
if (typeof window !== "undefined") {
  window.__debugTaskBehaviour = async (apiClientParam) => {
    const client = apiClientParam || (await import("../api/sharepoint/client.js").then((m) => m.default).catch(() => null));
    if (!client) { console.warn("apiClient not available"); return; }
    try {
      const { data } = await client.get(
        `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,Description,Behaviour,StylingResultButton,Enabled,Modified&$top=10`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      console.log("[DBG:items] TaskBehaviour sample", data?.d?.results);
    } catch (e) { console.error("items fetch failed", e?.response?.data); }
  };

  window.__taskBehaviourForceRefresh = async (apiClientParam) => {
    const client = apiClientParam || (await import("../api/sharepoint/client.js").then((m) => m.default).catch(() => null));
    if (!client) { console.warn("apiClient not available"); return null; }
    clearTaskBehaviourCache();
    try {
      const fresh = await fetchTaskBehaviour(client, { forceRefresh: true });
      console.log("[taskBehaviour] force-refresh complete", {
        size: fresh?.size || 0,
        fingerprint: _cacheFingerprint.slice(0, 60) + (_cacheFingerprint.length > 60 ? "…" : ""),
      });
      return fresh;
    } catch (e) {
      console.error("[taskBehaviour] force-refresh failed", e?.response?.data || e?.message);
      return null;
    }
  };

  // ⭐ Верификация маппинга CT.Name → TaskBehaviour.Title.
  // Вызов: await __listTaskBehaviourMappings() — печатает в консоль таблицу всех CT и их matched-записей.
  // Полезно после правок в SP для проверки, что маппинг работает.
  window.__listTaskBehaviourMappings = async () => {
    const client = await import("../api/sharepoint/client.js").then((m) => m.default).catch(() => null);
    if (!client) { console.warn("apiClient not available"); return; }
    const { fetchContentTypeMeta } = await import("../tasks/resultField");
    const ctMetaMap = await fetchContentTypeMeta(client, { forceRefresh: true });
    const tbMap = await fetchTaskBehaviour(client, { forceRefresh: true });
    console.log("=== TaskBehaviour mapping table ===");
    if (!ctMetaMap || ctMetaMap.size === 0) console.log("(нет ctMetaMap — ContentType метаданные не загружены)");
    if (!tbMap || tbMap.size === 0) console.log("(нет TaskBehaviour записей)");
    const rows = [];
    if (ctMetaMap) {
      for (const [ctId, meta] of ctMetaMap.entries()) {
        const target = String(meta.name || "").trim().toLowerCase();
        let found = null;
        if (tbMap) {
          for (const r of tbMap.values()) {
            if (String(r.title || "").trim().toLowerCase() === target) { found = r; break; }
          }
        }
        rows.push({
          ctId: ctId.length > 24 ? "…" + ctId.slice(-22) : ctId,
          ctName: meta.name,
          matched: found ? `${found.id} — "${found.title}"` : "(нет)",
          enabled: found ? !!found.enabled : false,
        });
      }
    }
    console.table(rows);
    const matchedCount = rows.filter((r) => r.matched !== "(нет)").length;
    console.log(`Итого: ${matchedCount}/${rows.length} CT имеют matching TaskBehaviour-запись`);
    return rows;
  };
}