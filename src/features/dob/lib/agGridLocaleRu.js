// src/features/dob/lib/agGridLocaleRu.js
//
// Русская локаль AG Grid (требование 2026-10-15: «интерфейс ag-grid перевести
// на русскую локаль»).
//
// В npm-пакете ag-grid-community 33.3.2 готовых переводов НЕТ: ни файлов
// `dist/locales/*`, ни экспортов `AG_GRID_LOCALE_*` (проверено — в package.json
// только подпути стилей, в бандле 0 вхождений «AG_GRID_LOCALE»). Поэтому строки
// задаём сами через gridOptions.localeText.
//
// Ключи взяты НЕ «на глаз»: они вытащены из самих бандлов ag-grid-community и
// ag-grid-enterprise (вызовы вида translate("key", "Default") и объект
// FILTER_LOCALE_TEXT в dist/types/src/filter/filterLocaleText.d.ts) — иначе
// опечатка в ключе молча оставила бы английский текст.
//
// Подстановки: AG Grid подставляет переменные в строку из localeText по
// маркеру `${variable}` (см. LocaleService.getLocaleTextFunc в бандле),
// поэтому в «Добавить ${variable} в значения» подставится имя колонки.

/**
 * @typedef {Record<string,string>} LocaleText
 */

/** @type {LocaleText} Русские строки интерфейса AG Grid. */
export const AG_GRID_LOCALE_RU = {
  // ── Кнопки фильтров и сами фильтры (FILTER_LOCALE_TEXT) ───────────────────
  applyFilter: 'Применить',
  clearFilter: 'Очистить',
  resetFilter: 'Сбросить',
  cancelFilter: 'Отмена',
  textFilter: 'Текстовый фильтр',
  numberFilter: 'Числовой фильтр',
  dateFilter: 'Фильтр по дате',
  setFilter: 'Фильтр по значениям',
  filterOoo: 'Фильтр…',
  empty: 'Выберите условие',
  equals: 'Равно',
  notEqual: 'Не равно',
  lessThan: 'Меньше',
  greaterThan: 'Больше',
  inRange: 'Между',
  inRangeStart: 'От',
  inRangeEnd: 'До',
  lessThanOrEqual: 'Меньше или равно',
  greaterThanOrEqual: 'Больше или равно',
  contains: 'Содержит',
  notContains: 'Не содержит',
  startsWith: 'Начинается с',
  endsWith: 'Заканчивается на',
  blank: 'Пусто',
  notBlank: 'Не пусто',
  before: 'До даты',
  after: 'После даты',
  andCondition: 'И',
  orCondition: 'ИЛИ',
  dateFormatOoo: 'дд.мм.гггг',
  invalidDate: 'Неверная дата',
  invalidNumber: 'Неверное число',

  // ── Set-фильтр (список значений с галочками) ──────────────────────────────
  selectAll: 'Выбрать все',
  selectAllSearchResults: 'Выбрать все найденные',
  searchOoo: 'Поиск…',
  blanks: '(Пусто)',
  noMatches: 'Ничего не найдено',

  // ── Панели «Колонки» и «Фильтры» ──────────────────────────────────────────
  columns: 'Колонки',
  filters: 'Фильтры',
  values: 'Значения',
  groups: 'Группы строк',
  pivots: 'Подписи колонок',
  pivotMode: 'Режим сводной таблицы',
  valueAggregation: 'Агрегация значений',
  columnChooser: 'Выбор колонок',
  chooseColumns: 'Выбрать колонки',
  groupFilterSelect: 'Выберите поле:',
  rowGroupColumnsEmptyMessage: 'Перетащите сюда колонку, чтобы сгруппировать строки',
  valueColumnsEmptyMessage: 'Перетащите сюда колонку, чтобы считать агрегат',
  pivotColumnsEmptyMessage: 'Перетащите сюда подписи колонок',

  // ── Группировка строк и агрегаты ──────────────────────────────────────────
  expandAll: 'Развернуть все группы',
  collapseAll: 'Свернуть все группы',
  ungroupAll: 'Убрать все группировки',
  groupBy: 'Группировать по',
  ungroupBy: 'Убрать группировку по',
  addToValues: 'Добавить ${variable} в значения',
  removeFromValues: 'Убрать ${variable} из значений',
  sum: 'Сумма',
  min: 'Минимум',
  max: 'Максимум',
  avg: 'Среднее',
  count: 'Количество',
  noAggregation: 'Без агрегации',
  footerTotal: 'Итого',

  // ── Меню колонки и контекстное меню ───────────────────────────────────────
  copy: 'Копировать',
  copyWithHeaders: 'Копировать с заголовками',
  copyWithGroupHeaders: 'Копировать с заголовками групп',
  paste: 'Вставить',
  export: 'Экспорт',
  excelExport: 'Экспорт в Excel',
  csvExport: 'Экспорт в CSV',
  pinLeft: 'Закрепить слева',
  pinRight: 'Закрепить справа',
  noPin: 'Без закрепления',
  pinColumn: 'Закрепить колонку',
  pinRow: 'Закрепить строку',
  unpinRow: 'Открепить строку',
  pinTop: 'Закрепить сверху',
  pinBottom: 'Закрепить снизу',
  autosizeThisColumn: 'Подобрать ширину колонки',
  autosizeAllColumns: 'Подобрать ширину всех колонок',
  resetColumns: 'Сбросить колонки',
  sortAscending: 'Сортировать по возрастанию',
  sortDescending: 'Сортировать по убыванию',
  sortUnSort: 'Убрать сортировку',
  columnFilter: 'Фильтр колонки',

  // ── Строка состояния ──────────────────────────────────────────────────────
  totalAndFilteredRows: 'Строки',
  totalRows: 'Всего строк',
  filteredRows: 'Отфильтровано',
  selectedRows: 'Выделено',

  // ── Пагинация и состояния таблицы ─────────────────────────────────────────
  page: 'Страница',
  of: 'из',
  to: 'по',
  more: 'ещё',
  next: 'Дальше',
  previous: 'Назад',
  first: 'Первая',
  last: 'Последняя',
  firstPage: 'Первая страница',
  lastPage: 'Последняя страница',
  nextPage: 'Следующая страница',
  previousPage: 'Предыдущая страница',
  pageSizeSelectorLabel: 'Строк на странице:',
  loadingOoo: 'Загрузка…',
  noRowsToShow: 'Нет строк для показа',
  column: 'Колонка',
};

export default AG_GRID_LOCALE_RU;
