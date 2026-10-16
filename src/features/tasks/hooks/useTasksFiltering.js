// src/features/tasks/hooks/useTasksFiltering.js
// Вынесено из TasksView.jsx — PR1
import { useState, useMemo, useCallback } from "react";
import { isCompletedStatus } from "../../../tasks/status";
import { extractTKNumberFromTask } from "../../../tasks/formatters";

/**
 * @param {Array<any>} tasks — задачи текущего источника
 * @param {number} tab — 0 = активные, 1 = завершённые
 * @param {{
 *   onlyMine?: boolean,
 *   isMyTask?: ((task: any) => boolean) | null,
 * }} [opts]
 *   onlyMine — включён тумблер «Я исполнитель»;
 *   isMyTask — предикат «задачу веду я» (см. lib/currentUserMatch.js).
 */
export function useTasksFiltering(tasks, tab, opts = {}) {
  const { onlyMine = false, isMyTask = null } = opts;
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  // Счётчики на вкладках считаем по ВСЕМУ списку, а не по отфильтрованному:
  // иначе при включённом «Я исполнитель» цифры на вкладках менялись бы под
  // руками, а сколько задач отобрано — видно в подписи самого тумблера.
  const activeCount = useMemo(() => tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);

  // Сколько всего задач я веду — подпись на тумблере «Я исполнитель (N)».
  const myCount = useMemo(
    () => (typeof isMyTask === "function" ? tasks.filter(isMyTask).length : null),
    [tasks, isMyTask],
  );

  // Тумблер «Я исполнитель» режет список ДО разделения по вкладкам и до
  // группировки — тогда он действует и на «Активных», и на «Завершённых».
  const visibleTasks = useMemo(() => {
    if (!onlyMine || typeof isMyTask !== "function") return tasks;
    return tasks.filter(isMyTask);
  }, [tasks, onlyMine, isMyTask]);

  const filteredTasks = useMemo(() => {
    if (tab === 0) return visibleTasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete));
    return visibleTasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete));
  }, [visibleTasks, tab]);

  const groupedTasks = useMemo(() => {
    if (!groupingEnabled) {
      return filteredTasks.length ? [["Все", filteredTasks]] : [];
    }
    const map = new Map();
    for (const task of filteredTasks) {
      const sc = extractTKNumberFromTask(task);
      if (!map.has(sc)) map.set(sc, []);
      map.get(sc).push(task);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Без ТК") return 1;
      if (b[0] === "Без ТК") return -1;
      if (a[0] === "Все") return -1;
      if (b[0] === "Все") return 1;
      return a[0].localeCompare(b[0], "ru");
    });
  }, [filteredTasks, groupingEnabled]);

  const toggleGroup = useCallback((sc) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sc)) next.delete(sc);
      else next.add(sc);
      return next;
    });
  }, []);

  return {
    groupingEnabled, setGroupingEnabled,
    expandedGroups, setExpandedGroups,
    activeCount, completedCount, myCount,
    filteredTasks, groupedTasks, visibleTasks,
    toggleGroup,
  };
}
