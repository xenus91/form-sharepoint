// src/features/dob/lib/requestListFilters.js
//
// Фильтры шапки (#dob_requests) и группировка таблицы по статусу.
//
// Про группировку отдельно: в проекте стоит ag-grid-community, а Row Grouping
// (rowGroupCols / rowGroupPanelShow) — фича AG Grid Enterprise. Поэтому группы
// собираем сами: в rowData вставляются служебные строки-заголовки, а
// postSortRows (он есть в Community) раскладывает их заново после любой
// пользовательской сортировки — так группировка не «размазывается» по таблице.

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

const groupKey = (label) => `group:${label}`;

/** Это служебная строка-заголовок группы? */
export function isGroupRow(row) {
  return !!row && row.__groupRow === true;
}

/** Ключ служебной строки для getRowId. */
export function groupRowId(row) {
  return groupKey(row?.__groupLabel ?? "");
}

/**
 * Вставляет перед каждой группой строку-заголовок.
 * Порядок групп — по первой строке группы в исходном порядке (по умолчанию это
 * «старые сверху»), внутри группы порядок не меняется.
 * @param {Array<object>} rows
 * @param {string} [statusInternal]
 * @param {{labelField?:string|null}} [opts] — колонка, в которую пишем подпись
 *   группы (первая колонка таблицы): у служебной строки нет своих значений,
 *   поэтому подпись кладём прямо в данные.
 * @returns {Array<object>}
 */
export function groupRowsByStatus(rows, statusInternal = "Status", { labelField = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const groups = new Map();
  for (const row of list) {
    const label = statusGroupLabel(row, statusInternal);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  const out = [];
  for (const [label, groupRows] of groups) {
    const header = {
      __groupRow: true,
      __groupKey: groupKey(label),
      __groupLabel: label,
      __groupCount: groupRows.length,
    };
    if (labelField) header[labelField] = `${label} — ${groupRows.length}`;
    out.push(header);
    out.push(...groupRows);
  }
  return out;
}

/**
 * Восстанавливает группировку после сортировки AG Grid (postSortRows).
 * Массив меняется на месте — именно этого ждёт AG Grid.
 * @param {Array<object>} rowNodes — узлы AG Grid (node.data)
 * @param {string} [statusInternal]
 */
export function regroupSortedNodes(rowNodes, statusInternal = "Status") {
  if (!Array.isArray(rowNodes) || rowNodes.length === 0) return;
  const headers = new Map();
  const groups = new Map();
  for (const node of rowNodes) {
    const data = node?.data;
    if (!data) continue;
    if (isGroupRow(data)) {
      headers.set(data.__groupLabel ?? "", node);
      continue;
    }
    const label = statusGroupLabel(data, statusInternal);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(node);
  }
  if (groups.size === 0) return;

  const next = [];
  for (const [label, nodes] of groups) {
    const header = headers.get(label);
    // Заголовка нет — группа всё равно показывается, просто без шапки.
    if (header) next.push(header);
    next.push(...nodes);
  }
  rowNodes.length = 0;
  rowNodes.push(...next);
}
