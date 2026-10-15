// src/features/dob/lib/requestListFilters.js
//
// Вспомогательные функции фильтров шапки #dob_requests: значение статуса строки
// и принадлежность строки типу контента.
//
// Группировка таблицы по статусу здесь НЕ делается — она штатная для AG Grid
// (rowGroupCols + groupDisplayType, см. components/DobGrid.jsx).

import { cellText } from "./cellText";

export const NO_STATUS_LABEL = "(без статуса)";

const plain = (value) =>
  String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Текстовое значение статуса строки (Choice приходит объектом).
 * @param {object} row
 * @param {string} [statusInternal]
 * @returns {string}
 */
export function statusTextOf(row, statusInternal = "Status") {
  if (!row || typeof row !== "object") return "";
  const raw =
    row[statusInternal] ??
    row[`OData__${statusInternal}`] ??
    row[`OData_${statusInternal}`] ??
    row.Status ??
    row.OData__Status ??
    "";
  return plain(cellText(raw));
}

/** Подпись группы: статус или «(без статуса)». */
export function statusGroupLabel(row, statusInternal) {
  return statusTextOf(row, statusInternal) || NO_STATUS_LABEL;
}

/** ContentTypeId: из строки списка или из уже готовой строки-идентификатора. */
export function ctIdOf(row) {
  if (typeof row === "string") return plain(row).toLowerCase();
  return plain(row?.ContentTypeId || row?.OData__ContentTypeId || "").toLowerCase();
}

/**
 * Строка относится к типу контента? Id типа в списке и ContentTypeId элемента
 * совпадают, но у наследников ContentTypeId длиннее — поэтому сравниваем и как
 * префикс.
 */
export function matchesContentType(rowCtId, ctId) {
  const row = ctIdOf(rowCtId);
  const wanted = String(ctId || "").trim().toLowerCase();
  if (!row || !wanted) return false;
  return row === wanted || row.startsWith(wanted);
}
