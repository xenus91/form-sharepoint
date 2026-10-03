// src/tasks/enrichDistributionForSources.js
// Предварительная резолвация Id групп/пользователей из DcEmail для каждого
// источника (main/dob), чтобы fetchTasksForSource использовал готовые
// ID вместо резолва на лету.
//
// Идея: после получения DcEmail (с Id групп основного сайта) резолвим эти
// группы/пользователи на каждом сайте-источнике, кэшируем и передаём
// готовый массив ID в fetchTasksMultiSource. Это:
//   1) избегает race-condition между identity-resolution и tasks fetch
//   2) кэширует ID на сессию (sessionStorage)
//   3) даёт UI возможность показать прогресс резолва до загрузки задач
//
// План: см. artifacts/plan.md (этапы 3, 5).

import { useQuery } from "@tanstack/react-query";
import { listDistributionPrincipals } from "./distribution";
import { resolveSourceIdentity } from "./identity";

/**
 * Резолвит principals из dist на каждом источнике и возвращает мапу
 * { [sourceId]: { userId, principalIds, ok } }.
 * Использует React Query для кэширования.
 *
 * @param {Array<{id:string, clientKind:string, listApi?:string|null, enabled?:boolean}>} sources
 * @param {object|null} distribution
 * @param {{enabled?:boolean}} [opts]
 * @returns {import('@tanstack/react-query').UseQueryResult<{[sourceId:string]: {userId:number|null, principalIds:number[], ok:boolean}}>}
 */
export function useEnrichDistributionForSources(sources, distribution, { enabled = true } = {}) {
  const enabledSources = (sources || []).filter((s) => s && s.enabled !== false);
  const sourceIdsKey = enabledSources.map((s) => s.id).sort().join(",") || "none";
  const distKey = distribution?.Id ?? distribution?.OffDepKey ?? null;
  const principals = distribution ? listDistributionPrincipals(distribution) : [];
  const principalsHash = principals.map((p) => `${p.kind}:${p.id}:${(p.title||"").slice(0,20)}`).sort().join("|");

  return useQuery({
    queryKey: ["tasks", "siteIds", sourceIdsKey, distKey, principalsHash],
    queryFn: async () => {
      const map = {};
      await Promise.allSettled(
        enabledSources.map(async (source) => {
          const resolved = await resolveSourceIdentity(source, principals);
          map[source.id] = {
            userId: resolved.userId,
            principalIds: resolved.principalIds,
            unresolved: resolved.unresolved,
            ok: resolved.ok,
            reason: resolved.reason,
          };
        })
      );
      return map;
    },
    enabled: !!distribution && enabledSources.length > 0 && enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}