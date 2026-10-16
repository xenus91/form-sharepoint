// src/features/tasks/hooks/useTasksListSync.js
//
// Бейдж «Задачи» в бургер-меню и сам список задач жили в разных ритмах:
//   * бейдж — useActiveTasksCount, опрос сервера раз в 60 с;
//   * список — react-query со staleTime/refetchInterval 5 минут.
// Из-за этого бейдж успевал показать 4 задачи, а список оставался на 3 вплоть
// до пятиминутного тика. Хук связывает их: новое число в бейдже сразу
// перечитывает список.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Префикс ключа списка задач (см. tasks/useTasksQuery.js). */
export const TASKS_QUERY_KEY = ["tasks"];

/**
 * @param {number} badgeCount — текущее число из useActiveTasksCount
 */
export default function useTasksListSyncOnBadgeChange(badgeCount) {
  const queryClient = useQueryClient();
  const prevRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = badgeCount;
    // Первое значение только запоминаем: список в этот момент грузится сам.
    if (prev === null || prev === badgeCount) return;
    // Перечитываем только уже загруженный список — иначе на старте дубль запроса.
    const loaded = queryClient
      .getQueriesData({ queryKey: TASKS_QUERY_KEY })
      .some(([, data]) => Array.isArray(data) && data.length > 0);
    if (!loaded) return;
    queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
  }, [badgeCount, queryClient]);
}
