import apiClient, { normalizeNextUrl } from "../api";
import { buildTaskListQuery } from "./listQuery";
import { mapRawTask } from "./mapping";

/**
 * Чистая fetch-функция для списка задач (без React state).
 * Повторяет логику loadTasks из TasksView, но возвращает Promise<Array<Task>>.
 * Используется TanStack Query queryFn.
 */
export async function fetchTasks({ currentUserId, distribution, taskFieldNames = [], recipientField = null, scNumberField = null, resultFieldInternalNames = [] }) {
  if (!currentUserId) return [];
  let useDueDate = true;
  let useAdditionalActions = true;
  let useRecipient = !!recipientField || taskFieldNames.length === 0;
  // если recipientField === null на первом рендере, пробуем дефолт "Recipient" (см. listQuery)
  let effectiveRecipientField = recipientField || (taskFieldNames.length === 0 ? "Recipient" : null);
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
    });

  let nextUrl = buildUrl();
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

  const mapped = all.map((r) => mapRawTask(r, { recipientField: effectiveRecipientField, scNumberField }));
  return mapped;
}
