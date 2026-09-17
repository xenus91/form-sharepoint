// src/tasks/status.js
// Хелперы статуса задачи (используются в TaskCard и в TasksView для фильтров/счётчиков).
// Раньше жили inline в TasksView.jsx.

/**
 * Задача завершена, если процент 100 или статус содержит "заверш"/"completed".
 * @param {string} status
 * @param {number|undefined} percent
 * @returns {boolean}
 */
export function isCompletedStatus(status, percent) {
  if (percent === 1 || percent === 100) return true;
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  if (s.includes("заверш")) return true;
  if (s.includes("completed")) return true;
  if (s.includes("выполн") && !s.includes("в процессе")) return true;
  if (s === "5") return true;
  return false;
}

/**
 * Задача в статусе "Не начата".
 * @param {string} status
 * @returns {boolean}
 */
export function isNotStartedStatus(status) {
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  return s.includes("не начата") || s === "0" || s.includes("not started") || s === "не начато";
}

/**
 * Задача в статусе "В процессе / В работе".
 * @param {string} status
 * @returns {boolean}
 */
export function isInProgressStatus(status) {
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  return s.includes("в процессе") || s.includes("в работе") || s === "1" || s === "2" || s.includes("in progress");
}