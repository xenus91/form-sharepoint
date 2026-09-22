// src/services/taskResultDefinitions.js
// Phase 17 — строго по плану §14: TaskResultDefinitions
// Поля списка (план):
// Title (Text), CType (Text), ResultValue (Text), ShowAdditionalActions (Yes/No), AdditionalActionsRequired (Yes/No), SortOrder (Number), Enabled (Yes/No)
// НЕ заменяет реальное Result field (FieldLinks), описывает UI поведение для уже существующих Result values.
// Graceful 404 → fallback к hardcoded resultConfig.js. Кэш 30м.

import { RESULT_UI_CONFIG } from "../tasks/resultConfig";

const LIST_TITLE = "TaskResultDefinitions";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskResultDefs:map:v3";
const STORAGE_AT = "sp:taskResultDefs:at:v3";

let _cache = null; // { global: Map<norm, cfg>, byCt: Map<ctId, Map<norm,cfg>>, raw: Array }
let _cacheAt = 0;

function getStorage(){ try{ if(typeof sessionStorage!=="undefined") return sessionStorage;}catch{} return null; }
function loadFromStorage(){
  try{
    const s=getStorage(); if(!s) return;
    const raw=s.getItem(STORAGE_KEY); const at=s.getItem(STORAGE_AT);
    if(raw && at){
      const atNum=Number(at);
      if(Date.now()-atNum < CACHE_TTL_MS){
        const parsed=JSON.parse(raw);
        if(parsed && parsed.global && parsed.byCt){
          _cache={
            global:new Map(parsed.global),
            byCt:new Map(parsed.byCt.map(([ct, entries])=>[ct, new Map(entries)])),
            raw: parsed.raw||[],
          };
          _cacheAt=atNum;
        }
      }
    }
  }catch{}
}
function saveToStorage(){
  try{
    const s=getStorage(); if(!s||!_cache) return;
    s.setItem(STORAGE_KEY, JSON.stringify({
      global:Array.from(_cache.global.entries()),
      byCt:Array.from(_cache.byCt.entries()).map(([ct,m])=>[ct, Array.from(m.entries())]),
      raw:_cache.raw,
    }));
    s.setItem(STORAGE_AT, String(_cacheAt));
  }catch{}
}
export function clearTaskResultDefinitionsCache(){ _cache=null; _cacheAt=0; try{ const s=getStorage(); s?.removeItem(STORAGE_KEY); s?.removeItem(STORAGE_AT);}catch{} }
export function getTaskResultDefinitionsCache(){ return _cache; }
if(typeof window!=='undefined'){
  window.__debugTaskResultDefs = async (apiClientParam)=>{
    const client = apiClientParam || (await import("../api/sharepoint/client.js").then(m=>m.default).catch(()=>null));
    if(!client){ console.warn("apiClient not available"); return; }
    try{
      const {data}= await client.get(`/web/lists/getbytitle('${LIST_TITLE}')/fields?$select=InternalName,Title,TypeAsString,Hidden&$top=100`, {headers:{Accept:"application/json;odata=verbose"}});
      console.log("[DBG:fields] TaskResultDefinitions fields", (data?.d?.results||[]).map(f=>({InternalName:f.InternalName, Title:f.Title, TypeAsString:f.TypeAsString, Hidden:f.Hidden})));
    }catch(e){ console.error(e); }
    try{
      const {data}= await client.get(`/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,CType,ResultValue,ShowAdditionalActions,AdditionalsActionsRequired,SortOrder,Enabled&$filter=Enabled eq 1&$top=5`, {headers:{Accept:"application/json;odata=verbose"}}).catch(e=>{
        const msg=String(e?.response?.data?.error?.message?.value||"").toLowerCase();
        if(e?.response?.status===400 && msg.includes("additionalactionsrequired")){
          return client.get(`/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,CType,ResultValue,ShowAdditionalActions,AdditionalActionsRequired,SortOrder,Enabled&$filter=Enabled eq 1&$top=5`, {headers:{Accept:"application/json;odata=verbose"}});
        }
        throw e;
      });
      console.log("[DBG:items] sample", data?.d?.results);
    }catch(e){ console.error("items fetch failed", e?.response?.data); }
  };
}
function norm(s){ return String(s||"").trim().toLowerCase(); }
function parseBool(v, fallback=false){
  if(v===undefined||v===null||v==="") return fallback;
  if(v===true||v===1||v==="1") return true;
  if(v===false||v===0||v==="0") return false;
  const s=String(v).trim().toLowerCase();
  if(s==="да"||s==="true"||s==="yes"||s==="1") return true;
  if(s==="нет"||s==="false"||s==="no"||s==="0") return false;
  return fallback;
}

function getCtypeFromItem(item){
  return String(item.CType||"").trim();
}

export async function fetchTaskResultDefinitions(apiClient, opts={}){
  const {forceRefresh=false}=opts;
  loadFromStorage();
  if(!forceRefresh && _cache && Date.now()-_cacheAt < CACHE_TTL_MS) return _cache;

  // План §14: Title, CType, ResultValue, ShowAdditionalActions, AdditionalsActionsRequired (typo prod с 's'), SortOrder, Enabled — только CType + серверный фильтр Enabled
  const urlPrimary = `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,CType,ResultValue,ShowAdditionalActions,AdditionalsActionsRequired,SortOrder,Enabled&$filter=Enabled eq 1&$top=200&$orderby=SortOrder asc`;
  const urlFallback = `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,CType,ResultValue,ShowAdditionalActions,AdditionalActionsRequired,SortOrder,Enabled&$filter=Enabled eq 1&$top=200&$orderby=SortOrder asc`;
  let url = urlPrimary;
  let data;
  try{
    try{
      const resp = await apiClient.get(urlPrimary, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
      data = resp.data;
    }catch(ePrimary){
      const msg=String(ePrimary?.response?.data?.error?.message?.value||"").toLowerCase();
      const isFieldMissing = ePrimary?.response?.status===400 && msg.includes("additionalsactionsrequired");
      if(isFieldMissing){
        console.warn("[taskResultDefinitions] AdditionalsActionsRequired not found, retry with AdditionalActionsRequired", msg);
        url = urlFallback;
        const resp2 = await apiClient.get(urlFallback, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
        data = resp2.data;
      }else if(ePrimary?.response?.status===400 && msg.includes("additionalactionsrequired") && !msg.includes("additionalsactionsrequired")){
        // prod has Additionals but we tried Additionals? Actually this would be Additional missing -> try Additionals (already tried), but for safety try opposite
        console.warn("[taskResultDefinitions] AdditionalActionsRequired not found, try Additionals", msg);
        throw ePrimary; // already tried primary, so propagate to outer catch for 400 handling
      }else{
        throw ePrimary;
      }
    }
    const results=data?.d?.results||[];
    const global=new Map();
    const byCt=new Map();
    const raw=[];
    for(const item of results){
      const enabled = parseBool(item.Enabled, true);
      if(!enabled) continue;
      const title=String(item.Title||"").trim();
      const resultValue=String(item.ResultValue||title||"").trim();
      if(!resultValue) continue;
      const key=norm(resultValue);
      const ctId=getCtypeFromItem(item);
      // План §14: ShowAdditionalActions → enabled для AdditionalActions контрола, AdditionalActionsRequired → required
      // Legacy: RequiresLocation/RequiresAdditionalActions/RequiresConfirm/Color/Variant/Gradient — маппим только если план-поля пустые
      let show = parseBool(item.ShowAdditionalActions, null);
      if(show===null){
        // legacy fallback: если есть RequiresAdditionalActions/RequiresLocation → считаем Show=true если хотя бы одно true
        const legacyShow = parseBool(item.RequiresAdditionalActions, null) ?? parseBool(item.RequiresLocation, null);
        if(legacyShow!==null) show = legacyShow;
        else show = false; // по плану default: если нет записи — не показываем
      }
      let required = parseBool(item.AdditionalsActionsRequired ?? item.AdditionalActionsRequired, null);
      if(required===null) required = parseBool(item.RequiresAdditionalActions, false);
      const cfg={
        title,
        resultValue,
        contentTypeId: ctId||null,
        showAdditionalActions: !!show,
        additionalActionsRequired: !!required,
        // Совместимость: сохраняем legacy UI поля, но план их не требует
        label: item.Label ? String(item.Label).trim() : title,
        color: item.Color ? String(item.Color).trim().toLowerCase() : undefined,
        variant: item.Variant ? String(item.Variant).trim().toLowerCase() : undefined,
        gradient: item.Gradient ? String(item.Gradient).trim() : undefined,
        sortOrder: item.SortOrder!=null? Number(item.SortOrder):999,
        enabled,
        id:item.Id,
        _key:key,
        _norm:key,
        // для резолвера additionalActionsResolver: используем show/required
        enabledForActions: !!show,
        requiredForActions: !!required,
      };
      raw.push(cfg);
      if(ctId){
        if(!byCt.has(ctId)) byCt.set(ctId, new Map());
        byCt.get(ctId).set(key, cfg);
      } else {
        global.set(key, cfg);
      }
    }
    _cache={global, byCt, raw};
    _cacheAt=Date.now();
    saveToStorage();
    // DEBUG Phase 17.8 — логировать что пришло из SP
    try{
      const isDbg = (()=>{ try{ return new URLSearchParams(location.search).get('dbg')==='1' || localStorage.getItem('dbg')==='1' || localStorage.getItem('dbg_tasks')==='1'; }catch{return false}})();
      if (isDbg || true) { // forced for this ticket
        console.log("[DBG:taskResultDefinitions:fetch] parsed", {
          url,
          resultsCount: results.length,
          raw: raw.map(r=>({Id:r.id, ResultValue:r.resultValue, CType:r.contentTypeId, Show:r.showAdditionalActions, Required:r.additionalActionsRequired, Title:r.title})),
          byCtKeys: Array.from(byCt.keys()),
          globalKeys: Array.from(global.keys()),
          rawItems: results.map(it=>({Id:it.Id, Title:it.Title, ResultValue:it.ResultValue, CType:it.CType, ShowAdditionalActions:it.ShowAdditionalActions, AdditionalActionsRequired:it.AdditionalsActionsRequired ?? it.AdditionalActionsRequired}))
        });
      }
    }catch(e){ console.warn("[DBG:taskResultDefinitions:fetch log error]", e); }
    return _cache;
  }catch(e){
    const status=e?.response?.status;
    const errVal = e?.response?.data?.error?.message?.value || e?.response?.data?.['odata.error']?.message?.value || e?.message || String(e);
    const errCode = e?.response?.data?.error?.code || '';
    if(status===404){
      console.info(`[taskResultDefinitions] list '${LIST_TITLE}' not found (404) — fallback to resultConfig.js`);
      _cache=null; _cacheAt=Date.now();
      return null;
    }
    // Detailed 400 logging for missing field (CType) — user asked to remove fallback, so 400 = column not exists
    console.error(`[taskResultDefinitions] fetch failed ${status} code=${errCode}`, errVal, {url, err:e});
    if(status===400 && /CType/i.test(errVal)){
      console.error(`[taskResultDefinitions] Field 'CType' not found in list '${LIST_TITLE}'. Check internal names via: /_api/web/lists/getbytitle('TaskResultDefinitions')/fields?$select=InternalName,Title`);
      // expose helper
      try{ window.__taskResultDefsLastError = {status, errVal, errCode, url}; }catch{}
      // try to list actual fields for diagnostics (single request, not fallback for data)
      try{
        apiClient.get(`/web/lists/getbytitle('${LIST_TITLE}')/fields?$select=InternalName,Title,TypeAsString&$top=100`, {headers:{Accept:"application/json;odata=verbose"}}).then(r=>{
          const fields = r?.data?.d?.results||[];
          console.warn("[DBG:taskResultDefinitions:fields] actual fields", fields.map(f=>({InternalName:f.InternalName, Title:f.Title, TypeAsString:f.TypeAsString})));
          const hasCType = fields.some(f=>String(f.InternalName).toLowerCase()==="ctype");
          if(!hasCType){
            console.error("[taskResultDefinitions] CType column missing! Create column with InternalName 'CType' (Single line text). Current fields:", fields.map(f=>f.InternalName).join(", "));
          }
        }).catch(()=>{});
      }catch{}
    }
    if(_cache) return _cache;
    // On 400 missing field, return null to fallback to hardcoded (hasDefs=false) instead of empty cache (hasDefs=true empty)
    if(status===400){
      _cache=null; _cacheAt=Date.now();
      return null;
    }
    _cache={global:new Map(), byCt:new Map(), raw:[]};
    _cacheAt=Date.now(); saveToStorage();
    return _cache;
  }
}

/**
 * Резолвер по плану §14: для (ResultValue, ContentTypeId) → {showAdditionalActions, additionalActionsRequired}
 * Используется additionalActionsResolver и TaskCard для ShowAdditionalActions
 * @param {string} resultValue
 * @param {string} contentTypeId
 * @param {{global:Map, byCt:Map}|null} defs
 * @returns {{showAdditionalActions:boolean, additionalActionsRequired:boolean, source:string, cfg:object|null}|null}
 */
export function resolveTaskResultDefinition(resultValue, contentTypeId, defs){
  if(!resultValue || !defs) {
    // debug
    try{ if (true) console.log("[DBG:resolveTaskResultDefinition] early null", {resultValue, contentTypeId, hasDefs:!!defs}); }catch{}
    return null;
  }
  const n=norm(resultValue);
  const ctId=String(contentTypeId||"").trim();
  // debug forced
  try{
    const dbgByCtKeys = Array.from(defs.byCt.keys()).map(k=>k.slice(0,30));
    console.log("[DBG:resolveTaskResultDefinition] lookup", {resultValue, norm:n, ctId:ctId.slice(0,60), ctFull:ctId, hasDefs:!!defs, byCtKeys: dbgByCtKeys, globalKeys: Array.from(defs.global.keys())});
  }catch{}
  // per-CT exact → prefix
  if(ctId && defs.byCt.size){
    if(defs.byCt.has(ctId) && defs.byCt.get(ctId).has(n)){
      const cfg=defs.byCt.get(ctId).get(n);
      return {showAdditionalActions: cfg.showAdditionalActions, additionalActionsRequired: cfg.additionalActionsRequired, source:"task-result-definitions-ct", cfg};
    }
    let best=null, bestLen=-1;
    for(const [key, map] of defs.byCt.entries()){
      if(ctId.startsWith(key) && key.length>bestLen && map.has(n)){ best=map.get(n); bestLen=key.length; }
    }
    if(best) return {showAdditionalActions: best.showAdditionalActions, additionalActionsRequired: best.additionalActionsRequired, source:"task-result-definitions-ct-prefix", cfg:best};
  }
  if(defs.global.has(n)){
    const cfg=defs.global.get(n);
    return {showAdditionalActions: cfg.showAdditionalActions, additionalActionsRequired: cfg.additionalActionsRequired, source:"task-result-definitions-global", cfg};
  }
  // substring fallback
  for(const [k,v] of defs.global.entries()){ if(n.includes(k)) return {showAdditionalActions: v.showAdditionalActions, additionalActionsRequired: v.additionalActionsRequired, source:"task-result-definitions-global-substr", cfg:v}; }
  for(const [,map] of defs.byCt.entries()){ for(const [k,v] of map.entries()){ if(n.includes(k)) return {showAdditionalActions: v.showAdditionalActions, additionalActionsRequired: v.additionalActionsRequired, source:"task-result-definitions-ct-substr", cfg:v}; } }
  return null;
}

/**
 * Legacy UI resolver для кнопок (цвет/вариант) — остаётся fallback к RESULT_UI_CONFIG.
 * Новый план не требует Color/Variant из списка, но если они есть (legacy) — используем.
 * @param {string} choiceValue
 * @param {string} contentTypeId
 * @param {{global:Map, byCt:Map}|null} defs
 * @returns {object} cfg с color/variant/gradient etc (для TaskCard кнопок)
 */
export function resolveResultUiConfig(choiceValue, contentTypeId, defs){
  const n=norm(choiceValue);
  // 1) per-CT defs если есть legacy Color/Variant
  if(defs && contentTypeId){
    const ctMap=defs.byCt.get(String(contentTypeId).trim());
    if(ctMap && ctMap.has(n)){
      const cfg=ctMap.get(n);
      if(cfg.color || cfg.variant || cfg.gradient){
        return { ...RESULT_UI_CONFIG._default, ...cfg, _key:n, _source:"task-result-definitions-ct" };
      }
    }
    let best=null, bestLen=-1;
    for(const [ctKey, map] of defs.byCt.entries()){
      if(String(contentTypeId).startsWith(ctKey) && ctKey.length>bestLen && map.has(n)){
        best=map.get(n); bestLen=ctKey.length;
      }
    }
    if(best && (best.color||best.variant||best.gradient)) return { ...RESULT_UI_CONFIG._default, ...best, _key:n, _source:"task-result-definitions-ct-prefix" };
  }
  if(defs && defs.global.has(n)){
    const cfg=defs.global.get(n);
    if(cfg.color||cfg.variant||cfg.gradient) return { ...RESULT_UI_CONFIG._default, ...cfg, _key:n, _source:"task-result-definitions-global" };
  }
  if(defs){
    for(const [k,v] of defs.global.entries()){ if(n.includes(k) && (v.color||v.variant||v.gradient)) return { ...RESULT_UI_CONFIG._default, ...v, _key:k, _source:"task-result-definitions-global-substr" }; }
  }
  if(RESULT_UI_CONFIG[n]) return { ...RESULT_UI_CONFIG._default, ...RESULT_UI_CONFIG[n], _key:n, _source:"hardcoded" };
  for(const [k,v] of Object.entries(RESULT_UI_CONFIG)){
    if(k==="_default") continue;
    if(n.includes(k)) return { ...RESULT_UI_CONFIG._default, ...v, _key:k, _source:"hardcoded-substr" };
  }
  return { ...RESULT_UI_CONFIG._default, label:String(choiceValue).trim(), _key:"_default", _source:"fallback" };
}

export const TASK_RESULT_DEFINITIONS_LIST_TITLE = LIST_TITLE;
