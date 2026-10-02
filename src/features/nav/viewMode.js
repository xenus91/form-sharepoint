// src/features/nav/viewMode.js
// План: см. artifacts/plan.md (этап 7, 10).
// useViewMode — переключатель cards/table в #tasks, виден всем.

import { useCallback, useEffect, useState } from "react";

const KEY = "tasks.viewMode";

const ALLOWED_VALUES = new Set(["cards", "table"]);

/**
 * @returns {[
 *   "cards"|"table",
 *   (next:"cards"|"table") => void
 * ]}
 */
export function useViewMode() {
  const [value, setValue] = useState(() => {
    if (typeof localStorage === "undefined") return "cards";
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && ALLOWED_VALUES.has(raw)) return raw;
    } catch (_e) { void _e; }
    return "cards";
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(KEY, value);
    } catch (_e) { void _e; }
  }, [value]);

  // Слушаем изменения между вкладками
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onStorage = (ev) => {
      if (ev.key !== KEY) return;
      if (ev.newValue && ALLOWED_VALUES.has(ev.newValue)) {
        setValue(ev.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = useCallback((next) => {
    if (!ALLOWED_VALUES.has(next)) return;
    setValue(next);
  }, []);

  return [value, set];
}