// src/features/tasks/hooks/useTasksSources.js
// Селектор активных источников для загрузки #tasks.
// По требованию пользователя (2026-10-03) — оба источника активны для всех:
// ООБ получает merged данные (main + dob), остальные — только main.
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

    // ОБА источника активны для ООБ (merged данные)
    // Для не-ООБ — main + dob тоже активны, но запрос к dob упадёт (нет доступа)
    //   → частичная деградация через Promise.allSettled: вернётся только main
    if (isOOB) {
      const dob = enabled.find((s) => s.id === "dob");
      const main = enabled.find((s) => s.id === "main") || getSourceById("main");
      const result = [];
      if (main) result.push(main);
      if (dob) result.push(dob);
      return result;
    }

    // Не-ООБ: оба источника активны, fetchTasksMultiSource деградирует частично
    const main = enabled.find((s) => s.id === "main");
    const dob = enabled.find((s) => s.id === "dob");
    const result = [];
    if (main) result.push(main);
    if (dob) result.push(dob);
    return result;
  }, [isOOB]);
}