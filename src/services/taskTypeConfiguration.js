// src/services/taskTypeConfiguration.js
// Phase 17 — строго по плану §17: TaskTypeConfiguration
// Поля списка (план):
// Title (Text), CType (Text full 0x0108...) — was ContentTypeId/ContentTypeId0 (system collision), AdditionalActionsFieldInternalName (Text), AdditionalActionsRequired (Yes/No или Да/Нет), Enabled (Yes/No)
// Graceful 404 → fallback к sharepoint-metadata (одно поле AdditionalActions). Кэш 30м.

import { TASKS_LIST_API } from "../tasks/config";

const LIST_TITLE = "TaskTypeConfiguration";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskTypeConfig:map";
const STORAGE_AT = "sp:taskTypeConfig:at";

let _cache = null; // Map<ctId -> {contentTypeId, additionalActionsFieldInternalName, additionalActionsRequired: boolean|null, enabled: boolean, title, id}>
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
        if(Array.isArray(parsed)){ _cache=new Map(parsed); _cacheAt=atNum; }
      }
    }
  }catch{}
}
function saveToStorage(){
  try{
    const s=getStorage(); if(!s||!_cache) return;
    s.setItem(STORAGE_KEY, JSON.stringify(Array.from(_cache.entries())));
    s.setItem(STORAGE_AT, String(_cacheAt));
  }catch{}
}
export function clearTaskTypeConfigCache(){
  _cache=null; _cacheAt=0;
  try{ const s=getStorage(); s?.removeItem(STORAGE_KEY); s?.removeItem(STORAGE_AT);}catch{}
}
function parseBool(v, fallback=null){
  if(v===undefined||v===null||v==="") return fallback;
  if(v===true||v===1||v==="1") return true;
  if(v===false||v===0||v==="0") return false;
  const s=String(v).trim().toLowerCase();
  if(s==="да"||s==="true"||s==="yes"||s==="1") return true;
  if(s==="нет"||s==="false"||s==="no"||s==="0") return false;
  return fallback;
}

function getCtypeFromItem(item){
  const v = item.CType ?? item.ContentTypeId0 ?? item.ContentTypeId;
  return String(v||"").trim();
}
async function fetchWithCtypeFallback(apiClient, forceRefresh){
  const selCType = `Id,Title,CType,AdditionalActionsFieldInternalName,AdditionalsActionsRequired,Enabled`;
  const selFallback = `Id,Title,ContentTypeId0,AdditionalActionsFieldInternalName,AdditionalsActionsRequired,Enabled`;
  const selLegacy = `Id,Title,ContentTypeId,AdditionalActionsFieldInternalName,AdditionalsActionsRequired,Enabled`;
  const base = `/web/lists/getbytitle('${LIST_TITLE}')/items`;
  const tries = [
    `${base}?$select=${selCType}&$top=100`,
    `${base}?$select=${selFallback}&$top=100`,
    `${base}?$select=${selLegacy}&$top=100`,
  ];
  let lastErr=null;
  for(const url of tries){
    try{
      const {data}= await apiClient.get(url, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
      return {data, url};
    }catch(e){
      const status=e?.response?.status;
      const msg=String(e?.message||"")+String(e?.response?.data?.error?.message?.value||"");
      const isMissingField = status===400 && /CType|ContentTypeId0|ContentTypeId|does not exist|не существует/i.test(msg);
      const isAdditionalsMissing = status===400 && /AdditionalsActionsRequired/i.test(msg);
      if(isAdditionalsMissing){
        // try Alternative spelling Additional without s for old lists
        const altUrl = url.replace(/AdditionalsActionsRequired/g, "AdditionalActionsRequired");
        if(altUrl !== url){
          try{
            console.warn("[taskTypeConfiguration] AdditionalsActionsRequired not found, retry with AdditionalActionsRequired", msg);
            const {data: altData}= await apiClient.get(altUrl, {headers:{Accept:"application/json;odata=verbose"}, __noCache:forceRefresh});
            return {data: altData, url: altUrl};
          }catch(e2){
            lastErr=e2;
            // if alt also missing CType etc, continue to next try
            const msg2=String(e2?.message||"")+String(e2?.response?.data?.error?.message?.value||"");
            const isMissingField2 = e2?.response?.status===400 && /CType|ContentTypeId0|ContentTypeId|does not exist|не существует/i.test(msg2);
            if(isMissingField2){ continue; }
            throw e2;
          }
        }
      }
      if(isMissingField){ lastErr=e; continue; }
      throw e;
    }
  }
  throw lastErr;
}

export async function fetchTaskTypeConfigurationMap(apiClient, opts={}){
  const {forceRefresh=false}=opts;
  loadFromStorage();
  if(!forceRefresh && _cache && Date.now()-_cacheAt < CACHE_TTL_MS) return _cache;

  // План §17: Title, CType (was ContentTypeId), AdditionalActionsFieldInternalName, AdditionalActionsRequired, Enabled
  // Для совместимости также читаем legacy Required и ResultFieldInternalName (не план, но был в 870062a)
  try{
    const {data}= (await fetchWithCtypeFallback(apiClient, forceRefresh)).data;
    const results = data?.d?.results || [];
    const map=new Map();
    for(const item of results){
      const ctId=getCtypeFromItem(item);
      if(!ctId) continue;
      // Enabled — если пусто считаем true (совместимость)
      const enabled = parseBool(item.Enabled, true);
      if(!enabled) continue; // Enabled=false — игнор
      // AdditionalActionsRequired — legacy Required fallback
      let required = parseBool(item.AdditionalsActionsRequired ?? item.AdditionalActionsRequired, null);
      if(required===null) required = parseBool(item.Required, null);
      // поддержка legacy ResultFieldInternalName — не требуется планом, но сохраняем для обратной совместимости (не используем в резолвере если пусто)
      const resultFieldInternalName = item.ResultFieldInternalName ? String(item.ResultFieldInternalName).trim() : null;
      map.set(ctId, {
        contentTypeId: ctId,
        additionalActionsFieldInternalName: item.AdditionalActionsFieldInternalName ? String(item.AdditionalActionsFieldInternalName).trim() : null,
        additionalActionsRequired: required,
        enabled,
        title: item.Title||"",
        id: item.Id,
        // legacy
        resultFieldInternalName,
        // для диагностики
        raw: item,
      });
    }
    _cache=map; _cacheAt=Date.now(); saveToStorage();
    return map;
  }catch(e){
    const status=e?.response?.status;
    if(status===404){
      console.info(`[taskTypeConfiguration] list '${LIST_TITLE}' not found (404) — fallback to sharepoint-metadata`);
      _cache=null; _cacheAt=Date.now();
      return null;
    }
    console.warn(`[taskTypeConfiguration] fetch failed ${status}`, e?.message);
    if(_cache) return _cache;
    _cache=new Map(); _cacheAt=Date.now(); saveToStorage();
    return _cache;
  }
}

export function resolveTaskTypeConfig(contentTypeId, map){
  if(!contentTypeId||!map||map.size===0) return null;
  const ctId=String(contentTypeId).trim();
  if(map.has(ctId)) return map.get(ctId);
  let best=null, bestLen=-1;
  for(const [key,val] of map.entries()){
    if(ctId.startsWith(key) && key.length>bestLen){ best=val; bestLen=key.length; }
  }
  return best;
}

export const TASK_TYPE_CONFIG_LIST_TITLE = LIST_TITLE;
