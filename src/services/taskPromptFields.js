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
const STORAGE_KEY = "sp:taskPromptFields:map:v1";
const STORAGE_AT = "sp:taskPromptFields:at:v1";

let _cache = null; // { byKey: Map<`${ctId}|${res}`, fields[]>, byCtWildcard: Map<ctId, fields[]>, globalWildcard: fields[], globalByKey: Map<res, fields[]>, raw: Array }
let _cacheAt = 0;

function getStorage() {
  try { if (typeof sessionStorage !== "undefined") return sessionStorage; } catch {}
  return null;
}

function loadFromStorage() {
  try {
    const s = getStorage(); if (!s) return;
    const raw = s.getItem(STORAGE_KEY); const at = s.getItem(STORAGE_AT);
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
  } catch {}
}

export function clearTaskPromptFieldsCache() {
  _cache = null;
  _cacheAt = 0;
  try {
    const s = getStorage();
    s?.removeItem(STORAGE_KEY);
    s?.removeItem(STORAGE_AT);
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
  if (!forceRefresh && _cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;

  try {
    const { data } = await fetchWithCtypeFallback(apiClient, forceRefresh);
    const results = data?.d?.results || [];
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
  if (!defs) return [];
  const ctId = normCtype(contentTypeId);
  const n = norm(resultValue);

  // L1: exact CT × exact ResultValue
  if (ctId) {
    const k = `${ctId}|${n}`;
    if (defs.byKey.has(k)) {
      const arr = defs.byKey.get(k);
      if (arr.length) return arr;
    }
  }

  // L2: prefix CT (longest match) × exact ResultValue
  if (ctId && defs.byKey.size) {
    let best = null, bestLen = -1;
    for (const [key, arr] of defs.byKey.entries()) {
      const pipeIdx = key.lastIndexOf("|");
      if (pipeIdx < 0) continue;
      const ctKey = key.slice(0, pipeIdx);
      const resKey = key.slice(pipeIdx + 1);
      if (resKey !== n) continue;
      if (ctId.startsWith(ctKey) && ctKey.length > bestLen && arr.length) {
        best = arr;
        bestLen = ctKey.length;
      }
    }
    if (best) return best;
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
    if (best) return best;
  }

  // L4: global wildcard (no CT, ResultValue=*)
  if (defs.globalWildcard.length) return defs.globalWildcard;

  // L5: global exact (no CT, specific ResultValue)
  if (defs.globalByKey.has(n)) {
    const arr = defs.globalByKey.get(n);
    if (arr.length) return arr;
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
}