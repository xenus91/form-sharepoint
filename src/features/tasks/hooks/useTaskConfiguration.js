// src/features/tasks/hooks/useTaskConfiguration.js
// Phase 7 — единый React Query кэш конфигурации (изолирован от polling Tasks)
// queryKey: ['task-configuration'], stale 30м, gc несколько часов, no refetchOnWindowFocus

import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../api";
import { fetchResultFieldsMeta, fetchContentTypeResultMap } from "../../../tasks/resultField";
import { TASKS_LIST_API } from "../../../tasks/config";
import { fetchTaskTypeConfigurationMap } from "../../../services/taskTypeConfiguration";

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

async function fetchAdditionalActionsMeta() {
  return fetchAdditionalActionsMetaByName("AdditionalActions");
}

export function useTaskConfiguration({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: ["task-configuration"],
    queryFn: async () => {
      const [resultFields, ctMap, taskTypeMap] = await Promise.all([
        fetchResultFieldsMeta(apiClient),
        fetchContentTypeResultMap(apiClient),
        fetchTaskTypeConfigurationMap(apiClient).catch(() => null),
      ]);
      const additionalMeta = await fetchAdditionalActionsMeta();
      // Если TaskTypeConfiguration задаёт разные AdditionalActions поля — догружаем их метаданные
      const distinctAdditionalNames = new Set();
      if (taskTypeMap && taskTypeMap.size > 0) {
        for (const cfg of taskTypeMap.values()) {
          if (cfg.additionalActionsFieldInternalName && cfg.additionalActionsFieldInternalName !== "AdditionalActions") {
            distinctAdditionalNames.add(cfg.additionalActionsFieldInternalName);
          }
        }
      }
      const additionalMetaByName = new Map();
      additionalMetaByName.set(additionalMeta?.internalName || "AdditionalActions", additionalMeta);
      if (distinctAdditionalNames.size > 0) {
        await Promise.all(
          Array.from(distinctAdditionalNames).map(async (name) => {
            const meta = await fetchAdditionalActionsMetaByName(name);
            if (meta) additionalMetaByName.set(name, meta);
            else additionalMetaByName.set(name, null);
          })
        );
      }
      // Нормализация O(1) lookup (§28): Map<ContentTypeId, TaskConfig>
      const ctConfigMap = new Map();
      for (const [ctId, fieldMeta] of ctMap.entries()) {
        let additionalField = additionalMeta;
        let source = "sharepoint-metadata";
        if (taskTypeMap) {
          // точное или prefix совпадение в TaskTypeConfiguration
          let typeCfg = taskTypeMap.get(ctId) || null;
          if (!typeCfg && ctId !== "__default") {
            let best = null, bestLen = -1;
            for (const [key, val] of taskTypeMap.entries()) {
              if (ctId.startsWith(key) && key.length > bestLen) { best = val; bestLen = key.length; }
            }
            typeCfg = best;
          }
          if (typeCfg?.additionalActionsFieldInternalName) {
            const byName = additionalMetaByName.get(typeCfg.additionalActionsFieldInternalName);
            if (byName !== undefined) {
              additionalField = byName; // может быть null → missing-field diagnostic
              source = byName ? "task-type-config" : "task-type-config-missing-field";
            }
          } else if (typeCfg) {
            source = "task-type-config";
          }
        }
        ctConfigMap.set(ctId, {
          contentTypeId: ctId,
          resultField: fieldMeta,
          additionalActionsField: additionalField,
          source,
          taskTypeConfig: taskTypeMap?.get(ctId) || null,
        });
      }
      if (!ctConfigMap.has("__default") && resultFields[0]) {
        ctConfigMap.set("__default", {
          contentTypeId: "__default",
          resultField: resultFields[0],
          additionalActionsField: additionalMeta,
          source: taskTypeMap && taskTypeMap.size>0 ? "task-type-config" : "fallback",
        });
      }
      return {
        resultFields,
        ctMap,
        additionalMeta,
        additionalMetaByName,
        taskTypeMap,
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
