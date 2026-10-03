// src/features/tasks/hooks/useTasksTableData.js
// Хук для табличного режима #tasks: useTasksSources + useTasksForSources + фильтрация.
// План: см. artifacts/plan.md (этап 7).

import { useMemo } from "react";
import { useTasksSources } from "./useTasksSources";
import { useTasksForSources } from "../../../tasks/useTasksForSources";

/**
 * @param {{
 *   userProfile?: any,
 *   distribution?: any,
 *   taskFieldNames?: string[],
 *   recipientField?: string|null,
 *   scNumberField?: string|null,
 *   resultFieldInternalNames?: string[],
 *   enabled?: boolean,
 *   filterFn?: (rows: any[]) => any[],
 * }} [opts]
 */
export function useTasksTableData(opts = {}) {
  const {
    userProfile = null,
    distribution = null,
    taskFieldNames = [],
    recipientField = null,
    scNumberField = null,
    resultFieldInternalNames = [],
    enabled = true,
    filterFn = null,
  } = opts;

  const sources = useTasksSources(userProfile);

  // DBG: фиксируем вход в хук и какие источники активны
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("dbg_tasks") === "1") {
      // eslint-disable-next-line no-console
      console.log("[DBG:useTasksTableData]", {
        enabled,
        sourcesIds: sources.map((s) => s.id),
        sourcesKind: sources.map((s) => s.clientKind),
        sourcesEnabled: sources.map((s) => s.enabled),
      });
    }
  } catch (_e) { void _e; }

  const query = useTasksForSources({
    sources,
    distribution,
    taskFieldNames,
    recipientField,
    scNumberField,
    resultFieldInternalNames,
    enabled,
  });

  const filtered = useMemo(() => {
    const items = query.data?.items || [];
    if (typeof filterFn !== "function") return items;
    return filterFn(items);
  }, [query.data, filterFn]);

  return {
    rows: filtered,
    errors: query.data?.errors || [],
    perSourceStats: query.data?.perSourceStats || {},
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error || null,
    refetch: query.refetch,
    sources,
  };
}