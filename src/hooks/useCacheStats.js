// src/hooks/useCacheStats.js
// Хелпер для мониторинга эффективности кэшей.
// Полезно для отладки и проверки, что axios-interceptor cache работает
// и TanStack Query хиты действительно идут из кэша.
//
// Использование:
//   const stats = useCacheStats({ pollMs: 2000 });
//   // stats.axios = { hits, miss, dedup, errors, inflight, cached }
//   // stats.tanstack = { total, active, stale, queries: [...] }

import { useEffect, useState } from "react";
import { getCacheStats } from "../sp/cache";
import { useQueryClient } from "@tanstack/react-query";

export function useCacheStats({ pollMs = 0 } = {}) {
  const queryClient = useQueryClient();
  const [stats, setStats] = useState(() => snapshot(queryClient));

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => setStats(snapshot(queryClient)), pollMs);
    return () => clearInterval(id);
  }, [pollMs, queryClient]);

  return stats;
}

function snapshot(queryClient) {
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();
  const active = queries.filter(
    (q) => q.state.status === "pending" || q.state.fetchStatus === "fetching"
  ).length;
  const stale = queries.filter((q) => q.isStale()).length;
  const total = queries.length;
  return {
    axios: getCacheStats(),
    tanstack: {
      total,
      active,
      stale,
      queries: queries.map((q) => ({
        key: q.queryKey,
        status: q.state.status,
        observers: q.observers.length,
      })),
  },
  };
}