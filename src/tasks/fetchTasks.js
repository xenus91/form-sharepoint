/* eslint-disable */
// eslint-disable-next-line no-unused-vars
// DBG helper — включи ?dbg=1 или localStorage.setItem('dbg','1') чтобы видеть детальные логи
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return false; }catch(_e){ void _e; return false; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch(_e){ void _e;} };
// eslint-disable-next-line no-unused-vars
const __dgroup = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.groupCollapsed(...a);}catch(_e){ void _e;} };
// eslint-disable-next-line no-unused-vars
const __dgroupEnd = ()=>{ if(!__DBG_ENABLED__) return; try{ console.groupEnd();}catch(_e){ void _e;} };

import { normalizeNextUrl } from "../api";
import { buildTaskListQuery } from "./listQuery";
// eslint-disable-next-line no-unused-vars
import { mapRawTask } from "./mapping";
import { toDomainTask } from "../domain/tasks/taskModel";
import { getSourceById } from "./sources";
import { makeSourceClient } from "./sourceClient";

/**
 * Чистая fetch-функция для одного источника задач (multi-source).
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null, resolveListApi?:(()=>string|Promise<string>)|null}} source
 * @param {{apiBase:string, listApi:()=>string|Promise<string>, get:(url:string, opts?:any)=>Promise<{data:any}>}} client
 * @param {{ currentUserId?:number|null, distribution?:any, taskFieldNames?:string[], recipientField?:string|null, scNumberField?:string|null, resultFieldInternalNames?:string[], assignedIds?:number[]|null, listApi?:string|null, excludeCompleted?:boolean }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchTasksForSource(source, client, opts = {}) {
  if (!source || !client) throw new Error("[fetchTasksForSource] source & client required");
  const {
    currentUserId = null,
    distribution = null,
    taskFieldNames = [],
    recipientField = null,
    scNumberField = null,
    resultFieldInternalNames = [],
    assignedIds = null,
    listApi = null,
    excludeCompleted = true,
  } = opts;
  __dlog("[DBG:fetchTasksForSource] start", { sourceId: source.id, currentUserId, distributionId: distribution?.Id||null, assignedIdsLen: Array.isArray(assignedIds) ? assignedIds.length : null });
  if (!currentUserId && !(Array.isArray(assignedIds) && assignedIds.length > 0)) return [];
  let useDueDate = true;
  let useAdditionalActions = true;
  let useRecipient = !!recipientField;
  let effectiveRecipientField = recipientField || null;
  const effectiveListApi = listApi || (typeof client.listApi === "function" ? await client.listApi() : "");
  const buildUrl = () =>
    buildTaskListQuery({
      listApi: effectiveListApi,
      taskFieldNames,
      useDueDate,
      useAdditionalActions,
      recipientField: effectiveRecipientField,
      useRecipient,
      resultFieldInternalNames,
      distribution,
      currentUserId,
      assignedIds,
      excludeCompleted,
    });

  let nextUrl = buildUrl();
  __dlog("[DBG:fetchTasksForSource] buildUrl", nextUrl.slice(0,1200));
  let all = [];
  let safety = 0;
  while (nextUrl && safety < 20) {
    try {
      let urlForClient = nextUrl;
      if (typeof client.apiBase === "string" && client.apiBase && !/^https?:\/\//.test(nextUrl) && !nextUrl.startsWith("/api/") && !nextUrl.startsWith("/dob-api/")) {
        urlForClient = `${client.apiBase}${nextUrl.startsWith("/") ? nextUrl : `/${nextUrl}`}`;
      } else if (/^https?:\/\//.test(nextUrl) && client.apiBase && client.apiBase.startsWith("/")) {
        try {
          const u = new URL(nextUrl);
          urlForClient = u.pathname + u.search;
        } catch (_e) { void _e; }
      }
      const resp = await client.get(urlForClient, {
        headers: { Accept: "application/json;odata=verbose" },
        __noCache: true,
      });
      const data = resp?.data || {};
      const results = data?.d?.results || [];
      all = all.concat(results);
      nextUrl = data?.d?.__next ? normalizeNextUrl(data.d.__next) : null;
    } catch (e) {
      const msg = String(e?.response?.data?.error?.message?.value || e?.message || "").toLowerCase();
      if (msg.includes("endjob")) {
        console.warn(`[fetchTasksForSource:${source.id}] EndJob field missing, retry without it`);
        taskFieldNames = taskFieldNames.filter((f) => f.toLowerCase() !== "endjob");
        resultFieldInternalNames = resultFieldInternalNames.filter((f) => f.toLowerCase() !== "endjob");
        if (effectiveRecipientField && effectiveRecipientField.toLowerCase() === "endjob") {
          effectiveRecipientField = null;
          useRecipient = false;
        }
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

  return all.map((r) => toDomainTask(r, { recipientField: effectiveRecipientField, scNumberField }));
}

/**
 * Legacy fetch — тонкая обёртка над fetchTasksForSource("main", …).
 * Поведение #tasks не меняется.
 * @param {{ currentUserId?:number|null, distribution?:any, taskFieldNames?:string[], recipientField?:string|null, scNumberField?:string|null, resultFieldInternalNames?:string[] }} opts
 */
export async function fetchTasks(opts = {}) {
  __dlog("[DBG:fetchTasks] start", { currentUserId: opts.currentUserId, distribution: opts.distribution?.Id||opts.distribution?.OffDepKey||null, resultFieldInternalNames: opts.resultFieldInternalNames, taskFieldNamesLen: (opts.taskFieldNames||[]).length });
  const source = getSourceById("main");
  if (!source) throw new Error("[fetchTasks] main source not configured");
  const client = makeSourceClient(source);
  const mapped = await fetchTasksForSource(source, client, opts);
  // Совместимость с прежним логированием
  try {
    const byType = {};
    for (const m of mapped) {
      const ct = String(m.ContentTypeId || "").slice(0, 18);
      byType[ct] = (byType[ct] || 0) + 1;
    }
    __dlog("[DBG:fetchTasks] results", {
      rawCount: mapped.length,
      mappedCount: mapped.length,
      byContentTypePrefix: byType,
      sample: mapped.slice(0, 3).map((m) => ({
        Id: m.Id,
        Title: (m.Title || "").slice(0, 40),
        Status: m.Status,
        ContentTypeId: String(m.ContentTypeId || "").slice(0, 60),
        RelatedItems: !!m.RelatedItems,
        Recipient: m.Recipient || "(empty)",
        SCNumber: m.SCNumber || "(empty)",
        THU: m.THU || "(empty)",
        ResultTHU: m.ResultSearchTHU,
        ResultValue: m.ResultValue,
        rawKeys: Object.keys(m.raw || {}).filter((k) => k.toLowerCase().includes("result")).slice(0, 5),
      })),
    });
    const comp = mapped.filter((m) => {
      const keys = Object.keys(m.raw || {});
      return keys.some((k) => k.toLowerCase().includes("resultcomplete") || k.toLowerCase().includes("complete")) || String(m.Title || "").toLowerCase().includes("заверш") || String(m.raw?.ContentType?.Name || "").toLowerCase().includes("заверш");
    });
    if (comp.length) {
      __dlog("[DBG:fetchTasks] completion-type tasks", comp.map((m) => ({
        Id: m.Id, Title: m.Title, ContentTypeId: m.ContentTypeId,
        rawResultKeys: Object.keys(m.raw || {}).filter((k) => k.toLowerCase().includes("result")),
        ResultSearchTHU: m.ResultSearchTHU,
        rawComplete: m.raw?.ResultSearchComplete || m.raw?.ResultComplete || m.raw?.Result || "(none)",
      })));
    }
  } catch (_e) { void _e; }
  return mapped;
}