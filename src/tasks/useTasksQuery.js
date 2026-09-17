import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTasks } from "./fetchTasks";
import { enrichTasksWithRelated } from "./enrich";
import { extractTKNumberFromTask, extractTKNumber } from "./formatters";
import { useEffect } from "react";

export function useTasksQuery({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField, enabled = true }) {
  const queryClient = useQueryClient();

  const queryKey = [
    "tasks",
    currentUserId ?? null,
    distribution?.Id ?? distribution?.OffDepKey ?? null,
    (taskFieldNames || []).join(","),
    recipientField ?? null,
    scNumberField ?? null,
  ];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchTasks({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField }),
    enabled: !!currentUserId && enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });

  // Фоновое обогащение Recipient/SCNumber — не блокирует основной список,
  // патчит кэш через setQueryData с диффом (без лишних ререндеров)
  useEffect(() => {
    const data = query.data;
    if (!data || data.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { recipientMap, scNumberMap } = await enrichTasksWithRelated(data, { concurrency: 5 });
        if (cancelled) return;
        if (recipientMap.size === 0 && scNumberMap.size === 0) return;
        queryClient.setQueryData(queryKey, (prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((p) => {
            const newRec = recipientMap.get(p.Id);
            const newSc = scNumberMap.get(p.Id);
            let needNew = false;
            if (newRec !== undefined && p.Recipient !== newRec) needNew = true;
            if (newSc !== undefined && p.SCNumber !== newSc) needNew = true;
            if (!needNew) return p;
            changed = true;
            const upd = { ...p };
            if (newRec !== undefined) upd.Recipient = newRec;
            if (newSc !== undefined) {
              upd.SCNumber = newSc;
              upd.TKNumber = newSc;
            }
            return upd;
          });
          return changed ? next : prev;
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.dataUpdatedAt]);

  return { ...query, queryKey };
}
