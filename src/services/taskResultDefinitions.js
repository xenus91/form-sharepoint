// src/services/taskResultDefinitions.js
// Phase 17 — TaskResultDefinitions SharePoint list (без ребилда)
// Позволяет админу заводить новые Result-значения и их UI-поведение без кода.
// Fallback: если список не существует (404) → используется hardcoded resultConfig.js (RESULT_UI_CONFIG)
// Кэш 30м, graceful 404.

import { RESULT_UI_CONFIG } from "../tasks/resultConfig";

const LIST_TITLE = "TaskResultDefinitions";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskResultDefs:map";
const STORAGE_AT = "sp:taskResultDefs:at";

let _cache = null; // { global: Map<norm, cfg>, byCt: Map<ctId, Map<norm,cfg>>, raw: Array }
let _cacheAt = 0;

function getStorage() { try { if (typeof sessionStorage !== "undefined") return sessionStorage; } catch {} return null; }
function loadFromStorage() {
  try {
    const s = getStorage(); if (!s) return;
    const raw = s.getItem(STORAGE_KEY); const at = s.getItem(STORAGE_AT);
    if (raw && at) {
      const atNum = Number(at);
      if (Date.now() - atNum < CACHE_TTL_MS) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.global && parsed.byCt) {
          _cache = {
            global: new Map(parsed.global),
            byCt: new Map(parsed.byCt.map(([ct, entries]) => [ct, new Map(entries)])),
            raw: parsed.raw || [],
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
      global: Array.from(_cache.global.entries()),
      byCt: Array.from(_cache.byCt.entries()).map(([ct, m]) => [ct, Array.from(m.entries())]),
      raw: _cache.raw,
    }));
    s.setItem(STORAGE_AT, String(_cacheAt));
  } catch {}
}
export function clearTaskResultDefinitionsCache() {
  _cache = null; _cacheAt = 0;
  try { const s=getStorage(); s?.removeItem(STORAGE_KEY); s?.removeItem(STORAGE_AT); } catch {}
}
function norm(s){ return String(s||"").trim().toLowerCase(); }
function parseBool(v){
  if (v===true||v===1||v==="1") return true;
  if (v===false||v===0||v==="0") return false;
  const s=String(v||"").trim().toLowerCase();
  if (s==="да"||s==="true"||s==="yes"||s==="1") return true;
  if (s==="нет"||s==="false"||s==="no"||s==="0") return false;
  return false;
}

/**
 * Fetch TaskResultDefinitions list → {global, byCt, raw}
 * @param {import('axios').AxiosInstance} apiClient
 * @param {{forceRefresh?:boolean}} opts
 * @returns {Promise<{global:Map<string,object>, byCt:Map<string,Map<string,object>>, raw:Array}|null>} null если список не существует
 */
export async function fetchTaskResultDefinitions(apiClient, opts={}){
  const {forceRefresh=false}=opts;
  loadFromStorage();
  if (!forceRefresh && _cache && Date.now()-_cacheAt < CACHE_TTL_MS) return _cache;

  const url = `/_api/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,ResultValue,ContentTypeId,Label,Color,Variant,RequiresLocation,RequiresAdditionalActions,RequiresConfirm,Gradient,SortOrder,IsActive&$top=200&$orderby=SortOrder asc`;
  try {
    const {data}= await apiClient.get(url, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
    const results = data?.d?.results || [];
    const global = new Map();
    const byCt = new Map();
    const raw = [];
    for (const item of results){
      const isActive = item.IsActive===undefined || item.IsActive===null ? true : parseBool(item.IsActive);
      if (!isActive) continue;
      const title = String(item.Title||"").trim();
      const resultValue = String(item.ResultValue||title||"").trim();
      if (!resultValue) continue;
      const key = norm(resultValue);
      const ctId = String(item.ContentTypeId||"").trim();
      const cfg = {
        label: item.Label ? String(item.Label).trim() : title,
        color: item.Color ? String(item.Color).trim().toLowerCase() : "success",
        variant: item.Variant ? String(item.Variant).trim().toLowerCase() : "contained",
        requiresLocation: parseBool(item.RequiresLocation),
        requiresAdditionalActions: parseBool(item.RequiresAdditionalActions),
        confirm: parseBool(item.RequiresConfirm),
        gradient: item.Gradient ? String(item.Gradient).trim() : undefined,
        sortOrder: item.SortOrder!=null ? Number(item.SortOrder) : 999,
        contentTypeId: ctId || null,
        id: item.Id,
        _key: key,
        _title: title,
        _resultValue: resultValue,
      };
      raw.push(cfg);
      if (ctId){
        if (!byCt.has(ctId)) byCt.set(ctId, new Map());
        byCt.get(ctId).set(key, cfg);
      } else {
        global.set(key, cfg);
      }
    }
    _cache = { global, byCt, raw };
    _cacheAt = Date.now();
    saveToStorage();
    return _cache;
  } catch(e){
    const status = e?.response?.status;
    if (status===404){
      console.info(`[taskResultDefinitions] list '${LIST_TITLE}' not found (404) — fallback to resultConfig.js`);
      _cache = null; _cacheAt = Date.now();
      return null;
    }
    console.warn(`[taskResultDefinitions] fetch failed ${status}`, e?.message);
    if (_cache) return _cache;
    _cache = { global:new Map(), byCt:new Map(), raw:[] };
    _cacheAt = Date.now();
    saveToStorage();
    return _cache;
  }
}

/**
 * Resolve UI config for a value, considering per-CT definitions first, then global, then hardcoded RESULT_UI_CONFIG
 * @param {string} choiceValue
 * @param {string} contentTypeId
 * @param {{global:Map, byCt:Map}|null} defs
 * @returns {object} cfg with color/variant/etc
 */
export function resolveResultUiConfig(choiceValue, contentTypeId, defs){
  const n = norm(choiceValue);
  // 1) per-CT definitions
  if (defs && contentTypeId){
    const ctMap = defs.byCt.get(String(contentTypeId).trim());
    if (ctMap && ctMap.has(n)) {
      const cfg = ctMap.get(n);
      return { ...RESULT_UI_CONFIG._default, ...cfg, _key:n, _source:"task-result-definitions-ct" };
    }
    // prefix match for child CT
    let best=null, bestLen=-1;
    for (const [ctKey, map] of defs.byCt.entries()){
      if (String(contentTypeId).startsWith(ctKey) && ctKey.length>bestLen && map.has(n)){
        best = map.get(n); bestLen=ctKey.length;
      }
    }
    if (best) return { ...RESULT_UI_CONFIG._default, ...best, _key:n, _source:"task-result-definitions-ct-prefix" };
  }
  // 2) global definitions
  if (defs && defs.global.has(n)){
    const cfg = defs.global.get(n);
    return { ...RESULT_UI_CONFIG._default, ...cfg, _key:n, _source:"task-result-definitions-global" };
  }
  // 3) try substring match via definitions (e.g., "найдена (в зоне)" → "найдена")
  if (defs){
    for (const [k,v] of defs.global.entries()){
      if (n.includes(k)) return { ...RESULT_UI_CONFIG._default, ...v, _key:k, _source:"task-result-definitions-global-substr" };
    }
    for (const [,map] of defs.byCt.entries()){
      for (const [k,v] of map.entries()){
        if (n.includes(k)) return { ...RESULT_UI_CONFIG._default, ...v, _key:k, _source:"task-result-definitions-ct-substr" };
      }
    }
  }
  // 4) fallback to hardcoded resultConfig.js
  if (RESULT_UI_CONFIG[n]) return { ...RESULT_UI_CONFIG._default, ...RESULT_UI_CONFIG[n], _key:n, _source:"hardcoded" };
  for (const [k,v] of Object.entries(RESULT_UI_CONFIG)){
    if (k==="_default") continue;
    if (n.includes(k)) return { ...RESULT_UI_CONFIG._default, ...v, _key:k, _source:"hardcoded-substr" };
  }
  return { ...RESULT_UI_CONFIG._default, label:String(choiceValue).trim(), _key:"_default", _source:"fallback" };
}

export const TASK_RESULT_DEFINITIONS_LIST_TITLE = LIST_TITLE;
