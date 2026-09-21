// src/features/tasks/hooks/useTaskConfiguration.js
// Phase 7 — единый React Query кэш конфигурации (изолирован от polling Tasks)
// queryKey: ['task-configuration'], stale 30м, gc несколько часов, no refetchOnWindowFocus

import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../api";
import { fetchResultFieldsMeta, fetchContentTypeResultMap } from "../../../tasks/resultField";
import { TASKS_LIST_API } from "../../../tasks/config";

async function fetchAdditionalActionsMeta() {
  try {
    const url = `${TASKS_LIST_API}/fields/getbytitle('AdditionalActions')?$select=InternalName,Title,TypeAsString,Choices,FillInChoice,AllowMultipleValues,Hidden`;
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
    queryKey: ["task-configuration"],
    queryFn: async () => {
      const [resultFields, ctMap] = await Promise.all([
        fetchResultFieldsMeta(apiClient),
        fetchContentTypeResultMap(apiClient),
      ]);
      const additionalMeta = await fetchAdditionalActionsMeta();
      // Нормализация O(1) lookup (§28): Map<ContentTypeId, TaskConfig>
      const ctConfigMap = new Map();
      for (const [ctId, fieldMeta] of ctMap.entries()) {
        ctConfigMap.set(ctId, {
          contentTypeId: ctId,
          resultField: fieldMeta,
          additionalActionsField: additionalMeta,
          source: "sharepoint-metadata",
        });
      }
      if (!ctConfigMap.has("__default") && resultFields[0]) {
        ctConfigMap.set("__default", {
          contentTypeId: "__default",
          resultField: resultFields[0],
          additionalActionsField: additionalMeta,
          source: "fallback",
        });
      }
      return {
        resultFields,
        ctMap,
        additionalMeta,
        ctConfigMap,
        fetchedAt: Date.now(),
      };
    },
    enabled,
    staleTime: 30 * 60_000, // 30м — конфигурация меняется редко
    gcTime: 4 * 60 * 60_000, // 4ч
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  // resolver O(1)
  const resolve = (contentTypeId) => {
    const data = query.data;
    if (!data) return null;
    if (data.ctConfigMap.has(contentTypeId)) return data.ctConfigMap.get(contentTypeId);
    // prefix match как в getResultFieldForTask
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
