// src/features/tasks/hooks/useTasksTableData.js
// Хук для табличного режима #tasks: useTasksSources + useTasksForSources + фильтрация.
// План: см. artifacts/plan.md (этап 7).

import { useMemo } from "react";
import { useTasksSources } from "./useTasksSources";
import { useTasksForSources } from "../../../tasks/useTasksForSources";
import { useEnrichDistributionForSources } from "../../../tasks/enrichDistributionForSources";

/**
 * @param {{
 *   userProfile?: any,
 *   distribution?: any,
 *   taskFieldNames?: string[],
 *   recipientField?: string|null,
 *   scNumberField?: string|null,
 *   resultFieldInternalNames?: string[],
 *   enabled?: boolean,
 *   mode?: "cards"|"table" — в табличном режиме грузим всегда; в карточном —
 *     только если активен более одного источника (чтобы смёржить задачи dob в список).
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
    mode = "table",
    filterFn = null,
  } = opts;

  const sources = useTasksSources(userProfile);
  const activeSources = sources.filter((s) => s && s.enabled !== false);
  // Карточкам нужны только «внешние» строки (main уже загружен useTasksQuery),
  // поэтому в карточном режиме не дублируем загрузку основного списка.
  const querySources = mode === "cards" ? activeSources.filter((s) => s.id !== "main") : activeSources;
  const shouldFetch = enabled && querySources.length > 0;

  // DBG: фиксируем вход в хук и какие источники активны
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("dbg_tasks") === "1") {
      // eslint-disable-next-line no-console
      console.log("[DBG:useTasksTableData]", {
        enabled,
        mode,
        shouldFetch,
        querySourcesIds: querySources.map((s) => s.id),
        sourcesIds: sources.map((s) => s.id),
        sourcesKind: sources.map((s) => s.clientKind),
        sourcesEnabled: sources.map((s) => s.enabled),
      });
    }
  } catch (_e) { void _e; }

  // Предварительная резолвация ID групп/пользователей на каждом сайте.
  // Параллельно с /fields — не блокирует tasks fetch.
  const siteIdsQuery = useEnrichDistributionForSources(querySources, distribution, {
    enabled: shouldFetch && !!distribution && querySources.length > 0,
  });

  const query = useTasksForSources({
    sources: querySources,
    distribution,
    taskFieldNames,
    recipientField,
    scNumberField,
    resultFieldInternalNames,
    enabled: shouldFetch,
    sitePrincipalIds: siteIdsQuery.data,
  });

  const filtered = useMemo(() => {
    const items = query.data?.items || [];
    if (typeof filterFn !== "function") return items;
    return filterFn(items);
  }, [query.data, filterFn]);

  return {
    mode,
    shouldFetch,
    querySources,
    rows: filtered,
    errors: query.data?.errors || [],
    perSourceStats: query.data?.perSourceStats || {},
    sitePrincipalIds: siteIdsQuery.data || {},
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error || null,
    refetch: query.refetch,
    sources,
  };
}