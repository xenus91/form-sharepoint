// src/tasks/status.js
// Хелперы статуса задачи (используются в TaskCard и в TasksView для фильтров/счётчиков).
// Раньше жили inline в TasksView.jsx.

// Признаки завершённости. ВАЖНО: в SharePoint статус «в работе» бывает
// «В процессе выполнения» / «Выполняется» — они содержат подстроку «Выполн»,
// поэтому простое вхождение «Выполн» НЕЛЬЗЯ считать признаком завершённости.
export const COMPLETED_STATUS_MARKERS = ["заверш", "completed", "closed"];
export const COMPLETED_STATUS_EXACT = ["выполнено", "выполнена", "выполнены", "выполнен", "выполненное"];
export const ACTIVE_STATUS_MARKERS = ["в процессе", "выполня", "не начат", "not started", "in progress"];

/**
 * Задача завершена, если:
 *   • PercentComplete = 1 (или 100);
 *   • статус содержит «Заверш» / «Completed» / «Closed»;
 *   • статус = «Выполнено» / «Выполнена» / «Выполнены».
 * Статусы «В процессе выполнения», «Выполняется», «Не начата» — НЕ завершённые.
 *
 * @param {string} status
 * @param {number|undefined} percent
 * @returns {boolean}
 */
export function isCompletedStatus(status, percent) {
  if (percent === 1 || percent === 100) return true;
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  if (!s) return false;
  // Явные «в работе» — проверяем первыми
  for (const marker of ACTIVE_STATUS_MARKERS) if (s.includes(marker)) return false;
  for (const marker of COMPLETED_STATUS_MARKERS) if (s.includes(marker)) return true;
  for (const exact of COMPLETED_STATUS_EXACT) if (s.includes(exact)) return true;
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