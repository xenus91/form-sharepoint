// src/services/taskActionDefinitions.js
// Phase 17 — строго по плану §21: TaskActionDefinitions
// Поля списка (план):
// Title (Text), ActionId (Text), ContentTypeId (Text), SortOrder (Number), Enabled (Yes/No)
// НЕ заменяет Choice metadata автоматически (план §21: если field metadata уже описывает действия — сначала использовать metadata)
// Использовать только если реально нужен внешний словарь. Graceful 404 → fallback к полю AdditionalActions. Кэш 30м.

const LIST_TITLE = "TaskActionDefinitions";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskActionDefs:map";
const STORAGE_AT = "sp:taskActionDefs:at";

let _cache = null; // { global: Array<{value,label,sortOrder,actionId}>, byCt: Map<ctId,Array>, raw: Array }
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
        if(parsed && parsed.global){
          _cache={global: parsed.global, byCt:new Map(parsed.byCt||[]), raw: parsed.raw||[]};
          _cacheAt=atNum;
        }
      }
    }
  }catch{}
}
function saveToStorage(){
  try{
    const s=getStorage(); if(!s||!_cache) return;
    s.setItem(STORAGE_KEY, JSON.stringify({global:_cache.global, byCt:Array.from(_cache.byCt.entries()), raw:_cache.raw}));
    s.setItem(STORAGE_AT, String(_cacheAt));
  }catch{}
}
export function clearTaskActionDefinitionsCache(){ _cache=null; _cacheAt=0; try{ const s=getStorage(); s?.removeItem(STORAGE_KEY); s?.removeItem(STORAGE_AT);}catch{} }
function parseBool(v, fallback=true){
  if(v===undefined||v===null||v==="") return fallback;
  if(v===true||v===1||v==="1") return true;
  if(v===false||v===0||v==="0") return false;
  const s=String(v).trim().toLowerCase();
  if(s==="да"||s==="true"||s==="yes"||s==="1") return true;
  if(s==="нет"||s==="false"||s==="no"||s==="0") return false;
  return fallback;
}

export async function fetchTaskActionDefinitions(apiClient, opts={}){
  const {forceRefresh=false}=opts;
  loadFromStorage();
  if(!forceRefresh && _cache && Date.now()-_cacheAt < CACHE_TTL_MS) return _cache;
  // План §21: Title, ActionId, ContentTypeId, SortOrder, Enabled + для совместимости legacy ActionValue/Label/Title
  const url = `/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title,ActionId,ContentTypeId,SortOrder,Enabled,ActionValue,Label&$top=200&$orderby=SortOrder asc`;
  try{
    const {data}= await apiClient.get(url, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
    const results=data?.d?.results||[];
    const global=[]; const byCt=new Map(); const raw=[];
    for(const item of results){
      const enabled = parseBool(item.Enabled, true);
      if(!enabled) continue;
      const title=String(item.Title||"").trim();
      // План: ActionId — приоритет, fallback к legacy ActionValue/Title
      const actionId = String(item.ActionId||item.ActionValue||title||"").trim();
      if(!actionId) continue;
      const ctId=String(item.ContentTypeId||"").trim();
      // Label legacy — если есть, используем как label иначе Title
      const label = item.Label ? String(item.Label).trim() : title;
      const entry={ value: actionId, label: label||actionId, sortOrder: item.SortOrder!=null? Number(item.SortOrder):999, id:item.Id, contentTypeId: ctId||null, title, actionId };
      raw.push(entry);
      if(ctId){
        if(!byCt.has(ctId)) byCt.set(ctId, []);
        byCt.get(ctId).push(entry);
      } else {
        global.push(entry);
      }
    }
    global.sort((a,b)=>a.sortOrder-b.sortOrder);
    for(const [,arr] of byCt.entries()) arr.sort((a,b)=>a.sortOrder-b.sortOrder);
    _cache={global, byCt, raw};
    _cacheAt=Date.now(); saveToStorage();
    return _cache;
  }catch(e){
    const status=e?.response?.status;
    if(status===404){
      console.info(`[taskActionDefinitions] list '${LIST_TITLE}' not found (404) — fallback to field AdditionalActions (plan §21: использовать metadata если достаточно)`);
      _cache=null; _cacheAt=Date.now();
      return null;
    }
    console.warn(`[taskActionDefinitions] fetch failed ${status}`, e?.message);
    if(_cache) return _cache;
    _cache={global:[], byCt:new Map(), raw:[]};
    _cacheAt=Date.now(); saveToStorage();
    return _cache;
  }
}

/**
 * Резолвер по плану §21+§15: если TaskActionDefinitions существует — использовать его,
 * иначе field metadata (план: "если field metadata уже полностью описывает — сначала использовать metadata")
 * @param {string} contentTypeId
 * @param {{global:Array, byCt:Map}|null} defs
 * @param {Array<{value:string,label:string}>|null} fallbackChoices fallback из поля (choices)
 * @returns {Array<{value:string,label:string}>}
 */
export function resolveActionChoices(contentTypeId, defs, fallbackChoices){
  // Если defs==null (404) — сразу fallback к полю (план §21)
  if(!defs) {
    if(Array.isArray(fallbackChoices) && fallbackChoices.length) return fallbackChoices.map(v=> typeof v==='string'? {value:v,label:v}: v);
    return [];
  }
  const ctId=String(contentTypeId||"").trim();
  // per-CT exact → prefix
  if(ctId && defs.byCt.has(ctId)){
    const arr=defs.byCt.get(ctId);
    if(arr.length) return arr;
  }
  if(ctId){
    let best=null, bestLen=-1;
    for(const [key, arr] of defs.byCt.entries()){
      if(ctId.startsWith(key) && key.length>bestLen && arr.length){ best=arr; bestLen=key.length; }
    }
    if(best) return best;
  }
  if(defs.global.length) return defs.global;
  // defs существует но пусто для этого CT — fallback к полю (план §21)
  if(Array.isArray(fallbackChoices) && fallbackChoices.length) return fallbackChoices.map(v=> typeof v==='string'? {value:v,label:v}: v);
  return [];
}

export const TASK_ACTION_DEFINITIONS_LIST_TITLE = LIST_TITLE;
