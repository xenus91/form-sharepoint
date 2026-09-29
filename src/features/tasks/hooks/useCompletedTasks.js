// src/features/tasks/hooks/useCompletedTasks.js
// Завершённые задачи: счётчик — сразу, карточки — лениво порциями (кнопка «Показать ещё»).
//
//   count    — количество завершённых за всё время (RenderListDataAsStream → RowCount);
//   items    — уже загруженные страницы;
//   loadNext() — догрузить следующую порцию (COMPLETED_PAGE_SIZE = 20);
//   refresh()  — сбросить страницы и перечитать (после завершения задачи);
//   autoLoad   — если true, первая страница грузится автоматически (вкладка открыта).

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { COMPLETED_PAGE_SIZE, fetchCompletedCount, fetchCompletedTasksPage } from "../../../tasks/completedTasks";
import { describeApiError } from "../../../utils/apiError";

export function useCompletedTasks({
  currentUserId,
  distribution,
  recipientField = null,
  scNumberField = null,
  pageSize = COMPLETED_PAGE_SIZE,
  enabled = true,
  autoLoad = false,
}) {
  const [items, setItems] = useState([]);
  const [nextPaging, setNextPaging] = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState(""); // текст ошибки SharePoint

  const inFlight = useRef(false);
  const pagingRef = useRef(null); // null — ещё не грузили; "" — страниц больше нет
  const loadedRef = useRef(false);
  const distKey = distribution?.Id ?? distribution?.OffDepKey ?? null;

  const countQuery = useQuery({
    queryKey: ["completed-count", currentUserId ?? null, distKey],
    queryFn: () => fetchCompletedCount({ currentUserId, distribution }),
    enabled: !!currentUserId && enabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const count = countQuery.data?.count ?? null;

  const loadPage = useCallback(
    async (reset = false) => {
      if (!currentUserId || inFlight.current) return;
      if (reset) {
        pagingRef.current = null;
        loadedRef.current = false;
      } else if (loadedRef.current && !pagingRef.current) {
        return; // всё уже загружено
      }
      inFlight.current = true;
      setLoading(true);
      setError("");
      setErrorDetail("");
      try {
        const page = await fetchCompletedTasksPage({
          currentUserId,
          distribution,
          pageSize,
          paging: pagingRef.current || null,
          recipientField,
          scNumberField,
        });
        pagingRef.current = page.nextPaging || ""; // "" → больше страниц нет
        setNextPaging(page.nextPaging || null);
        setItems((prev) => {
          if (reset) return page.tasks;
          const seen = new Set(prev.map((t) => t.Id));
          const merged = [...prev];
          for (const t of page.tasks) if (!seen.has(t.Id)) merged.push(t);
          return merged;
        });
        loadedRef.current = true;
        setLoadedOnce(true);
        if (countQuery.data?.count == null && typeof page.rowCount === "number") countQuery.refetch();
      } catch (e) {
        const detail = describeApiError(e);
        setError("Не удалось загрузить завершённые задачи.");
        setErrorDetail(detail);
        console.error("[useCompletedTasks] loadNext failed", {
          status: e?.response?.status ?? null,
          detail,
          error: e,
        });
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [currentUserId, distribution, pageSize, recipientField, scNumberField, countQuery]
  );

  // Первая страница — когда вкладка реально открыта
  const loadPageRef = useRef(loadPage);
  useEffect(() => {
    loadPageRef.current = loadPage;
  }, [loadPage]);
  useEffect(() => {
    if (!autoLoad || !enabled || !currentUserId) return;
    loadPageRef.current(false);
  }, [autoLoad, enabled, currentUserId]);

  // Сброс при смене пользователя / распределения
  useEffect(() => {
    setItems([]);
    pagingRef.current = null;
    loadedRef.current = false;
    setLoadedOnce(false);
    setNextPaging(null);
    setError("");
    setErrorDetail("");
  }, [currentUserId, distKey]);

  const loadNext = useCallback(() => loadPage(false), [loadPage]);

  const refresh = useCallback(async () => {
    await countQuery.refetch();
    if (autoLoad || loadedRef.current) {
      await loadPage(true);
    } else {
      // Вкладка не открыта и страницы не грузили — просто сбрасываем состояние,
      // первая страница загрузится, когда пользователь перейдёт на вкладку.
      pagingRef.current = null;
      loadedRef.current = false;
      setLoadedOnce(false);
      setItems([]);
      setNextPaging(null);
    }
  }, [countQuery, loadPage, autoLoad]);

  return {
    count,
    countSource: countQuery.data?.source || null,
    countLoading: countQuery.isLoading && count == null,
    items,
    loading,
    error,
    errorDetail,
    hasMore: !!nextPaging,
    loaded: loadedOnce,
    loadNext,
    refresh,
    pageSize,
  };
}
