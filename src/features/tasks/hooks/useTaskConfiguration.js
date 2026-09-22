// src/features/tasks/hooks/useTaskConfiguration.js
// Phase 7+17 — единый React Query кэш конфигурации (изолирован от polling Tasks)
// queryKey: ['task-configuration'], stale 30м, gc несколько часов, no refetchOnWindowFocus
// Включает: ResultField discovery, ContentType map, TaskResultDefinitions (§14), TaskActionDefinitions (§21) — TaskTypeConfiguration (§17) ОТКЛЮЧЁН до аудита
// TaskResult/ActionDefinitions — graceful 404 → fallback. TaskTypeConfiguration не дергается до аудита (нет 404).

import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../api";
import { fetchResultFieldsMeta, fetchContentTypeResultMap } from "../../../tasks/resultField";
import { TASKS_LIST_API } from "../../../tasks/config";
// import { fetchTaskTypeConfigurationMap } from "../../../services/taskTypeConfiguration"; // §17 ОТКЛЮЧЁН до аудита — чтобы не было 404 TaskTypeConfiguration
import { fetchTaskResultDefinitions } from "../../../services/taskResultDefinitions";
import { fetchTaskActionDefinitions, resolveActionChoices } from "../../../services/taskActionDefinitions";

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
    queryKey: ["task-configuration","v4"], // bumped v2 to force refetch after Enabled fix
    queryFn: async () => {
      // §17 TaskTypeConfiguration ОТКЛЮЧЁН до аудита content-types.md — нет 404 в Network
      // Оставлен только TaskResultDefinitions (§14) + TaskActionDefinitions (§21)
      const [resultFields, ctMap, resultDefs, actionDefs] = await Promise.all([
        fetchResultFieldsMeta(apiClient),
        fetchContentTypeResultMap(apiClient),
        fetchTaskResultDefinitions(apiClient).catch(() => null),
        fetchTaskActionDefinitions(apiClient).catch(() => null),
      ]);
      const taskTypeMap = null; // отключён до аудита
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
      // Merge TaskActionDefinitions в choices без ребилда
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
        // Merge TaskActionDefinitions без ребилда: если список существует и есть записи — используем его,
        // иначе fallback к полевым choices. Не делаем union с полевыми choices когда defChoices есть — иначе отключённые (Enabled=Нет) возвращаются через extra.
        let effectiveAdditionalField = additionalField;
        if (additionalField || actionDefs) {
          const baseChoices = additionalField?.choices || [];
          const defChoices = resolveActionChoices(ctId, actionDefs, null);
          let mergedChoices = baseChoices;
          let mergedSource = source;
          if (defChoices && defChoices.length > 0) {
            // Если TaskActionDefinitions есть для этого CT — используем только его (Enabled=Да уже отфильтрованы в fetchTaskActionDefinitions). Не добавляем extra из поля, иначе отключённые действия (Enabled=Нет) вернутся.
            mergedChoices = [...defChoices];
            mergedSource = source === "sharepoint-metadata" && actionDefs ? "task-action-definitions" : source + "+task-action-definitions";
          }
          if (additionalField) {
            effectiveAdditionalField = { ...additionalField, choices: mergedChoices };
          } else if (mergedChoices.length) {
            effectiveAdditionalField = {
              internalName: "AdditionalActions",
              title: "Дополнительные действия",
              typeAsString: "MultiChoice",
              choices: mergedChoices.map(c=> typeof c==='string'? c : c.value),
              allowFillIn: true,
              allowMultiple: true,
            };
            // normalize to same shape as additionalField
            effectiveAdditionalField.choices = mergedChoices.map(c=> typeof c==='string'? c : c.value);
          }
          // keep source for diagnostics
          source = mergedSource;
        }
        ctConfigMap.set(ctId, {
          contentTypeId: ctId,
          resultField: fieldMeta,
          additionalActionsField: effectiveAdditionalField,
          source,
          taskTypeConfig: taskTypeMap?.get(ctId) || null,
        });
      }
      // Дополнительно: создаём ctConfigMap записи для CT из TaskActionDefinitions, даже если их нет в ctMap (поле Result не найдено, но действия есть)
      if (actionDefs && actionDefs.byCt) {
        for (const [ctIdFromDefs, arr] of actionDefs.byCt.entries()) {
          if (!ctConfigMap.has(ctIdFromDefs)) {
            const baseField = additionalMeta;
            const defChoicesForCt = resolveActionChoices(ctIdFromDefs, actionDefs, null);
            let effField = baseField;
            if (defChoicesForCt && defChoicesForCt.length > 0) {
              effField = baseField ? { ...baseField, choices: defChoicesForCt.map(c=> typeof c==='string'? c : c.value) } : { internalName: "AdditionalActions", title: "Дополнительные действия", typeAsString: "MultiChoice", choices: defChoicesForCt.map(c=>c.value), allowFillIn:true, allowMultiple:true };
            }
            ctConfigMap.set(ctIdFromDefs, {
              contentTypeId: ctIdFromDefs,
              resultField: resultFields[0] || null,
              additionalActionsField: effField,
              source: defChoicesForCt && defChoicesForCt.length ? "task-action-definitions" : "fallback",
              taskTypeConfig: null,
            });
          }
        }
      }
      // Ensure __default also merges action defs
      if (!ctConfigMap.has("__default") && resultFields[0]) {
        let defAdd = additionalMeta;
        if (actionDefs) {
          const defChoices = resolveActionChoices("__default", actionDefs, additionalMeta?.choices || []);
          if (defChoices && defChoices.length) {
            // Только defChoices, без extra из поля — иначе Enabled=Нет вернётся
            const merged = [...defChoices];
            defAdd = additionalMeta ? { ...additionalMeta, choices: merged.map(c=> typeof c==='string'? c : c.value) } : { internalName:"AdditionalActions", title:"Дополнительные действия", typeAsString:"MultiChoice", choices: merged.map(c=>c.value), allowFillIn:true, allowMultiple:true };
          }
        }
        ctConfigMap.set("__default", {
          contentTypeId: "__default",
          resultField: resultFields[0],
          additionalActionsField: defAdd,
          source: taskTypeMap && taskTypeMap.size>0 ? "task-type-config" : (actionDefs ? "task-action-definitions" : "fallback"),
        });
      }
      return {
        resultFields,
        ctMap,
        additionalMeta,
        additionalMetaByName,
        taskTypeMap,
        taskResultDefinitions: resultDefs,
        taskActionDefinitions: actionDefs,
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
