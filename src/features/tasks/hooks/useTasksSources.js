// src/features/tasks/hooks/useTasksSources.js
// Селектор источников на основе useDepartment.
// isOOB=true → [main, dob], иначе → [main].
// Уважает localStorage["tasks.sources"] override (для отладки).
// План: см. artifacts/plan.md (этап 10).

import { useMemo } from "react";
import { useDepartment } from "../../nav/useDepartment";
import { getTaskSources, getSourceById } from "../../../tasks/sources";

/**
 * @param {object|null} [userProfile]
 * @returns {Array<{id:string, label:string, clientKind:"main"|"dob", listApi?:string|null, listTitle?:string|null, enabled:boolean}>}
 */
export function useTasksSources(userProfile = null) {
  const { isOOB } = useDepartment(userProfile);

  return useMemo(() => {
    const all = getTaskSources();
    // Фильтруем по enabled
    const enabled = all.filter((s) => s.enabled !== false);
    if (isOOB) {
      // ООБ: добавляем второй источник (dob), если он есть в enabled
      const dob = enabled.find((s) => s.id === "dob");
      const main = enabled.find((s) => s.id === "main") || getSourceById("main");
      const result = [];
      if (main) result.push(main);
      if (dob) result.push(dob);
      return result;
    }
    // Не-ООБ: только main (или первый enabled)
    const main = enabled.find((s) => s.id === "main");
    if (main) return [main];
    return enabled.slice(0, 1);
  }, [isOOB]);
}