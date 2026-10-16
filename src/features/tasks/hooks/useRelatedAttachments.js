// src/features/tasks/hooks/useRelatedAttachments.js
//
// Сколько вложений у связанных элементов (RelatedItems → ProblemsPallet) для
// видимых задач. По этому числу карточка решает, показывать ли скрепку.
//
// Запросы батчатся: все Id страницы уходят одним-двумя вызовами
// (см. tasks/relatedAttachments.js), а не по одному на карточку.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRelatedAttachmentCounts, relatedItemIdOf } from "../../../tasks/relatedAttachments";

/**
 * @param {Array<any>} tasks — задачи, для которых нужны счётчики
 * @returns {{
 *   countOf: (task: any) => number,
 *   hasAttachments: (task: any) => boolean,
 *   counts: Map<number, number>,
 * }}
 */
export function useRelatedAttachments(tasks) {
  const [counts, setCounts] = useState(() => new Map());

  const ids = useMemo(() => {
    const set = new Set();
    for (const t of tasks || []) {
      const id = relatedItemIdOf(t);
      if (id) set.add(id);
    }
    return [...set];
  }, [tasks]);

  // Ключ, а не массив: иначе эффект перезапускался бы на каждую новую ссылку.
  const key = ids.join(",");
  const requestedRef = useRef(new Set());

  useEffect(() => {
    if (!key) return undefined;
    // Уже спрашивали ровно этот набор — не повторяем (вкладки и ре-рендеры).
    if (requestedRef.current.has(key)) return undefined;
    requestedRef.current.add(key);
    let cancelled = false;
    (async () => {
      const fresh = await fetchRelatedAttachmentCounts(ids);
      if (cancelled || fresh.size === 0) return;
      setCounts((prev) => {
        const next = new Map(prev);
        for (const [id, n] of fresh) next.set(id, n);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const countOf = useCallback(
    (task) => {
      const id = relatedItemIdOf(task);
      if (!id) return 0;
      return counts.get(id) || 0;
    },
    [counts],
  );

  const hasAttachments = useCallback((task) => countOf(task) > 0, [countOf]);

  return { countOf, hasAttachments, counts };
}
