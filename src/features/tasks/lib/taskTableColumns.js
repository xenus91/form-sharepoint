// src/features/tasks/lib/taskTableColumns.js
// Колонки табличного представления #tasks (multi-source).
//
// Требования 2026-10-03:
//   • поля результата в таблице НЕ показываются;
//   • «Кому назначено» = AssignedTo (на кого назначена задача);
//   • «Исполнитель» = Editor (кто взял в работу), с фолбэком на AssignedTo,
//     чтобы колонка не пустовала у неподхваченных задач;
//   • колонка источника — только в debug-режиме.
//
// Вынесено из TasksGrid: файл с компонентом не должен экспортировать константы
// (react-refresh/only-export-components) + так проще тестировать.

import { resolveTaker } from "./resolveTaker";

const STATUS_BG = {
  "В работе": "#e3f2fd",
  "Завершена": "#e8f5e9",
  "Отменена": "#ffebee",
  "На паузе": "#fff8e1",
};

export function statusCellStyle(params) {
  const v = params?.value;
  const bg = STATUS_BG[v];
  if (!bg) return null;
  return {
    backgroundColor: bg,
    color: "rgba(0,0,0,0.87)",
    fontWeight: 500,
  };
}

function formatDate(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (_e) {
    void _e;
    return String(value);
  }
}

/**
 * @param {{showSourceColumn?: boolean}} [opts]
 * @returns {Array<object>} columnDefs для AG Grid
 */
export function buildTaskColumns({ showSourceColumn = false } = {}) {
  const cols = [];
  cols.push({
    headerName: "Id",
    field: "Id",
    width: 80,
    pinned: "left",
    sortable: true,
  });
  cols.push({
    headerName: "Заголовок",
    field: "Title",
    flex: 2,
    minWidth: 220,
    sortable: true,
  });
  cols.push({
    headerName: "Статус",
    field: "Status",
    width: 130,
    sortable: true,
    cellStyle: statusCellStyle,
  });
  cols.push({
    headerName: "Кому назначено",
    // ВСЕГДА AssignedTo (на кого назначена задача) — см. требование 2026-10-03.
    valueGetter: (p) => p.data?.AssignedTo || p.data?.assignedTo?.title || "",
    width: 190,
    sortable: true,
  });
  cols.push({
    headerName: "Исполнитель",
    // ВСЕГДА тот, кто ВЗЯЛ задачу в работу. До взятия — пусто: Editor у SharePoint
    // проставляется и при создании, поэтому напрямую его показывать нельзя.
    valueGetter: (p) => resolveTaker(p.data),
    width: 170,
    sortable: true,
  });
  cols.push({
    headerName: "Срок",
    field: "DueDate",
    width: 120,
    sortable: true,
    valueFormatter: (p) => formatDate(p.value),
  });
  cols.push({
    headerName: "Изменён",
    field: "Modified",
    width: 130,
    sortable: true,
    valueFormatter: (p) => formatDate(p.value),
  });
  // Таблица #tasks — обзорная: поля результата здесь НЕ показываем.
  // Колонка источника — только в отладочном режиме (?dbg=1 / localStorage.dbg_tasks=1).
  if (showSourceColumn) {
    cols.push({
      headerName: "Источник",
      valueGetter: (p) => p.data?.sourceLabel || p.data?.sourceId || "",
      width: 130,
      sortable: true,
    });
  }
  return cols;
}
