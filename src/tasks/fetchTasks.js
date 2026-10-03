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
import { buildTaskListQuery, baseFieldName, readSelectFields } from "./listQuery";
// eslint-disable-next-line no-unused-vars
import { mapRawTask } from "./mapping";
import { toDomainTask } from "../domain/tasks/taskModel";
import { getSourceById } from "./sources";
import { makeSourceClient } from "./sourceClient";
import { extractMissingField, extractSpErrorMessage, isMissingFieldError } from "./spError";

/**
 * Чистая fetch-функция для одного источника задач (multi-source).
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null, resolveListApi?:(() => string|Promise<string>)|null}} source
 * @param {{apiBase:string, listApi:()=>string|Promise<string>, get:(url:string, opts?:any)=>Promise<{data:any}>, toRequestUrl?:(url:string)=>string}} client
 * @param {{ currentUserId?:number|null, distribution?:any, taskFieldNames?:string[], recipientField?:string|null, scNumberField?:string|null, resultFieldInternalNames?:string[], assignedIds?:number[]|null, listApi?:string|null, excludeCompleted?:boolean, selectProfile?:"main"|"external", omittedFields?:string[] }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchTasksForSource(source, client, opts = {}) {
  if (!source || !client) throw new Error("[fetchTasksForSource] source & client required");
  const initialOpts = {
    currentUserId: null,
    distribution: null,
    taskFieldNames: [],
    recipientField: null,
    scNumberField: null,
    resultFieldInternalNames: [],
    assignedIds: null,
    listApi: null,
    excludeCompleted: true,
    selectProfile: "main",
    ...opts,
  };
  const {
    currentUserId,
    distribution,
    recipientField: initialRecipientField,
    scNumberField,
    assignedIds,
    excludeCompleted,
    selectProfile,
  } = initialOpts;
  __dlog("[DBG:fetchTasksForSource] start", { sourceId: source.id, currentUserId, distributionId: distribution?.Id||null, assignedIdsLen: Array.isArray(assignedIds) ? assignedIds.length : null, selectProfile });
  if (!currentUserId && !(Array.isArray(assignedIds) && assignedIds.length > 0)) return [];

  let taskFieldNames = Array.isArray(initialOpts.taskFieldNames) ? [...initialOpts.taskFieldNames] : [];
  let resultFieldInternalNames = Array.isArray(initialOpts.resultFieldInternalNames) ? [...initialOpts.resultFieldInternalNames] : [];
  let recipientField = initialRecipientField || null;
  const omittedFields = new Set((initialOpts.omittedFields || []).map((f) => String(f).toLowerCase()));
  let useDueDate = true;
  let useAdditionalActions = true;
  let useRecipient = !!recipientField;
  let effectiveRecipientField = recipientField || null;
  const effectiveListApi = initialOpts.listApi || (typeof client.listApi === "function" ? await client.listApi() : "");
  const toRequestUrl = typeof client.toRequestUrl === "function"
    ? client.toRequestUrl
    : (url) => {
        if (typeof client.apiBase === "string" && client.apiBase && !/^https?:\/\//.test(url) && !url.startsWith("/api/") && !url.startsWith("/dob-api/")) {
          return `${client.apiBase}${url.startsWith("/") ? url : `/${url}`}`;
        }
        if (/^https?:\/\//.test(url) && client.apiBase && client.apiBase.startsWith("/")) {
          try {
            const u = new URL(url);
            return u.pathname + u.search;
          } catch (_e) { void _e; }
        }
        return url;
      };

  const buildUrl = () =>
    buildTaskListQuery({
      listApi: effectiveListApi,
      taskFieldNames,
      selectProfile,
      omittedFields: [...omittedFields],
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
  let recoveries = 0;
  while (nextUrl && safety < 20) {
    try {
      const urlForClient = toRequestUrl(nextUrl);
      const resp = await client.get(urlForClient, {
        headers: { Accept: "application/json;odata=verbose" },
        __noCache: true,
      });
      const data = resp?.data || {};
      const results = data?.d?.results || [];
      all = all.concat(results);
      nextUrl = data?.d?.__next ? normalizeNextUrl(data.d.__next) : null;
    } catch (e) {
      const rawMsg = extractSpErrorMessage(e);
      const msg = String(rawMsg).toLowerCase();
      // ── точечные, исторические ретраи ──────────────────────────────────────
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
      // Legacy-фикс: в $select lookup-поле должно быть "AssignedTo/Id", а не "AssignedToId".
      // ВАЖНО: раньше проверка была по всему URL и срабатывала на ЛЮБУЮ ошибку —
      // в том числе на закодированный $filter (где AssignedToId — правильная форма),
      // из-за чего ретраи «пинг-понговали» между двумя видами URL и тратились впустую.
      if (/\$select=[^&]*\bAssignedToId\b/.test(nextUrl)) {
        nextUrl = nextUrl.replace(/(\$select=[^&]*?)\bAssignedToId\b/, "$1AssignedTo/Id");
        continue;
      }
      // ── универсальное восстановление: SharePoint назвал отсутствующее поле ──
      // Раньше незнакомое поле (например ResultSearchTHU на сайте ДОБ) роняло
      // весь источник → в таблице не было ни одной задачи. Теперь поле исключаем
      // и повторяем запрос (не более 8 раз на источник).
      if (recoveries < 8 && isMissingFieldError(rawMsg)) {
        const bad = extractMissingField(rawMsg);
        if (bad) {
          const badLower = bad.toLowerCase();
          let changed = false;
          // 1) поле в $select (могло прийти из ядра, result-полей, extras)
          const selected = readSelectFields(nextUrl);
          const hit = selected.find((f) => baseFieldName(f) === badLower || f.toLowerCase() === badLower);
          if (hit) {
            omittedFields.add(baseFieldName(hit));
            changed = true;
          }
          // 2) поле в taskFieldNames / resultFieldInternalNames
          if (taskFieldNames.some((f) => String(f).toLowerCase() === badLower)) {
            taskFieldNames = taskFieldNames.filter((f) => String(f).toLowerCase() !== badLower);
            omittedFields.add(badLower);
            changed = true;
          }
          if (resultFieldInternalNames.some((f) => String(f).toLowerCase() === badLower)) {
            resultFieldInternalNames = resultFieldInternalNames.filter((f) => String(f).toLowerCase() !== badLower);
            omittedFields.add(badLower);
            changed = true;
          }
          // 3) recipient-поле
          if (effectiveRecipientField && effectiveRecipientField.toLowerCase() === badLower) {
            useRecipient = false;
            effectiveRecipientField = null;
            changed = true;
          }
          if (changed) {
            recoveries += 1;
            console.warn(`[fetchTasksForSource:${source.id}] поле "${bad}" отсутствует в списке — исключаю и повторяю запрос`);
            nextUrl = buildUrl();
            continue;
          }
          // Поле названо, но мы его не запрашивали (например, $orderby/$expand) —
          // повторять бессмысленно.
          console.warn(`[fetchTasksForSource:${source.id}] SharePoint сообщил о поле "${bad}", но оно не в select — пробрасываю ошибку`);
        }
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
  const mapped = await fetchTasksForSource(source, client, { ...opts, selectProfile: opts.selectProfile || "main" });
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
