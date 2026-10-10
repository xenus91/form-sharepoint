// src/features/tasks/lib/taskTableColumns.js
// Колонки табличного представления #tasks (multi-source).
//
// Требования 2026-10-03:
//   • поля результата в таблице НЕ показываются;
//   • «Кому назначено» = AssignedTo (на кого назначена задача);
//   • «Исполнитель» = Editor (кто взял в работу), с фолбэком на AssignedTo,
//     чтобы колонка не пустовала у неподхваченных задач;
//   • колонка источника — только в debug-режиме.
// Требование 2026-10-10:
//   • «Срок» — в том же формате, что и в карточке: «Осталось 3д 4ч» /
//     «Просрочено 2д 5ч назад» (точная дата остаётся в подсказке);
//   • подсветка статуса берётся из того же правила, что и заливка строки
//     (см. taskRowStatus.js) — иначе ячейка и строка противоречат друг другу.
//
// Вынесено из TasksGrid: файл с компонентом не должен экспортировать константы
// (react-refresh/only-export-components) + так проще тестировать.

import { resolveTaker } from "./resolveTaker";
import { taskRowStatus, isTaskCompleted, ROW_STATUS } from "./taskRowStatus";
import { formatDueLeft, formatDueDateFull } from "../../../tasks/formatters";

// Заливка ячейки «Статус» = заливка строки (тот же смысл, та же палитра).
const STATUS_KIND_BG = {
  [ROW_STATUS.PROGRESS]: "#fff3e0", // бледно-оранжевый
  [ROW_STATUS.COMPLETED]: "#e8f5e9", // бледно-зелёный
  [ROW_STATUS.OVERDUE]: "#ffebee", // бледно-красный
};

// Статусы вне четырёх категорий заливки строк (требование их не описывает),
// но исторически подсвеченные в ячейке — оставляем, чтобы не терять сигнал.
const STATUS_EXTRA_BG = {
  "отменена": "#ffebee",
  "на паузе": "#fff8e1",
};

export function statusCellStyle(params) {
  const data = params?.data;
  const value = String(data?.Status ?? params?.value ?? "").trim();
  const bg = STATUS_KIND_BG[taskRowStatus(data ?? { Status: value })]
    || STATUS_EXTRA_BG[value.toLowerCase()]
    || null;
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
 * «Срок» в таблице — как в карточке задачи: «Осталось 3д 4ч» /
 * «Просрочено 2д 5ч назад» (formatDueLeft — тот же, что рисует чип в карточке).
 * @param {any} row — строка таблицы
 * @returns {string}
 */
export function dueCellText(row) {
  const due = row?.DueDate;
  if (!due) return "Без срока";
  return formatDueLeft(due).label;
}

const DUE_TEXT_COLOR = {
  success: "#2e7d32",
  warning: "#b26a00",
  info: "#0277bd",
  error: "#c62828",
};

/**
 * Цвет текста «Срока» — тот же смысл, что у чипа в карточке (success/warning/
 * info/error). Просрочка у ЗАВЕРШЁННОЙ задачи показывается нейтрально: работу
 * уже закрыли, красным пугать нечего.
 */
export function dueCellStyle(params) {
  const row = params?.data;
  const info = formatDueLeft(row?.DueDate);
  let color = DUE_TEXT_COLOR[info.color] || "inherit";
  if (info.overdue && isTaskCompleted(row)) color = "#616161";
  return {
    color,
    fontWeight: info.overdue ? 700 : 500,
    whiteSpace: "nowrap",
  };
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
    // Значение колонки — по-прежнему дата (сортировка и фильтр по дате работают),
    // а показываем её как в карточке: «Осталось …» / «Просрочено … назад».
    field: "DueDate",
    width: 160,
    sortable: true,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => dueCellText(p.data),
    cellStyle: dueCellStyle,
    tooltipValueGetter: (p) => (p.data?.DueDate ? formatDueDateFull(p.data.DueDate) : undefined),
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
