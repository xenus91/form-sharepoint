// src/features/tasks/lib/taskTableColumns.js
// Колонки табличного представления #tasks (multi-source).
//
// Требования 2026-10-03:
//   • поля результата в таблице НЕ показываются;
//   • «Кому назначено» = AssignedTo (на кого назначена задача);
//   • «Исполнитель» = Editor (кто взял в работу). Фолбэка на AssignedTo нет:
//     Editor SharePoint проставляет и при создании, поэтому до взятия в работу
//     колонка пустая, а не «автор задачи»;
//   • колонка источника — только в debug-режиме.
// Требование 2026-10-10:
//   • «Срок» — в том же формате, что и в карточке: «Осталось 3д 4ч» /
//     «Просрочено 2д 5ч назад» (точная дата остаётся в подсказке),
//     а у ЗАВЕРШЁННОЙ задачи — время решения «Решено за 3д 4ч»;
//   • «Исполнитель» рисуется кнопкой принципала (TakerCell), как «Кому назначено»;
//   • подсветка статуса берётся из того же правила, что и заливка строки
//     (см. taskRowStatus.js) — иначе ячейка и строка противоречат друг другу.
//
// Вынесено из TasksGrid: файл с компонентом не должен экспортировать константы
// (react-refresh/only-export-components) + так проще тестировать.

import { resolveTaker } from "./resolveTaker";
import { taskRowStatus, isTaskCompleted, ROW_STATUS } from "./taskRowStatus";
import { formatDueLeft, formatDueDateFull, formatSolveTime } from "../../../tasks/formatters";

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
 * «Срок» в таблице — как в карточке задачи (требования 2026-10-10):
 *   • задача открыта  → «Осталось 3д 4ч» / «Просрочено 2д 5ч назад» (formatDueLeft);
 *   • задача ЗАВЕРШЕНА → «Решено за 3д 4ч» (formatSolveTime) — карточка на месте
 *     чипа срока рисует именно время решения, срок закрытой задачи уже не важен;
 *   • срока нет — «Без срока».
 * @param {any} row — строка таблицы
 * @returns {string}
 */
export function dueCellText(row) {
  if (isTaskCompleted(row)) return formatSolveTime(row).label;
  const due = row?.DueDate;
  if (!due) return "Без срока";
  return formatDueLeft(due).label;
}

/**
 * Подсказка к «Сроку»: у завершённой — когда создана и когда закрыта
 * (и сколько заняла), у открытой — точные дата и время срока.
 * @param {any} row
 * @returns {string|undefined}
 */
export function dueCellTooltip(row) {
  if (!row) return undefined;
  if (isTaskCompleted(row)) return formatSolveTime(row).title;
  return row.DueDate ? formatDueDateFull(row.DueDate) : undefined;
}

const DUE_TEXT_COLOR = {
  success: "#2e7d32",
  warning: "#b26a00",
  info: "#0277bd",
  error: "#c62828",
};

/**
 * Цвет текста «Срока» — тот же смысл, что у чипа в карточке (success/warning/
 * info/error). Время решения завершённой задачи — нейтральное: это факт, а не
 * предупреждение.
 */
/**
 * Значение даты → timestamp. Понимает и ISO-строку из OData, и «13.10.2026 09:30»
 * (CAML RenderListDataAsStream отдаёт дату в региональном формате сайта).
 * @param {any} value
 * @returns {number|null}
 */
function dateValueOf(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  let t = Date.parse(value);
  if (Number.isFinite(t)) return t;
  const m = String(value).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Компаратор AG Grid для ДАТ: хронологически, а не «по тексту».
 *
 * Пустые даты — всегда в конце, в обоих направлениях (AG Grid умножает результат
 * компаратора на -1 для desc, поэтому направление приходится учитывать самому —
 * 5-й аргумент).
 *
 * @param {any} valueA
 * @param {any} valueB
 * @param {any} _nodeA
 * @param {any} _nodeB
 * @param {boolean} [isDescending]
 * @returns {number}
 */
export function compareDatesChrono(valueA, valueB, _nodeA, _nodeB, isDescending) {
  const a = dateValueOf(valueA);
  const b = dateValueOf(valueB);
  if (a === null && b === null) return 0;
  if (a === null) return isDescending ? -1 : 1;
  if (b === null) return isDescending ? 1 : -1;
  return a - b;
}

/**
 * Компаратор колонки «Срок» — по ДАТЕ СОЗДАНИЯ задачи (требование 2026-10-10).
 *
 * Зачем: у завершённой задачи ячейка показывает «Решено за 3д 4ч», у открытой —
 * «Осталось …»/«Просрочено … назад». Если сортировать по дедлайну, текст в
 * колонке идёт вперемешку и порядок читается «как по тексту». Пользователь
 * договорился так: отображение оставляем, а движок сортирует по Created — тогда
 * список сверху вниз читается ровно как «от самых старых к самым новым».
 *
 * @param {any} _valueA — значение колонки (DueDate), намеренно не используем
 * @param {any} _valueB
 * @param {any} nodeA
 * @param {any} nodeB
 * @param {boolean} [isDescending]
 * @returns {number}
 */
export function compareDueColumnByCreated(_valueA, _valueB, nodeA, nodeB, isDescending) {
  const a = dateValueOf(nodeA?.data?.Created ?? nodeA?.data?.raw?.Created);
  const b = dateValueOf(nodeB?.data?.Created ?? nodeB?.data?.raw?.Created);
  if (a === null && b === null) return 0;
  if (a === null) return isDescending ? -1 : 1;
  if (b === null) return isDescending ? 1 : -1;
  return a - b;
}

export function dueCellStyle(params) {
  const row = params?.data;
  if (isTaskCompleted(row)) {
    return { color: "#455a64", fontWeight: 500, whiteSpace: "nowrap" };
  }
  const info = formatDueLeft(row?.DueDate);
  return {
    color: DUE_TEXT_COLOR[info.color] || "inherit",
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
    // colId — чтобы TasksGrid прицепил к колонке кнопку TakerCell
    // (тот же вид, что у «Кому назначено» — требование 2026-10-10).
    colId: "taker",
    // ВСЕГДА тот, кто ВЗЯЛ задачу в работу. До взятия — пусто: Editor у SharePoint
    // проставляется и при создании, поэтому напрямую его показывать нельзя.
    valueGetter: (p) => resolveTaker(p.data),
    width: 190,
    sortable: true,
    filter: "agTextColumnFilter",
  });
  cols.push({
    headerName: "Срок",
    // Значение колонки — по-прежнему дата (сортировка и фильтр по дате работают),
    // а показываем её как в карточке: «Осталось …» / «Просрочено … назад»,
    // а у ЗАВЕРШЁННОЙ задачи — время решения («Решено за 3д 4ч»), потому что
    // карточка на месте чипа срока рисует именно его.
    field: "DueDate",
    width: 170,
    sortable: true,
    filter: "agDateColumnFilter",
    headerTooltip: "Срок задачи. У завершённой — время решения (создана → завершена). Сортировка — по дате создания задачи: сверху самые старые.",
    valueFormatter: (p) => dueCellText(p.data),
    cellStyle: dueCellStyle,
    tooltipValueGetter: (p) => dueCellTooltip(p.data),
    // Движок сортирует по Created (см. compareDueColumnByCreated), а не по
    // дедлайну: иначе текст «Осталось/Просрочено/Решено» шёл бы вперемешку.
    comparator: compareDueColumnByCreated,
    // Порядок по умолчанию — от самых старых к самым новым (требование 2026-10-10).
    sort: "asc",
  });
  cols.push({
    headerName: "Изменён",
    field: "Modified",
    width: 130,
    sortable: true,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => formatDate(p.value),
    comparator: compareDatesChrono,
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
