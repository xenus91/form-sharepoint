// src/tasks/useTasksForSources.js
// React Query hook для multi-source загрузки задач.
// План: см. artifacts/plan.md (этап 5).
//
// Per-source fields: для каждого источника вызывается useFieldsForSource,
// результат передаётся в fetchTasksMultiSource через sourceFieldsById.
// Это критично — main и dob имеют РАЗНЫЕ поля (например, на main
// есть "ResultSearchTHU", на dob — "ResultSearchComplete"/"ResultFixingProblems").

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTasksMultiSource } from "./multiSource";
import { listDistributionPrincipals } from "./distribution";
import { useFieldsForSource } from "./useFieldsForSource";

/**
 * @param {{
 *   sources: Array<{id:string, enabled?:boolean, [k:string]:any}>,
 *   distribution?: any,
 *   taskFieldNames?: string[],      // fallback для main (если useFieldsForSource не подгрузил)
 *   recipientField?: string|null,
 *   scNumberField?: string|null,
 *   resultFieldInternalNames?: string[],
 *   enabled?: boolean,
 *   staleTimeMs?: number,
 *   refetchIntervalMs?: number,
 * }} opts
 * @returns {import('@tanstack/react-query').UseQueryResult<{items:Array, errors:Array, perSourceStats:object}>}
 */
export function useTasksForSources({
  sources,
  distribution = null,
  taskFieldNames = [],
  recipientField = null,
  scNumberField = null,
  resultFieldInternalNames = [],
  enabled = true,
  staleTimeMs = 5 * 60_000,
  refetchIntervalMs = 5 * 60_000,
}) {
  const enabledSources = (sources || []).filter((s) => s && s.enabled !== false);
  const sourceIds = enabledSources.map((s) => s.id).join("+") || "none";
  const principals = distribution ? listDistributionPrincipals(distribution) : [];
  const principalsHash = principals.map((p) => `${p.kind}:${p.id}:${(p.title||"").slice(0,20)}`).sort().join("|");
  const fieldsHash = (taskFieldNames || []).join(",") + "|" + (recipientField || "") + "|" + (scNumberField || "") + "|" + (resultFieldInternalNames || []).join(",");
  const distributionKey = distribution?.Id ?? distribution?.OffDepKey ?? null;

  // Per-source поля через useFieldsForSource
  const mainFields = useFieldsForSource(
    enabledSources.find((s) => s.id === "main"),
    { enabled: enabled && !!enabledSources.find((s) => s.id === "main") }
  );
  const dobFields = useFieldsForSource(
    enabledSources.find((s) => s.id === "dob"),
    { enabled: enabled && !!enabledSources.find((s) => s.id === "dob") }
  );

  const sourceFieldsById = useMemo(() => {
    const map = {};
    if (enabledSources.find((s) => s.id === "main") && mainFields.data) {
      map.main = mainFields.data;
    } else if (taskFieldNames.length > 0) {
      // fallback: пока useFieldsForSource грузится — используем taskFieldNames
      map.main = taskFieldNames;
    }
    if (enabledSources.find((s) => s.id === "dob") && dobFields.data) {
      map.dob = dobFields.data;
    } else {
      // Для dob fallback на [] — НЕЛЬЗЯ использовать main-поля.
      // dob требует свой /fields; пока нет — fetch отложен.
      map.dob = [];
    }
    return map;
  }, [
    enabledSources.map((s) => s.id).join(","),
    mainFields.data,
    dobFields.data,
    taskFieldNames.length,
  ]);

  // Если dob активен, но его поля ещё не подгружены — НЕ запускаем fetch (иначе 400)
  const dobActive = enabledSources.find((s) => s.id === "dob");
  const dobReady = !dobActive || dobFields.isSuccess || dobFields.data !== undefined;
  const fetchEnabled = enabled && !!sources && sources.length > 0 && dobReady;

  const queryKey = [
    "tasks",
    "rows",
    sourceIds,
    distributionKey,
    principalsHash,
    fieldsHash,
    JSON.stringify({
      main: (map.main || []).length,
      dob: (map.dob || []).length,
    }),
  ];

  return useQuery({
    queryKey,
    queryFn: () => fetchTasksMultiSource({
      sources,
      principals,
      distribution,
      taskFieldNames,
      recipientField,
      scNumberField,
      resultFieldInternalNames,
      sourceFieldsById,
    }),
    enabled: fetchEnabled,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });
}