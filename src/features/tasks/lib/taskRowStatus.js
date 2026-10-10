// src/features/tasks/lib/taskRowStatus.js
//
// Смысловой статус СТРОКИ таблицы задач (#tasks) и её заливка.
//
// Требование 2026-10-10: цвет строки в табличном представлении зависит от
// статуса задачи:
//   • Не начата                    → без заливки;
//   • В процессе выполнения        → бледно-оранжевый;
//   • Завершена                    → бледно-зелёный;
//   • просрочена и НЕ завершена    → бледно-красный (важнее «в работе»).
//
// Вынесено в lib (а не в TasksGrid) по той же причине, что и taskTableColumns:
// файл с компонентом не должен экспортировать константы
// (react-refresh/only-export-components), и так проще тестировать.

import { isCompletedStatus, isInProgressStatus } from "../../../tasks/status";

/** Смысловой статус строки. */
export const ROW_STATUS = {
  /** «Не начата» (и всё, что не попало в остальные категории) — без заливки. */
  NONE: "none",
  /** «В процессе выполнения» / «В работе». */
  PROGRESS: "progress",
  /** «Завершена» / PercentComplete = 100%. */
  COMPLETED: "completed",
  /** Просрочена и не завершена. */
  OVERDUE: "overdue",
};

/** Класс строки AG Grid для каждого статуса (NONE — без класса). */
export const ROW_CLASS_BY_STATUS = {
  [ROW_STATUS.NONE]: "",
  [ROW_STATUS.PROGRESS]: "tasks-row-progress",
  [ROW_STATUS.COMPLETED]: "tasks-row-completed",
  [ROW_STATUS.OVERDUE]: "tasks-row-overdue",
};

/**
 * Срок задачи прошёл?
 * @param {any} task
 * @param {number} [now] — точка отсчёта (мс), по умолчанию текущее время
 * @returns {boolean}
 */
export function isTaskOverdue(task, now = Date.now()) {
  const due = task?.DueDate ?? task?.dueDate;
  if (!due) return false;
  const time = new Date(due).getTime();
  if (Number.isNaN(time)) return false;
  return time < now;
}

/** Задача завершена (статус или PercentComplete = 100%)? */
export function isTaskCompleted(task) {
  if (!task) return false;
  return isCompletedStatus(task.Status ?? task.status ?? "", task.PercentComplete ?? task.percentComplete);
}

/**
 * Смысловой статус строки таблицы.
 *
 * Просрочка проверяется ДО «в работе»: задача, которую взяли, но не закрыли
 * в срок, должна оставаться красной — иначе её не найти в списке.
 *
 * @param {any} task — строка таблицы / задача
 * @param {number} [now]
 * @returns {"none"|"progress"|"completed"|"overdue"}
 */
export function taskRowStatus(task, now = Date.now()) {
  if (!task) return ROW_STATUS.NONE;
  if (isTaskCompleted(task)) return ROW_STATUS.COMPLETED;
  if (isTaskOverdue(task, now)) return ROW_STATUS.OVERDUE;
  if (isInProgressStatus(task.Status ?? task.status ?? "")) return ROW_STATUS.PROGRESS;
  return ROW_STATUS.NONE;
}

/**
 * CSS-класс строки AG Grid (см. src/index.css). Пустая строка — без заливки.
 * @param {any} task
 * @param {number} [now]
 * @returns {string}
 */
export function taskRowClass(task, now = Date.now()) {
  return ROW_CLASS_BY_STATUS[taskRowStatus(task, now)] || "";
}
