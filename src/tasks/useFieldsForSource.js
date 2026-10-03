// src/tasks/useFieldsForSource.js
// Per-source field detection для Tasks.
// Каждый источник (main/dob) имеет свои поля — нужно запрашивать их
// через /web/lists(guid'…')/fields, а не использовать main-поля для dob.
// План: см. artifacts/plan.md (этап 6 — fields per-source).

import { useQuery } from "@tanstack/react-query";
import { makeSourceClient } from "./sourceClient";
import { resolveSourceListApi } from "./sources";

const CORE_FIELDS = ["Id", "Title", "Body", "AssignedTo/Id", "AssignedTo/Title", "Status", "Location1", "Created", "Modified", "PercentComplete", "DueDate", "Editor/Id", "Editor/Title", "ContentTypeId"];

/**
 * Возвращает список InternalName полей для данного источника.
 * При ошибке (нет доступа, GUID не нашёлся) — возвращает [],
 * чтобы не блокировать работу других источников.
 *
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null, listTitle?:string|null, enabled?:boolean}} source
 * @param {{enabled?:boolean, staleTimeMs?:number}} [opts]
 * @returns {import('@tanstack/react-query').UseQueryResult<string[]>}
 */
export function useFieldsForSource(source, { enabled = true, staleTimeMs = 5 * 60_000 } = {}) {
  return useQuery({
    queryKey: ["tasks", "fields", source?.id || "unknown"],
    queryFn: async () => {
      if (!source) return [];
      const client = makeSourceClient(source);
      let listApi;
      try {
        listApi = await resolveSourceListApi(source, {
          apiBase: client.apiBase,
          get: client.get,
        });
      } catch (e) {
        // Title-резолв не нашёлся — не блокируем остальные источники
        if (typeof window !== "undefined" && window.localStorage?.getItem("dbg_tasks") === "1") {
          // eslint-disable-next-line no-console
          console.warn(`[useFieldsForSource:${source.id}] resolveListApi failed`, e?.message || e);
        }
        return [];
      }
      // listApi уже содержит полный путь:
      // - main: "/web/lists(guid'…')" — apiClient.get префиксует свой baseURL="/api"
      // - dob:  "/dob-api/sites/dob/doblogistic/_api/web/lists(guid'…')" — уже с префиксом
      // Поэтому НЕ добавляем client.apiBase ранее (иначе будет двойной префикс).
      const url = `${listApi}/fields?$select=InternalName,Title,TypeAsString&$top=200`;
      try {
        const resp = await client.get(url, {
          headers: { Accept: "application/json;odata=verbose" },
          __noCache: true,
        });
        const raw = resp?.data?.d?.results || [];
        const names = raw.map((f) => f.InternalName).filter(Boolean);
        // EndJob удалён из всех списков — фильтруем на всякий случай
        return names.filter((n) => n.toLowerCase() !== "endjob");
      } catch (e) {
        if (typeof window !== "undefined" && window.localStorage?.getItem("dbg_tasks") === "1") {
          // eslint-disable-next-line no-console
          console.warn(`[useFieldsForSource:${source.id}] /fields failed`, e?.response?.status, e?.message);
        }
        return [];
      }
    },
    enabled: !!source && source.enabled !== false && enabled,
    staleTime: staleTimeMs,
    refetchOnWindowFocus: false,
    retry: 0, // ошибка одного источника не должна ломать всю таблицу
  });
}

/**
 * Per-source выборка resultFieldInternalNames (по тем же правилам, что и в
 * getTasksListFieldsOverview, но per source).
 * Сейчас список результатов на main и dob может быть разным
 * (например, на dob "ResultSearchComplete" и "ResultFixingProblems"
 * вместо "ResultSearchTHU").
 *
 * @param {string[]} fieldNames — все поля источника
 * @returns {string[]} — массив InternalName полей результата
 */
export function pickResultFieldInternalNames(fieldNames) {
  if (!Array.isArray(fieldNames)) return [];
  // Любое поле, в имени которого есть "Result" (и не "ENDJob" — удалено)
  // и которое не является служебным ("ResultId", "ResultType" и т.п.).
  return fieldNames.filter((n) => {
    const l = String(n).toLowerCase();
    if (l === "endjob") return false;
    if (!l.startsWith("result")) return false;
    // Исключаем служебные поля SharePoint
    if (l === "resultid" || l === "resulttype" || l === "resultguid") return false;
    return true;
  });
}

/**
 * Per-source выборка recipientField (Lookup, который может называться
 * "Recipient" или иначе).
 */
export function pickRecipientField(fieldNames) {
  if (!Array.isArray(fieldNames)) return null;
  let f = fieldNames.find((n) => n === "Recipient");
  if (f) return f;
  f = fieldNames.find((n) => String(n).toLowerCase().includes("получатель"));
  if (f) return f;
  f = fieldNames.find((n) => String(n).toLowerCase().includes("recipient"));
  return f || null;
}

/**
 * Per-source выборка scNumberField.
 */
export function pickScNumberField(fieldNames) {
  if (!Array.isArray(fieldNames)) return null;
  const candidates = ["SCNumber", "ScNumber", "SC_x0020_Number", "SCNumber_x0020_", "OrderNumber", "ТК", "SCNo"];
  for (const c of candidates) {
    const f = fieldNames.find((n) => n === c);
    if (f) return f;
  }
  // fallback: что-то содержащее SC + number
  return fieldNames.find((n) => /sc.*number/i.test(n)) || null;
}

/**
 * Per-source выборка AdditionalActionsField ("AdditionalActions" или "AdditionalsActionsRequired").
 */
export function pickAdditionalActionsFields(fieldNames) {
  if (!Array.isArray(fieldNames)) return { required: null, options: null };
  const hasRequiredNew = fieldNames.includes("AdditionalsActionsRequired");
  const hasRequiredOld = fieldNames.includes("AdditionalActionsRequired");
  const hasOptions = fieldNames.includes("AdditionalActions");
  return {
    required: hasRequiredNew ? "AdditionalsActionsRequired" : hasRequiredOld ? "AdditionalActionsRequired" : null,
    options: hasOptions ? "AdditionalActions" : null,
  };
}

/** Минимальный CORE_FIELDS набор для запроса (если fields per-source ещё не подгружены). */
export { CORE_FIELDS };