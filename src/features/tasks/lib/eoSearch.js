// Поиск по ЕО в глобальном списке активных задач.
import { extractEONumberFromTask } from "../../../tasks/formatters";
import { isCompletedStatus } from "../../../tasks/status";

/** Оставляем только цифры: так одинаково обрабатываются сканер, пробелы и дефисы. */
export function normalizeEONumberQuery(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Ищет совпадения по ЕО во всех переданных открытых задачах, независимо от
 * группировки по ТК и фильтра «Я исполнитель».
 * Частичный номер поддерживается, чтобы поиск сужался прямо во время сканирования.
 */
export function searchOpenTasksByEO(tasks, query) {
  const digits = normalizeEONumberQuery(query);
  if (!digits || !Array.isArray(tasks)) return [];
  return tasks.filter((task) => {
    if (!task || isCompletedStatus(task.Status, task.PercentComplete)) return false;
    return extractEONumberFromTask(task).includes(digits);
  });
}
