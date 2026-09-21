// src/services/taskActionDefinitions.js
// Phase 17 — TaskActionDefinitions SharePoint list (без ребилда)
// Позволяет админу заводить новые AdditionalActions значения без изменения поля и кода.
// Fallback: если список не существует (404) → используется поле AdditionalActions (field metadata) + ADDITIONAL_ACTIONS_STANDARD
// Кэш 30м, graceful 404.

const LIST_TITLE = "TaskActionDefinitions";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskActionDefs:map";
const STORAGE_AT = "sp:taskActionDefs:at";

let _cache = null; // { global: Array<{value,label,sortOrder}> , byCt: Map<ctId, Array> , raw: Array }
let _cacheAt = 0;

function getStorage(){ try{ if(typeof sessionStorage!=="undefined") return sessionStorage; }catch{} return null; }
function loadFromStorage(){
  try{
    const s=getStorage(); if(!s) return;
    const raw=s.getItem(STORAGE_KEY); const at=s.getItem(STORAGE_AT);
    if(raw && at){
      const atNum=Number(at);
      if(Date.now()-atNum < CACHE_TTL_MS){
        const parsed=JSON.parse(raw);
        if(parsed && parsed.global){
          _cache = {
            global: parsed.global,
            byCt: new Map(parsed.byCt || []),
            raw: parsed.raw || [],
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
      global: _cache.global,
      byCt: Array.from(_cache.byCt.entries()),
      raw: _cache.raw,
    }));
    s.setItem(STORAGE_AT, String(_cacheAt));
  }catch{}
}
export function clearTaskActionDefinitionsCache(){ _cache=null; _cacheAt=0; try{ const s=getStorage(); s?.removeItem(STORAGE_KEY); s?.removeItem(STORAGE_AT);}catch{} }
function parseBool(v){
  if(v===true||v===1||v==="1") return true;
  if(v===false||v===0||v==="0") return false;
  const s=String(v||"").trim().toLowerCase();
  if(s==="да"||s==="true"||s==="yes"||s==="1") return true;
  if(s==="нет"||s==="false"||s==="no"||s==="0") return false;
  return true; // default IsActive true
}

/**
 * Fetch TaskActionDefinitions list → {global: Array, byCt: Map<ctId, Array>, raw}
 * @param {import('axios').AxiosInstance} apiClient
 * @param {{forceRefresh?:boolean}} opts
 * @returns {Promise<{global:Array<{value:string,label:string,sortOrder:number}>, byCt:Map<string,Array>, raw:Array}|null>} null если список не существует
 */
export async function fetchTaskActionDefinitions(apiClient, opts={}){
  const {forceRefresh=false}=opts;
  loadFromStorage();
  if(!forceRefresh && _cache && Date.now()-_cacheAt < CACHE_TTL_MS) return _cache;
  const url = `/_api/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,ActionValue,ContentTypeId,Label,SortOrder,IsActive&$top=200&$orderby=SortOrder asc`;
  try{
    const {data}= await apiClient.get(url, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
    const results = data?.d?.results || [];
    const global=[];
    const byCt=new Map();
    const raw=[];
    for(const item of results){
      const isActive = item.IsActive===undefined||item.IsActive===null ? true : (String(item.IsActive).toLowerCase()==="да"||String(item.IsActive).toLowerCase()==="true"||item.IsActive===true||item.IsActive===1);
      if(!isActive) continue;
      const title=String(item.Title||"").trim();
      const val=String(item.ActionValue||title||"").trim();
      if(!val) continue;
      const label = item.Label ? String(item.Label).trim() : title;
      const ctId = String(item.ContentTypeId||"").trim();
      const entry = { value: val, label: label||val, sortOrder: item.SortOrder!=null? Number(item.SortOrder):999, id:item.Id, contentTypeId: ctId||null };
      raw.push(entry);
      if(ctId){
        if(!byCt.has(ctId)) byCt.set(ctId, []);
        byCt.get(ctId).push(entry);
      } else {
        global.push(entry);
      }
    }
    // sort
    global.sort((a,b)=>a.sortOrder-b.sortOrder);
    for(const [,arr] of byCt.entries()) arr.sort((a,b)=>a.sortOrder-b.sortOrder);
    _cache={global, byCt, raw};
    _cacheAt=Date.now();
    saveToStorage();
    return _cache;
  }catch(e){
    const status=e?.response?.status;
    if(status===404){
      console.info(`[taskActionDefinitions] list '${LIST_TITLE}' not found (404) — fallback to field AdditionalActions`);
      _cache=null; _cacheAt=Date.now();
      return null;
    }
    console.warn(`[taskActionDefinitions] fetch failed ${status}`, e?.message);
    if(_cache) return _cache;
    _cache={global:[], byCt:new Map(), raw:[]};
    _cacheAt=Date.now();
    saveToStorage();
    return _cache;
  }
}

/**
 * Resolve choices for a ContentTypeId: per-CT if exists, else global, else fallback
 * @param {string} contentTypeId
 * @param {{global:Array, byCt:Map}|null} defs
 * @param {Array<{value:string,label:string}>|null} fallbackChoices fallback from field metadata
 * @returns {Array<{value:string,label:string}>}
 */
export function resolveActionChoices(contentTypeId, defs, fallbackChoices){
  if (defs){
    const ctId = String(contentTypeId||"").trim();
    if (ctId && defs.byCt.has(ctId)){
      const arr = defs.byCt.get(ctId);
      if(arr.length) return arr;
    }
    // prefix match
    if (ctId){
      let best=null, bestLen=-1;
      for(const [key, arr] of defs.byCt.entries()){
        if(ctId.startsWith(key) && key.length>bestLen && arr.length){
          best=arr; bestLen=key.length;
        }
      }
      if(best) return best;
    }
    if(defs.global.length) return defs.global;
  }
  // fallback to field choices
  if (Array.isArray(fallbackChoices) && fallbackChoices.length) {
    // fallbackChoices may be string[] or {value,label}
    return fallbackChoices.map(v=> typeof v==='string'? {value:v,label:v}: v);
  }
  return [];
}

export const TASK_ACTION_DEFINITIONS_LIST_TITLE = LIST_TITLE;
