// src/tasks/useTasksForSources.js
// React Query hook для multi-source загрузки задач.
// План: см. artifacts/plan.md (этап 5).

import { useQuery } from "@tanstack/react-query";
import { fetchTasksMultiSource } from "./multiSource";
import { listDistributionPrincipals } from "./distribution";

/**
 * @param {{
 *   sources: Array<{id:string, enabled?:boolean, [k:string]:any}>,
 *   distribution?: any,
 *   taskFieldNames?: string[],
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
  const sourceIds = (sources || []).filter((s) => s && s.enabled !== false).map((s) => s.id).join("+") || "none";
  const principals = distribution ? listDistributionPrincipals(distribution) : [];
  const principalsHash = principals.map((p) => `${p.kind}:${p.id}:${(p.title||"").slice(0,20)}`).sort().join("|");
  const fieldsHash = (taskFieldNames || []).join(",") + "|" + (recipientField || "") + "|" + (scNumberField || "") + "|" + (resultFieldInternalNames || []).join(",");
  const distributionKey = distribution?.Id ?? distribution?.OffDepKey ?? null;

  const queryKey = [
    "tasks",
    "rows",
    sourceIds,
    distributionKey,
    principalsHash,
    fieldsHash,
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
    }),
    enabled: !!sources && sources.length > 0 && enabled,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });
}