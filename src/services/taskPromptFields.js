// src/services/taskPromptFields.js
// Гибкий список SharePoint для promptable-полей per (ContentType × ResultValue).
//
// Поля списка (контракт):
//   Title (Text) — опционально, человеко-итаемое имя
//   CType (Text, full 0x0108...) — ContentTypeId. Пусто = global default
//   ResultValue (Text) — нормализованный choice (lowercase). "*" = wildcard для всех
//   FieldInternalName (Text) — internal name поля в списке Tasks (например Location1, Comment, ScanCode)
//   FieldTitle (Text) — заголовок для UI
//   FieldType (Text, опц.) — "text" / "multiline". Default "text"
//   Required (Yes/No) — обязательно ли поле
//   SortOrder (Number) — порядок отображения
//   Enabled (Yes/No) — фильтр
//
// Graceful 404 → null (fallback на resultConfig.js в downstream).
// Кэш 30м, сессионное хранилище.

const LIST_TITLE = "TaskPromptFields";
const CACHE_TTL_MS = 30 * 60 * 1000;
// ⭐ FIX: версия v3 — добавлен fingerprint (sorted Id+Modified) для авто-инвалидации
// при изменении данных в SharePoint. Старые v2 ключи игнорируются.
const STORAGE_KEY = "sp:taskPromptFields:map:v3";
const STORAGE_AT = "sp:taskPromptFields:at:v3";
const STORAGE_FP = "sp:taskPromptFields:fp:v3";

let _cache = null; // { byKey: Map<`${ctId}|${res}`, fields[]>, byCtWildcard: Map<ctId, fields[]>, globalWildcard: fields[], globalByKey: Map<res, fields[]>, raw: Array, fingerprint: string }
let _cacheAt = 0;
let _cacheFingerprint = ""; // sorted "Id=Modified" hash для авто-инвалидации
let _lastFingerprintCheckAt = 0; // для rate-limit частых GET проверок

function getStorage() {
  try { if (typeof sessionStorage !== "undefined") return sessionStorage; } catch {}
  return null;
}

function loadFromStorage() {
  try {
    const s = getStorage(); if (!s) return;
    const raw = s.getItem(STORAGE_KEY); const at = s.getItem(STORAGE_AT);
    const fp = s.getItem(STORAGE_FP);
    if (raw && at) {
      const atNum = Number(at);
      if (Date.now() - atNum < CACHE_TTL_MS) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.byKey && parsed.byCtWildcard && parsed.globalWildcard && parsed.globalByKey) {
          _cache = {
            byKey: new Map(parsed.byKey),
            byCtWildcard: new Map(parsed.byCtWildcard),
            globalWildcard: Array.isArray(parsed.globalWildcard) ? parsed.globalWildcard : [],
            globalByKey: new Map(parsed.globalByKey),
            raw: Array.isArray(parsed.raw) ? parsed.raw : [],
          };
          _cacheAt = atNum;
          _cacheFingerprint = typeof fp === "string" ? fp : "";
        }
      }
    }
  } catch {}
}

function saveToStorage() {
  try {
    const s = getStorage(); if (!s || !_cache) return;
    s.setItem(STORAGE_KEY, JSON.stringify({
      byKey: Array.from(_cache.byKey.entries()),
      byCtWildcard: Array.from(_cache.byCtWildcard.entries()),
      globalWildcard: _cache.globalWildcard,
      globalByKey: Array.from(_cache.globalByKey.entries()),
      raw: _cache.raw,
    }));
    s.setItem(STORAGE_AT, String(_cacheAt));
    s.setItem(STORAGE_FP, _cacheFingerprint || "");
  } catch {}
}

// ⭐ Лёгкая проверка fingerprint через SharePoint: SELECT Id,Modified,Enabled WHERE Enabled=1.
// Возвращает отсортированную строку "Id1=Mod1;Id2=Mod2;…" — детерминированный хэш набора записей.
async function fetchFingerprint(apiClient) {
  try {
    const url = `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Modified,Enabled&$filter=Enabled eq 1&$top=500`;
    const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
    const results = data?.d?.results || [];
    const sig = results
      .map((r) => `${r.Id || ""}=${r.Modified || ""}`)
      .sort()
      .join(";");
    return sig;
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404) return null; // список не существует — fallback в resultConfig.js
    throw e;
  }
}

// Проверяет, не изменились ли данные в SP, и если да — обнуляет кэш (форсирует рефетч).
// Возвращает true если кэш был invalidated (вызывающий код должен пойти в основной fetch).
// При ошибке/timeout — не invalidate (cache остаётся валидным).
async function isFingerprintChanged(apiClient) {
  if (!_cache) return false;
  // Rate-limit: проверяем fingerprint не чаще 1 раза / 30s чтобы не DDoS-ить SP
  // при множественных вызовах из useTaskConfiguration + cache hit.
  if (Date.now() - _lastFingerprintCheckAt < 30 * 1000) return false;
  _lastFingerprintCheckAt = Date.now();
  let remoteSig;
  try {
    remoteSig = await fetchFingerprint(apiClient);
  } catch (e) {
    // Не валидируем кэш при ошибке сети — оставляем как есть до следующего раза
    return false;
  }
  if (remoteSig === null) return false; // 404, не трогаем
  if (remoteSig !== _cacheFingerprint) {
    console.log("[taskPromptFields] remote data changed → invalidate cache", {
      cached: _cacheFingerprint ? _cacheFingerprint.slice(0, 80) + "…" : "(empty)",
      remote: remoteSig.slice(0, 80) + "…",
    });
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

export function clearTaskPromptFieldsCache() {
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

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// SharePoint ContentTypeId хранится в hex (lowercase в нашем коде), но реальный JSON-ответ может
// содержать uppercase вариант. Нормализуем CType к lowercase чтобы матчинг был детерминирован
// и не падал из-за капса.
function normCtype(s) {
  return String(s || "").trim().toLowerCase();
}

function parseBool(v, fallback = false) {
  if (v === undefined || v === null || v === "") return fallback;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  const s = String(v).trim().toLowerCase();
  if (s === "да" || s === "true" || s === "yes" || s === "1") return true;
  if (s === "нет" || s === "false" || s === "no" || s === "0") return false;
  return fallback;
}

function parseFieldType(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "multiline" || s === "multi" || s === "textarea") return "multiline";
  return "text";
}

function getCtypeFromItem(item) {
  const v = item.CType ?? item.ContentTypeId0 ?? item.ContentTypeId;
  return normCtype(v);
}

function isWildcardResultValue(v) {
  return norm(v) === "*";
}

// Пробуем разные варианты internal-имени CType (CType / ContentTypeId0 / ContentTypeId)
// с graceful fallback при 400 "field not found".
async function fetchWithCtypeFallback(apiClient, forceRefresh) {
  const base = `/web/lists/getbytitle('${LIST_TITLE}')/items`;
  const sel = "Id,Title,CType,ResultValue,FieldInternalName,FieldTitle,FieldType,Required,SortOrder,Enabled";
  const ctypeVariants = ["CType", "ContentTypeId0", "ContentTypeId"];
  let lastErr = null;
  for (const ctype of ctypeVariants) {
    const url = `${base}?$select=${sel.replace(/CType/g, ctype)}&$filter=Enabled eq 1&$top=500&$orderby=SortOrder asc`;
    try {
      const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" }, __noCache: forceRefresh });
      return { data, ctype };
    } catch (e) {
      const status = e?.response?.status;
      const msg = String(e?.message || "") + String(e?.response?.data?.error?.message?.value || "");
      const isMissingField = status === 400 && /does not exist|не существует|field.*not found|column.*not found/i.test(msg);
      if (isMissingField) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr;
}

export async function fetchTaskPromptFields(apiClient, opts = {}) {
  const { forceRefresh = false } = opts;
  loadFromStorage();
  if (!forceRefresh && _cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    // ⭐ FIX: синхронная проверка remote fingerprint — если SP изменился, обнулить кэш
    // и НЕ возвращать его, а пойти в основной fetch. Лёгкий SELECT Id,Modified,Enabled
    // — гарантирует что новые правила в SP будут видны в течение секунды после входа в TasksView.
    const changed = await isFingerprintChanged(apiClient);
    if (!changed) return _cache;
    // cache был invalidated — проваливаемся в основной fetch ниже
  }

  try {
    const { data } = await fetchWithCtypeFallback(apiClient, forceRefresh);
    const results = data?.d?.results || [];
    // ⭐ FIX: считаем fingerprint (sorted Id+Modified) для следующих авто-проверок
    const remoteFingerprint = results
      .map((r) => `${r.Id || ""}=${r.Modified || ""}`)
      .sort()
      .join(";");
    const byKey = new Map();          // `${ctId}|${normalizedRes}` → [fields]
    const byCtWildcard = new Map();   // ctId → [fields] (для ResValue=`*`)
    const globalWildcard = [];        // [fields] (для пустого CT, ResValue=`*`)
    const globalByKey = new Map();    // normalizedRes → [fields] (для пустого CT, конкретный ResValue)
    const raw = [];

    for (const item of results) {
      const enabled = parseBool(item.Enabled, true);
      if (!enabled) continue;
      const ctId = getCtypeFromItem(item);
      const resVal = String(item.ResultValue || "").trim();
      if (!resVal) continue;
      const internalName = String(item.FieldInternalName || "").trim();
      if (!internalName) continue;
      const title = String(item.FieldTitle || internalName).trim();
      const type = parseFieldType(item.FieldType);
      const required = parseBool(item.Required, false);
      const sortOrder = item.SortOrder != null ? Number(item.SortOrder) : 999;

      const entry = { internalName, title, type, required, sortOrder };
      raw.push({ ...entry, ctId, resultValue: resVal, id: item.Id, title: item.Title || "" });

      const isWildcard = isWildcardResultValue(resVal);
      const keyNorm = norm(resVal);

      if (ctId && !isWildcard) {
        const key = `${ctId}|${keyNorm}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(entry);
      } else if (ctId && isWildcard) {
        if (!byCtWildcard.has(ctId)) byCtWildcard.set(ctId, []);
        byCtWildcard.get(ctId).push(entry);
      } else if (!ctId && isWildcard) {
        globalWildcard.push(entry);
      } else if (!ctId && !isWildcard) {
        if (!globalByKey.has(keyNorm)) globalByKey.set(keyNorm, []);
        globalByKey.get(keyNorm).push(entry);
      }
    }

    // Сортировка и дедупликация по internalName (последний по SortOrder выигрывает)
    const dedupSort = (arr) => {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
      const seen = new Map();
      for (const f of arr) seen.set(f.internalName, f); // последний перезаписывает
      return Array.from(seen.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    };
    for (const [k, v] of byKey.entries()) byKey.set(k, dedupSort(v));
    for (const [k, v] of byCtWildcard.entries()) byCtWildcard.set(k, dedupSort(v));
    for (const [k, v] of globalByKey.entries()) globalByKey.set(k, dedupSort(v));
    // globalWildcard уже отсортирован через push выше
    globalWildcard.sort((a, b) => a.sortOrder - b.sortOrder);

    _cache = { byKey, byCtWildcard, globalWildcard, globalByKey, raw };
    _cacheAt = Date.now();
    _cacheFingerprint = remoteFingerprint;
    saveToStorage();

    // Debug log (forced, как в других модулях)
    try {
      console.log("[DBG:taskPromptFields:fetch] parsed", {
        resultsCount: results.length,
        rawCount: raw.length,
        byKeySize: byKey.size,
        byCtWildcardSize: byCtWildcard.size,
        globalWildcardSize: globalWildcard.length,
        globalByKeySize: globalByKey.size,
        fingerprint: remoteFingerprint.slice(0, 60) + (remoteFingerprint.length > 60 ? "…" : ""),
      });
    } catch {}

    return _cache;
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404) {
      console.info(`[taskPromptFields] list '${LIST_TITLE}' not found (404) — fallback to resultConfig.js`);
      _cache = null;
      _cacheAt = Date.now();
      return null;
    }
    console.warn(`[taskPromptFields] fetch failed ${status}`, e?.message);
    if (_cache) return _cache;
    _cache = { byKey: new Map(), byCtWildcard: new Map(), globalWildcard: [], globalByKey: new Map(), raw: [] };
    _cacheAt = Date.now();
    saveToStorage();
    return _cache;
  }
}

/**
 * Резолвер по приоритету: exact CT → prefix CT → CT wildcard → global wildcard → global exact → [].
 * НЕ использует substring-match (в отличие от taskResultDefinitions).
 * @param {string} contentTypeId
 * @param {string} resultValue
 * @param {{byKey:Map,byCtWildcard:Map,globalWildcard:Array,globalByKey:Map}|null} defs
 * @returns {Array<{internalName:string,title:string,type:string,required:boolean,sortOrder:number}>}
 */
export function resolvePromptFields(contentTypeId, resultValue, defs) {
  if (!defs) {
    if (typeof window !== "undefined" && (window.__forceTaskDbg || window.__DBG_ENABLED__)) {
      console.warn("[DBG:taskPromptFields:resolve] defs==null → fallback, no fields will be shown", { contentTypeId, resultValue });
    }
    return [];
  }
  const ctId = normCtype(contentTypeId);
  const n = norm(resultValue);

  // L1: exact CT × exact ResultValue
  if (ctId) {
    const k = `${ctId}|${n}`;
    if (defs.byKey.has(k)) {
      const arr = defs.byKey.get(k);
      if (arr.length) {
        if (typeof window !== "undefined" && window.__DBG_ENABLED__) console.log("[DBG:taskPromptFields:resolve] L1 match", { ctId, n, count: arr.length });
        return arr;
      }
    }
  }

  // L2: prefix CT (longest match) × exact ResultValue
  if (ctId && defs.byKey.size) {
    let best = null, bestLen = -1, bestKey = null;
    for (const [key, arr] of defs.byKey.entries()) {
      const pipeIdx = key.lastIndexOf("|");
      if (pipeIdx < 0) continue;
      const ctKey = key.slice(0, pipeIdx);
      const resKey = key.slice(pipeIdx + 1);
      if (resKey !== n) continue;
      if (ctId.startsWith(ctKey) && ctKey.length > bestLen && arr.length) {
        best = arr;
        bestLen = ctKey.length;
        bestKey = key;
      }
    }
    if (best) {
      if (typeof window !== "undefined" && window.__DBG_ENABLED__) console.log("[DBG:taskPromptFields:resolve] L2 prefix match", { ctId, n, matchedKey: bestKey, count: best.length });
      return best;
    }
  }

  // L3: prefix CT × CT wildcard ResultValue=*
  if (ctId && defs.byCtWildcard.size) {
    let best = null, bestLen = -1;
    if (defs.byCtWildcard.has(ctId)) {
      best = defs.byCtWildcard.get(ctId);
      bestLen = ctId.length;
    }
    for (const [key, arr] of defs.byCtWildcard.entries()) {
      if (ctId.startsWith(key) && key.length > bestLen && arr.length) {
        best = arr;
        bestLen = key.length;
      }
    }
    if (best) {
      if (typeof window !== "undefined" && window.__DBG_ENABLED__) console.log("[DBG:taskPromptFields:resolve] L3 ct-wildcard match", { ctId, n, count: best.length });
      return best;
    }
  }

  // L4: global wildcard (no CT, ResultValue=*)
  if (defs.globalWildcard.length) {
    if (typeof window !== "undefined" && window.__DBG_ENABLED__) console.log("[DBG:taskPromptFields:resolve] L4 global wildcard match", { count: defs.globalWildcard.length });
    return defs.globalWildcard;
  }

  // L5: global exact (no CT, specific ResultValue)
  if (defs.globalByKey.has(n)) {
    const arr = defs.globalByKey.get(n);
    if (arr.length) {
      if (typeof window !== "undefined" && window.__DBG_ENABLED__) console.log("[DBG:taskPromptFields:resolve] L5 global exact match", { ctId, n, count: arr.length });
      return arr;
    }
  }

  // ⭐ DBG: no match — выводим полезную информацию чтобы пользователь мог диагностировать
  if (typeof window !== "undefined" && (window.__forceTaskDbg || window.__DBG_ENABLED__)) {
    const availableKeys = Array.from(defs.byKey?.keys?.() || []).slice(0, 20);
    console.warn(
      "[DBG:taskPromptFields:resolve] NO MATCH for (ctId, n).",
      "\n  input:", JSON.stringify({ ctId, n }),
      "\n  byKey size:", defs.byKey?.size || 0,
      "\n  byCtWildcard size:", defs.byCtWildcard?.size || 0,
      "\n  globalWildcard size:", defs.globalWildcard?.length || 0,
      "\n  globalByKey size:", defs.globalByKey?.size || 0,
      "\n  byKey sample keys (first 20):", availableKeys,
      "\n  HINT: Compare ctId with first part of available keys. If the SP record's CType was set with different casing/whitespace, the lowercase normalization should handle it — but if CType format itself differs (e.g. parent vs child id), no match."
    );
  }
  return [];
}

export const TASK_PROMPT_FIELDS_LIST_TITLE = LIST_TITLE;

// Debug helper (аналогично __debugTaskResultDefs)
if (typeof window !== "undefined") {
  window.__debugTaskPromptFields = async (apiClientParam) => {
    const client = apiClientParam || (await import("../api/sharepoint/client.js").then((m) => m.default).catch(() => null));
    if (!client) { console.warn("apiClient not available"); return; }
    try {
      const { data } = await client.get(
        `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,CType,ResultValue,FieldInternalName,FieldTitle,FieldType,Required,SortOrder,Enabled&$filter=Enabled eq 1&$top=500&$orderby=SortOrder asc`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      console.log("[DBG:items] TaskPromptFields sample", data?.d?.results);
    } catch (e) { console.error("items fetch failed", e?.response?.data); }
  };

  // ⭐ FIX: быстрый способ для админа проверить новые правила без ожидания TTL.
  // Вызов: await __taskPromptFieldsForceRefresh() — очистит кэш и вернёт свежие данные.
  window.__taskPromptFieldsForceRefresh = async (apiClientParam) => {
    const client = apiClientParam || (await import("../api/sharepoint/client.js").then((m) => m.default).catch(() => null));
    if (!client) { console.warn("apiClient not available"); return null; }
    clearTaskPromptFieldsCache();
    try {
      const fresh = await fetchTaskPromptFields(client, { forceRefresh: true });
      console.log("[taskPromptFields] force-refresh complete", {
        byKeySize: fresh?.byKey?.size || 0,
        rawCount: fresh?.raw?.length || 0,
        fingerprint: _cacheFingerprint.slice(0, 60) + (_cacheFingerprint.length > 60 ? "…" : ""),
      });
      return fresh;
    } catch (e) {
      console.error("[taskPromptFields] force-refresh failed", e?.response?.data || e?.message);
      return null;
    }
  };
}