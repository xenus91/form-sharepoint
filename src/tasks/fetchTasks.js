/* eslint-disable */
// eslint-disable-next-line no-unused-vars
// DBG helper — включи ?dbg=1 или localStorage.setItem('dbg','1') чтобы видеть детальные логи
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return false; }catch(_e){ void _e; return false; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch(_e){ void _e;} };
// eslint-disable-next-line no-unused-vars
const __dgroup = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.groupCollapsed(...a);}catch(_e){ void _e;} };
// eslint-disable-next-line no-unused-vars
// eslint-disable-next-line no-unused-vars
const __dgroupEnd = ()=>{ if(!__DBG_ENABLED__) return; try{ console.groupEnd();}catch(_e){ void _e;} };

import apiClient, { normalizeNextUrl } from "../api";
import { buildTaskListQuery } from "./listQuery";
import { mapRawTask } from "./mapping";
import { toDomainTask } from "../domain/tasks/taskModel";

/**
 * Чистая fetch-функция для списка задач (без React state).
 * Повторяет логику loadTasks из TasksView, но возвращает Promise<Array<Task>>.
 * Используется TanStack Query queryFn.
 */
export async function fetchTasks({ currentUserId, distribution, taskFieldNames = [], recipientField = null, scNumberField = null, resultFieldInternalNames = [] }) {
  __dlog("[DBG:fetchTasks] start", { currentUserId, distribution: distribution?.Id||distribution?.OffDepKey||null, resultFieldInternalNames, taskFieldNamesLen: taskFieldNames.length });
  if (!currentUserId) return [];
  let useDueDate = true;
  let useAdditionalActions = true;
  let useRecipient = !!recipientField;
  // Recipient в Tasks может отсутствовать (как сейчас - поле удалено). Не пробуем дефолт "Recipient" на первом рендере,
  // чтобы не падать с 400 "Recipient не существует". Данные Recipient теперь берём только из связанного элемента через enrich.
  let effectiveRecipientField = recipientField || null;
  const buildUrl = () =>
    buildTaskListQuery({
      taskFieldNames,
      useDueDate,
      useAdditionalActions,
      recipientField: effectiveRecipientField,
      useRecipient,
      resultFieldInternalNames,
      distribution,
      currentUserId,
      // Завершённые задачи грузятся отдельно и лениво (completedTasks.js),
      // поэтому в основной запрос они не попадают.
      excludeCompleted: true,
    });

  let nextUrl = buildUrl();
  __dlog("[DBG:fetchTasks] buildUrl", nextUrl.slice(0,1200));
  let all = [];
  let safety = 0;
  while (nextUrl && safety < 20) {
    try {
      const { data } = await apiClient.get(nextUrl, {
        headers: { Accept: "application/json;odata=verbose" },
        __noCache: true, // TanStack — единственный кэш
      });
      const results = data?.d?.results || [];
      all = all.concat(results);
      nextUrl = data?.d?.__next ? normalizeNextUrl(data.d.__next) : null;
    } catch (e) {
      const msg = String(e?.response?.data?.error?.message?.value || e?.message || "").toLowerCase();
      if (msg.includes("endjob")) {
        console.warn("[fetchTasks] EndJob field missing, retry without it (field was deleted)");
        // EndJob был удалён — фильтруем его из всех списков и ретраим
        taskFieldNames = taskFieldNames.filter((f) => f.toLowerCase() !== "endjob");
        resultFieldInternalNames = resultFieldInternalNames.filter((f) => f.toLowerCase() !== "endjob");
        if (effectiveRecipientField && effectiveRecipientField.toLowerCase() === "endjob") {
          effectiveRecipientField = null;
          useRecipient = false;
        }
        // также чистим кэш, чтобы не возвращать старый URL с EndJob
        try { const { invalidate } = await import("../sp/cache.js"); invalidate("EndJob"); } catch (_e) { void _e; }
        nextUrl = buildUrl();
        continue;
      }
      if (useDueDate && msg.includes("duedate")) {
        useDueDate = false;
        nextUrl = buildUrl();
        continue;
      }
      if (useAdditionalActions && (msg.includes("additionalactionsrequired") || msg.includes("additionalactions"))) {
        useAdditionalActions = false;
        nextUrl = buildUrl();
        continue;
      }
      if (useRecipient && effectiveRecipientField && msg.includes("recipient")) {
        useRecipient = false;
        effectiveRecipientField = null;
        nextUrl = buildUrl();
        continue;
      }
      if (nextUrl.includes("AssignedToId")) {
        nextUrl = nextUrl.replace(/AssignedToId/g, "AssignedTo/Id");
        continue;
      }
      throw e;
    }
    safety += 1;
  }

  // Domain mapping — централизованно, сохраняет legacy поля для совместимости ( §9 )
  const mapped = all.map((r) => toDomainTask(r, { recipientField: effectiveRecipientField, scNumberField }));
  try{
    const byType = {};
    for(const m of mapped){ const ct = String(m.ContentTypeId||'').slice(0,18); byType[ct]=(byType[ct]||0)+1; }
    __dlog("[DBG:fetchTasks] results", { rawCount: all.length, mappedCount: mapped.length, byContentTypePrefix: byType, sample: mapped.slice(0,3).map(m=>({Id:m.Id, Title:(m.Title||'').slice(0,40), Status:m.Status, ContentTypeId:String(m.ContentTypeId||'').slice(0,60), RelatedItems: !!m.RelatedItems, Recipient: m.Recipient||'(empty)', SCNumber:m.SCNumber||'(empty)', THU:m.THU||'(empty)', ResultTHU: m.ResultSearchTHU, ResultValue: m.ResultValue, rawKeys: Object.keys(m.raw||{}).filter(k=>k.toLowerCase().includes('result')).slice(0,5)})) });
    // отдельно логируем задачи типа завершения поиска ЕО (где есть ResultSearchComplete в raw или ct содержит заверш)
    const comp = mapped.filter(m=> {
      const keys = Object.keys(m.raw||{});
      return keys.some(k=>k.toLowerCase().includes('resultcomplete')||k.toLowerCase().includes('complete')) || String(m.Title||'').toLowerCase().includes('заверш') || String(m.raw?.ContentType?.Name||'').toLowerCase().includes('заверш');
    });
    if(comp.length){ __dlog("[DBG:fetchTasks] completion-type tasks", comp.map(m=>({Id:m.Id, Title:m.Title, ContentTypeId:m.ContentTypeId, rawResultKeys: Object.keys(m.raw||{}).filter(k=>k.toLowerCase().includes('result')), ResultSearchTHU:m.ResultSearchTHU, rawComplete: m.raw?.ResultSearchComplete||m.raw?.ResultComplete||m.raw?.Result||'(none)'}))); }
  }catch(_e){ void _e; } // eslint-disable-line no-empty
  return mapped;
}
