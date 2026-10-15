// src/features/dob/lib/gridContextMenu.js
//
// Контекстное меню таблицы #dob_requests.
//
// Пункты «Развернуть все группы» и «Свернуть все группы» — ВСТРОЕННЫЕ в AG Grid
// (требование 2026-10-15: «возможно, есть встроенный инструмент allcollapse?»):
// в ag-grid-enterprise они лежат в ветках `case "expandAll"` /
// `case "contractAll"` фабрики пунктов меню и сами вызывают
// expansionSvc.expandAll(true/false). Подписи берутся из локали (ключи
// `expandAll` / `collapseAll` — «Развернуть все группы» / «Свернуть все
// группы»), поэтому своих пунктов с теми же действиями не держим.
//
// Обратите внимание: ключ пункта — `contractAll`, а не `collapseAll`
// (`collapseAll` — только ключ локали).

/**
 * @param {object} params
 * @param {Array} [params.defaultItems] — пункты AG Grid по умолчанию
 * @param {Function} [params.onResetState] — сброс сохранённых настроек таблицы
 * @returns {Array}
 */
export function buildContextMenuItems({ defaultItems = [], onResetState = null } = {}) {
  return [
    'copy',
    'copyWithHeaders',
    'paste',
    'separator',
    'export',
    'separator',
    'rowGrouping',
    'separator',
    // Встроенные: свернуть/развернуть ВСЕ группы строк.
    'expandAll',
    'contractAll',
    'separator',
    {
      name: 'Сбросить настройки таблицы',
      icon: '<span class="ag-icon ag-icon-cancel" role="presentation"></span>',
      action: () => onResetState?.(),
    },
    'separator',
    ...(defaultItems || []),
  ];
}

export default buildContextMenuItems;
