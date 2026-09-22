// src/features/tasks/hooks/useTasksFiltering.js
// Вынесено из TasksView.jsx — PR1
import { useState, useMemo, useCallback } from "react";
import { isCompletedStatus } from "../../../tasks/status";
import { extractTKNumberFromTask } from "../../../tasks/formatters";

export function useTasksFiltering(tasks, tab) {
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  const activeCount = useMemo(() => tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);

  const filteredTasks = useMemo(() => {
    if (tab === 0) return tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete));
    return tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete));
  }, [tasks, tab]);

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
    activeCount, completedCount,
    filteredTasks, groupedTasks,
    toggleGroup,
  };
}
