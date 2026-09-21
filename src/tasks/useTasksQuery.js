/* eslint-disable */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTasks } from "./fetchTasks";
import { enrichTasksWithRelated } from "./enrich";
// eslint-disable-next-line no-unused-vars
import { extractTKNumberFromTask, extractTKNumber } from "./formatters";
import { useEffect } from "react";
// DBG helper — включи ?dbg=1 или localStorage.setItem('dbg','1') чтобы видеть детальные логи
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return true; }catch{ return true; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch{} };
const __dgroup = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.groupCollapsed(...a);}catch{} };
const __dgroupEnd = ()=>{ if(!__DBG_ENABLED__) return; try{ console.groupEnd();}catch{} };


export function useTasksQuery({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames = [], enabled = true }) {
  const queryClient = useQueryClient();

  const queryKey = [
    "tasks",
    currentUserId ?? null,
    distribution?.Id ?? distribution?.OffDepKey ?? null,
    (taskFieldNames || []).join(","),
    recipientField ?? null,
    scNumberField ?? null,
    (resultFieldInternalNames || []).join(","),
  ];

  __dlog("[DBG:useTasksQuery] init", { queryKey, enabled });
  // Глобальный кэш для всех типов задач (ResultSearchTHU, ResultSearchComplete) — чтобы не мигало на любом типе
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      __dlog("[DBG:useTasksQuery] queryFn start", { resultFieldInternalNames });
      const raw = await fetchTasks({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames });
      // Сразу накладываем глобальный кэш enrich (по taskId и по RelatedItems) чтобы не мигало "ЕО 808..." → "ТК 107 • ЕО ..."
      // Кэш работает для всех типов: и Поиск ЕО (ResultSearchTHU), и ЕО найдена (ResultSearchComplete)
      const { getGlobalEnrichCacheByTaskId, getGlobalEnrichCache } = await import("./enrich");
      __dlog("[DBG:useTasksQuery] queryFn raw", raw.length, raw.slice(0,2).map(t=>({Id:t.Id, Recipient:t.Recipient||'∅', ContentTypeId:String(t.ContentTypeId||'').slice(-12)})));
      if (raw.length > 0) {
        let changed = false;
        const merged = raw.map((t) => {
          // 1) Кэш по taskId
          let cached = getGlobalEnrichCacheByTaskId(t.Id);
          // 2) Кэш по RelatedItems (listId:itemId) — если taskId кэша нет, пробуем по связанному элементу
          if (!cached && t.RelatedItems) {
            try {
              const rel = typeof t.RelatedItems === "string" ? JSON.parse(t.RelatedItems) : t.RelatedItems;
              if (Array.isArray(rel) && rel[0]) {
                const listId = String(rel[0].ListId || rel[0].listId || "").replace(/[{}]/g, "");
                const itemId = rel[0].ItemId || rel[0].itemId;
                if (listId && itemId) {
                  cached = getGlobalEnrichCache(listId, itemId);
                }
              }
            } catch (_e) { void _e; }
          }
          if (!cached) return t;
          let need = false;
          if (cached.Recipient && t.Recipient !== cached.Recipient) need = true;
          if (cached.SCNumber && t.SCNumber !== cached.SCNumber) need = true;
          if (cached.THU && t.THU !== cached.THU) need = true;
          if (!need) return t;
          changed = true;
          return { ...t, Recipient: cached.Recipient || t.Recipient, SCNumber: cached.SCNumber || t.SCNumber, THU: cached.THU || t.THU, TKNumber: cached.SCNumber || t.SCNumber, raw: { ...t.raw, THU: cached.THU || t.raw?.THU } };
        });
        __dlog("[DBG:useTasksQuery] queryFn merged", { changed, hits: merged.filter((m,i)=> m!==raw[i]).length });
        return changed ? merged : raw;
      }
      return raw;
    },
    enabled: !!currentUserId && enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });

  // Фоновое обогащение Recipient/SCNumber/THU — батч вместо fan-out, с кэшем чтобы не мигало
  useEffect(() => {
    const data = query.data;
    __dlog("[DBG:useTasksQuery] effect dataUpdatedAt", query.dataUpdatedAt, "dataLen", data?.length, "isFetching", query.isFetching);
    if (!data || data.length === 0) return;
    // Дебаунс чтобы не DDoS-ить GetItems каждый dataUpdatedAt
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // Не обогащаем если данные уже обогащены (все задачи с ТК или без RelatedItems)
        __dlog("[DBG:useTasksQuery] effect check", { sample: data.slice(0,3).map(t=>({Id:t.Id, R:t.Recipient||'∅', SC:t.SCNumber||'∅', THU:t.THU||'∅', hasRel:!!t.RelatedItems, ct:String(t.ContentTypeId||'').slice(-12)})) });
        const needEnrich = data.some((t) => (!t.Recipient || !t.SCNumber) && t.RelatedItems);
        if (!needEnrich) return;
        __dlog("[DBG:useTasksQuery] calling enrichTasksWithRelated", data.length);
        const { recipientMap, scNumberMap, thuMap } = await enrichTasksWithRelated(data, { concurrency: 5, useBatch: true });
        if (cancelled) return;
        __dlog("[DBG:useTasksQuery] enrich result", { r: recipientMap.size, sc: scNumberMap.size, thu: thuMap.size });
        if (recipientMap.size === 0 && scNumberMap.size === 0 && thuMap.size === 0) { __dlog("[DBG:useTasksQuery] enrich empty -> skip setQueryData"); return; }
        // Кэшируем глобально для всех типов задач
        const { setGlobalEnrichCacheByTaskId, setGlobalEnrichCache, getGlobalEnrichCacheByTaskId } = await import("./enrich");
        for (const [id, rec] of recipientMap.entries()) {
          const cur = getGlobalEnrichCacheByTaskId(id) || {};
          setGlobalEnrichCacheByTaskId(id, { ...cur, Recipient: rec });
          // Также кэшируем по RelatedItems для кросс-типового доступа
          const task = data.find((x) => x.Id === id);
          if (task && task.RelatedItems) {
            try {
              const rel = typeof task.RelatedItems === "string" ? JSON.parse(task.RelatedItems) : task.RelatedItems;
              if (Array.isArray(rel) && rel[0]) {
                const listId = String(rel[0].ListId || rel[0].listId || "").replace(/[{}]/g, "");
                const itemId = rel[0].ItemId || rel[0].itemId;
                if (listId && itemId) setGlobalEnrichCache(listId, itemId, { Recipient: rec, SCNumber: scNumberMap.get(id), THU: thuMap.get(id) });
              }
            } catch (_e) { void _e; }
          }
        }
        for (const [id, sc] of scNumberMap.entries()) {
          const cur = getGlobalEnrichCacheByTaskId(id) || {};
          setGlobalEnrichCacheByTaskId(id, { ...cur, SCNumber: sc });
        }
        for (const [id, thu] of thuMap.entries()) {
          const cur = getGlobalEnrichCacheByTaskId(id) || {};
          setGlobalEnrichCacheByTaskId(id, { ...cur, THU: thu });
        }
        queryClient.setQueryData(queryKey, (prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((p) => {
            const newRec = recipientMap.get(p.Id);
            const newSc = scNumberMap.get(p.Id);
            const newThu = thuMap.get(p.Id);
            if (newRec === undefined && newSc === undefined && newThu === undefined) return p;
            let needNew = false;
            if (newRec !== undefined && p.Recipient !== newRec) needNew = true;
            if (newSc !== undefined && p.SCNumber !== newSc) needNew = true;
            if (newThu !== undefined && p.THU !== newThu && p.raw?.THU !== newThu) needNew = true;
            if (!needNew) return p;
            changed = true;
            const upd = { ...p, raw: { ...p.raw } };
            if (newRec !== undefined) upd.Recipient = newRec;
            if (newSc !== undefined) {
              upd.SCNumber = newSc;
              upd.TKNumber = newSc;
            }
            if (newThu !== undefined) {
              upd.THU = newThu;
              upd.raw.THU = newThu;
            }
            return upd;
          });
          return changed ? next : prev;
        });
      } catch (_e) { void _e; }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.dataUpdatedAt]);

  return { ...query, queryKey };
}
