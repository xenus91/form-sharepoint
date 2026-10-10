// src/features/tasks/lib/cardTasks.js
// Слияние задач из разных источников для карточного режима #tasks.
//
// Раньше карточки строились только из основного списка (useTasksQuery → main),
// поэтому задачи сайта ДОБ в карточном режиме не появлялись вовсе — хотя в
// табличном режиме они уже грузились (useTasksTableData → multi-source).
//
// Здесь: main-задачи (богатые, с enrich) помечаем sourceId="main" и склеиваем
// с «внешними» строками (dob и др. источники). Итог сортируется по Created asc
// (от самых старых к самым новым — требование 2026-10-10).
// Дубликаты (по sourceId:Id) отбрасываются.

import { mergeSort } from "../../../tasks/multiSource";
import { isResultCheckTask } from "../../../tasks/contentTypeFields";

/** @param {any} task @returns {boolean} */
export function isExternalTask(task) {
  return !!task && !!task.sourceId && task.sourceId !== "main";
}

/**
 * Задача ведёт себя как задача сайта ДОБ: read-only карточка + «Взять в работу»/
 * «Изменить», а форма — DobTaskEditView (закрытие через диалог ДОБ).
 *
 * К таким относятся и задачи основного списка с типом контента
 * «Результат проверки ООБ»: у них нет кнопок результата в карточке/таблице —
 * результат и поля собирает диалог внутри формы.
 *
 * @param {any} task
 * @returns {boolean}
 */
export function isDobLikeTask(task) {
  if (!task) return false;
  if (isExternalTask(task)) return true;
  return isResultCheckTask(task);
}

/**
 * Проставляет main-задачам sourceId/compositeId (idempotent).
 * @param {Array<any>} tasks
 * @param {{sourceId?:string, sourceLabel?:string}} [opts]
 * @returns {Array<any>}
 */
export function markMainTasks(tasks, opts = {}) {
  const sourceId = opts.sourceId || "main";
  const sourceLabel = opts.sourceLabel || "Образцово";
  return (tasks || []).map((t) => {
    if (!t || t.Id == null) return t;
    if (t.sourceId && t.compositeId) return t;
    return {
      ...t,
      sourceId: t.sourceId || sourceId,
      compositeId: t.compositeId || `${sourceId}:${t.Id}`,
      sourceLabel: t.sourceLabel || sourceLabel,
    };
  });
}

/**
 * Сливает main-задачи и строки из других источников для карточек.
 * @param {Array<any>} mainTasks — из useTasksQuery (main, с enrich)
 * @param {Array<any>} extraRows — из useTasksTableData().rows (sourceId !== "main")
 * @param {{mainSourceId?:string, mainSourceLabel?:string, orderByField?:string, dir?:"asc"|"desc"}} [opts]
 * @returns {Array<any>}
 */
export function mergeCardTasks(mainTasks, extraRows, opts = {}) {
  const mainSourceId = opts.mainSourceId || "main";
  const merged = markMainTasks(mainTasks, { sourceId: mainSourceId, sourceLabel: opts.mainSourceLabel });
  const seen = new Set(merged.filter(Boolean).map((t) => `${t.sourceId}:${t.Id}`));
  for (const row of extraRows || []) {
    if (!row || row.Id == null) continue;
    const sourceId = row.sourceId || row.compositeId?.split(":")?.[0] || "unknown";
    const key = `${sourceId}:${row.Id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, sourceId, compositeId: row.compositeId || `${sourceId}:${row.Id}` });
  }
  // От самых старых к самым новым (Created asc). НЕ Modified: при взятии задачи
  // в работу Modified обновляется, и карточка улетала в самый верх списка.
  return mergeSort(merged.filter(Boolean), opts.orderByField || "Created", opts.dir || "asc");
}
