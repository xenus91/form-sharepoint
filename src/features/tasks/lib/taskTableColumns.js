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

// Тело задачи может прийти с HTML (внешние списки отдают Note как разметку) —
// в таблице показываем плоский текст.
function stripHtmlText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
    filter: "agNumberColumnFilter",
  });
  cols.push({
    headerName: "Заголовок",
    // Требование 2026-10-03: «Заголовок» — узкий (значительно уже «Описания»).
    field: "Title",
    width: 170,
    minWidth: 120,
    sortable: true,
    filter: "agTextColumnFilter",
  });
  cols.push({
    headerName: "Описание задачи",
    // Самая широкая колонка: забирает всё свободное место таблицы.
    field: "Body",
    flex: 1,
    minWidth: 360,
    sortable: true,
    filter: "agTextColumnFilter",
    valueGetter: (p) => stripHtmlText(p.data?.Body),
    cellStyle: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    tooltipValueGetter: (p) => stripHtmlText(p.data?.Body) || undefined,
  });
  cols.push({
    headerName: "Статус",
    field: "Status",
    width: 130,
    sortable: true,
    filter: "agTextColumnFilter",
    cellStyle: statusCellStyle,
  });
  cols.push({
    headerName: "Кому назначено",
    // colId — чтобы TasksGrid прицепил к колонке кнопку AssignedToButtons
    // (файл колонок — не компонент, react-refresh/only-export-components).
    colId: "assignedTo",
    // ВСЕГДА AssignedTo (на кого назначена задача) — см. требование 2026-10-03.
    valueGetter: (p) => p.data?.AssignedTo || p.data?.assignedTo?.title || "",
    width: 190,
    sortable: true,
    filter: "agTextColumnFilter",
  });
  cols.push({
    headerName: "Исполнитель",
    // ВСЕГДА тот, кто ВЗЯЛ задачу в работу. До взятия — пусто: Editor у SharePoint
    // проставляется и при создании, поэтому напрямую его показывать нельзя.
    valueGetter: (p) => resolveTaker(p.data),
    width: 170,
    sortable: true,
    filter: "agTextColumnFilter",
  });
  cols.push({
    headerName: "Срок",
    field: "DueDate",
    width: 120,
    sortable: true,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => formatDate(p.value),
  });
  cols.push({
    headerName: "Изменён",
    field: "Modified",
    width: 130,
    sortable: true,
    filter: "agDateColumnFilter",
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
      filter: "agTextColumnFilter",
    });
  }
  return cols;
}

/**
 * Базовые настройки колонок таблицы #tasks: сортировка (по клику на заголовок)
 * и фильтрация — через меню фильтра в шапке. Строки фильтров под заголовками
 * (floating filter) отключены: поиск общий, один на всю таблицу — см. TasksGrid.
 */
export const TASK_GRID_DEFAULT_COL_DEF = {
  sortable: true,
  filter: true,
  floatingFilter: false,
  resizable: true,
  suppressMovable: true,
  // Фильтр в меню применяется сразу при вводе (дебаунс вместо кнопки «Применить»)
  filterParams: { debounceMs: 300 },
};
