// src/features/tasks/lib/resolveTaker.js
// «Исполнитель» задачи = тот, кто ВЗЯЛ её в работу.
//
// Тонкость SharePoint: поле Editor проставляется автоматически при СОЗДАНИИ и
// любом изменении элемента, поэтому до взятия в работу Editor = автор задачи,
// а не исполнитель. Показывать его как исполнителя нельзя.
//
// Правило:
//   • задача в работе  → Editor (взял в работу; после MERGE статуса это текущий пользователь);
//   • задача завершена → Editor (тот, кто выполнил);
//   • задача не начата → пусто (исполнителя ещё нет).

import { isCompletedStatus, isInProgressStatus } from "../../../tasks/status";

/**
 * @param {any} task
 * @returns {string} имя исполнителя или "" 
 */
export function resolveTaker(task) {
  if (!task) return "";
  const name = task.EditorTitle || task.Editor || "";
  if (!name) return "";
  if (isInProgressStatus(task.Status)) return name;
  if (isCompletedStatus(task.Status, task.PercentComplete)) return name;
  return "";
}
