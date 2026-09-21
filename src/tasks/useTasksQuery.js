import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTasks } from "./fetchTasks";
import { enrichTasksWithRelated } from "./enrich";
// eslint-disable-next-line no-unused-vars
import { extractTKNumberFromTask, extractTKNumber } from "./formatters";
import React, { useEffect } from "react";

export function useTasksQuery({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames = [], enabled = true }) {
  const queryClient = useQueryClient();

  const queryKey = [
    "tasks",
    currentUserId ?? null,
    distribution?.Id ?? distribution?.OffDepKey ?? null,
    (taskFieldNames || []).join(","),
    recipientField ?? null,
    scNumberField ?? null,
    (resultFieldInternalNames || []).join(","),
  ];

  // Кэш обогащения чтобы не мигало ТК → ЕО → ТК на каждом рефетче
  const enrichCacheRef = React.useRef(new Map()); // Map<taskId, {Recipient, SCNumber, THU}>
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const raw = await fetchTasks({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames });
      // Сразу накладываем кэш enrich чтобы не мигало "ЕО 808..." → "ТК 107 • ЕО ..."
      if (enrichCacheRef.current.size > 0 && raw.length > 0) {
        let changed = false;
        const merged = raw.map((t) => {
          const cached = enrichCacheRef.current.get(t.Id);
          if (!cached) return t;
          let need = false;
          if (cached.Recipient && t.Recipient !== cached.Recipient) need = true;
          if (cached.SCNumber && t.SCNumber !== cached.SCNumber) need = true;
          if (cached.THU && t.THU !== cached.THU) need = true;
          if (!need) return t;
          changed = true;
          return { ...t, Recipient: cached.Recipient || t.Recipient, SCNumber: cached.SCNumber || t.SCNumber, THU: cached.THU || t.THU, TKNumber: cached.SCNumber || t.SCNumber, raw: { ...t.raw, THU: cached.THU || t.raw?.THU } };
        });
        return changed ? merged : raw;
      }
      return raw;
    },
    enabled: !!currentUserId && enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });

  // Фоновое обогащение Recipient/SCNumber/THU — батч вместо fan-out, с кэшем чтобы не мигало
  useEffect(() => {
    const data = query.data;
    if (!data || data.length === 0) return;
    // Дебаунс чтобы не DDoS-ить GetItems каждый dataUpdatedAt
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // Не обогащаем если данные уже обогащены (все задачи с ТК или без RelatedItems)
        const needEnrich = data.some((t) => (!t.Recipient || !t.SCNumber) && t.RelatedItems);
        if (!needEnrich) return;
        const { recipientMap, scNumberMap, thuMap } = await enrichTasksWithRelated(data, { concurrency: 5, useBatch: true });
        if (cancelled) return;
        if (recipientMap.size === 0 && scNumberMap.size === 0 && thuMap.size === 0) return;
        // Кэшируем для следующего fetch чтобы не мигало
        for (const [id, rec] of recipientMap.entries()) {
          const cur = enrichCacheRef.current.get(id) || {};
          enrichCacheRef.current.set(id, { ...cur, Recipient: rec });
        }
        for (const [id, sc] of scNumberMap.entries()) {
          const cur = enrichCacheRef.current.get(id) || {};
          enrichCacheRef.current.set(id, { ...cur, SCNumber: sc });
        }
        for (const [id, thu] of thuMap.entries()) {
          const cur = enrichCacheRef.current.get(id) || {};
          enrichCacheRef.current.set(id, { ...cur, THU: thu });
        }
        if (enrichCacheRef.current.size > 200) {
          const first = enrichCacheRef.current.keys().next().value;
          enrichCacheRef.current.delete(first);
        }
        queryClient.setQueryData(queryKey, (prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((p) => {
            const newRec = recipientMap.get(p.Id);
            const newSc = scNumberMap.get(p.Id);
            const newThu = thuMap.get(p.Id);
            if (newRec === undefined && newSc === undefined && newThu === undefined) return p;
            let needNew = false;
            if (newRec !== undefined && p.Recipient !== newRec) needNew = true;
            if (newSc !== undefined && p.SCNumber !== newSc) needNew = true;
            if (newThu !== undefined && p.THU !== newThu && p.raw?.THU !== newThu) needNew = true;
            if (!needNew) return p;
            changed = true;
            const upd = { ...p, raw: { ...p.raw } };
            if (newRec !== undefined) upd.Recipient = newRec;
            if (newSc !== undefined) {
              upd.SCNumber = newSc;
              upd.TKNumber = newSc;
            }
            if (newThu !== undefined) {
              upd.THU = newThu;
              upd.raw.THU = newThu;
            }
            return upd;
          });
          return changed ? next : prev;
        });
      } catch (_e) { void _e; }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.dataUpdatedAt]);

  return { ...query, queryKey };
}
