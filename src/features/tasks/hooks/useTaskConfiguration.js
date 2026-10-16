// src/features/tasks/hooks/useTaskConfiguration.js
// ⭐ v9: legacy-списки TaskPromptFields/TaskResultDefinitions/TaskActionDefinitions удалены в SP.
//
// Запросы только к метаданным полей Tasks:
//   - fetchResultFieldsMeta: список Result-полей
//   - fetchContentTypeResultMap: CT → Result-field
//   - fetchContentTypeMeta: CT meta {name, stringId} — нужен для маппинга CT.Name → TaskBehaviour.Title
//   - fetchTaskBehaviour: ⭐ список настроек поведения (новый, lookup по Title)
//   - fetchAdditionalActionsMeta: метаданные поля AdditionalActions (Choices/Default) на Tasks list
//
// queryKey: ["task-configuration","v9"] — bump для bust stale cache, где ещё могут крутиться taskResultDefinitions.

import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../api";
import { fetchResultFieldsMeta, fetchContentTypeResultMap, fetchContentTypeMeta } from "../../../tasks/resultField";
import { TASKS_LIST_API } from "../../../tasks/config";
import { fetchTaskBehaviour } from "../../../services/taskBehaviour";

async function fetchAdditionalActionsMetaByName(internalName) {
  const name = String(internalName || "AdditionalActions").trim() || "AdditionalActions";
  try {
    const url = `${TASKS_LIST_API}/fields/getbytitle('${name}')?$select=InternalName,Title,TypeAsString,Choices,FillInChoice,AllowMultipleValues,Hidden`;
    const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
    const f = data?.d;
    if (!f || f.Hidden) return null;
    return {
      internalName: f.InternalName,
      title: f.Title,
      typeAsString: f.TypeAsString,
      choices: f.Choices?.results ? [...f.Choices.results] : Array.isArray(f.Choices) ? [...f.Choices] : [],
      allowFillIn: !!f.FillInChoice,
      allowMultiple: !!f.AllowMultipleValues,
    };
  } catch {
    return null;
  }
}

export function useTaskConfiguration({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: ["task-configuration","v9"],
    queryFn: async () => {
      // ⭐ v9: больше никаких legacy-списков (TaskPromptFields/ResultDef/ActionDef).
      // Всё поведение (promptable-поля/AA-visibility/confirm/animation/styling) теперь
      // живёт в TaskBehaviour, fetched через fetchTaskBehaviour.
      const [resultFields, ctMap, ctMetaMap, taskBehaviourMap] = await Promise.all([
        fetchResultFieldsMeta(apiClient),
        fetchContentTypeResultMap(apiClient),
        fetchContentTypeMeta(apiClient),
        fetchTaskBehaviour(apiClient).catch(() => null),
      ]);
      const additionalMeta = await fetchAdditionalActionsMetaByName("AdditionalActions");

      // Нормализация O(1) lookup: Map<ContentTypeId, TaskConfig>
      // БЕЗ TaskTypeConfiguration, TaskActionDefinitions — defaults-принцип.
      const ctConfigMap = new Map();
      for (const [ctId, fieldMeta] of ctMap.entries()) {
        ctConfigMap.set(ctId, {
          contentTypeId: ctId,
          resultField: fieldMeta,
          additionalActionsField: additionalMeta,
          defaultActions: null, // defaults — из самого поля AdditionalActions.DefaultValue (TaskCard использует fallback)
          source: "sharepoint-metadata",
        });
      }
      if (!ctConfigMap.has("__default") && resultFields[0]) {
        ctConfigMap.set("__default", {
          contentTypeId: "__default",
          resultField: resultFields[0],
          additionalActionsField: additionalMeta,
          defaultActions: null,
          source: "fallback",
        });
      }
      return {
        resultFields,
        ctMap,
        ctMetaMap, // ⭐ Map<ctId, {name, stringId}> для маппинга CT.Name → TaskBehaviour.Title
        additionalMeta,
        taskBehaviour: taskBehaviourMap, // ⭐ Map<Title, rawRecord> или null (404 — список ещё не создан)
        ctConfigMap,
        fetchedAt: Date.now(),
      };
    },
    enabled,
    staleTime: 5 * 60_000, // 5 мин
    gcTime: 4 * 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const resolve = (contentTypeId) => {
    const data = query.data;
    if (!data) return null;
    if (data.ctConfigMap.has(contentTypeId)) return data.ctConfigMap.get(contentTypeId);
    let best = null;
    let bestLen = -1;
    for (const [key, val] of data.ctConfigMap.entries()) {
      if (key === "__default") continue;
      if (contentTypeId?.startsWith(key) && key.length > bestLen) {
        best = val;
        bestLen = key.length;
      }
    }
    return best || data.ctConfigMap.get("__default") || null;
  };

  return { ...query, resolveTaskConfig: resolve };
}
