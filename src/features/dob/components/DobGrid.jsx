// src/features/dob/components/DobGrid.jsx
// AG Grid wrapper for the DOB list — dynamic columns from fields metadata.
// Заявки в этой таблице ТОЛЬКО просматриваются (readOnly): правки в ячейках и
// накопления dirty-строк больше нет (требование 2026-10-15).
//
// Группировка по статусу — ШТАТНАЯ функция AG Grid (colDef.rowGroup +
// groupDisplayType="singleColumn"): разворачиваемые группы со счётчиком и
// шевроном. Режим 'singleColumn' выбран не случайно: при 'groupRows' строка
// группы рисуется ПОЛНОШИРИННОЙ (в .ag-full-width-container, без ячеек по
// колонкам) — и агрегатам по группам просто негде показаться. Row Grouping
// входит в AG Grid Enterprise, поэтому подключён пакет
// ag-grid-enterprise (RowGroupingModule). Ключ лицензии берётся из
// VITE_AG_GRID_LICENSE_KEY (.env): без ключа грид работает, но показывает
// водяной знак и предупреждение в консоли.
// Header uses AG Grid's default
// `headerComponentParams.template` so every header shows the filter icon
// (`eFilterButton`) + more icon (`eMenu`) the way the AG Grid Theme Builder
// example does; sort still works on click but no sort icons are rendered.
// The grid fills the remaining viewport height after the sticky AppBar.
import PropTypes from 'prop-types';
import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { isUserField } from "../lib/dobFormFields";
import { cellText } from "../lib/cellText";
import { personCellText, safeText } from "../lib/personText";
import { contentTypeDisplayName, contentTypeNameOfRow, DOB_CT_COLUMN_FIELD } from "../lib/requestFields";
import { ctIdOf } from "../lib/requestListFilters";
import { AG_GRID_LOCALE_RU } from "../lib/agGridLocaleRu";
import { gridStateKey, loadGridState, saveGridState, clearGridState } from "../lib/gridStateStorage";
import { buildContextMenuItems } from "../lib/gridContextMenu";
import { AgGridReact } from 'ag-grid-react';
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CustomFilterModule,
  ColumnApiModule,
  ColumnHoverModule,
  CsvExportModule,
} from 'ag-grid-community';
// Enterprise-модули AG Grid: группировка, Set-фильтры (выбор значений),
// панели колонок/фильтров, контекстное меню, буфер обмена, экспорт в Excel,
// строка состояния, номера строк.
import {
  RowGroupingModule,
  SetFilterModule,
  MultiFilterModule,
  SideBarModule,
  ColumnsToolPanelModule,
  FiltersToolPanelModule,
  ContextMenuModule,
  MenuModule,
  ColumnMenuModule,
  ClipboardModule,
  RangeSelectionModule,
  ExcelExportModule,
  StatusBarModule,
  RowNumbersModule,
  FindModule,
  LicenseManager,
} from 'ag-grid-enterprise';
import { Box, Button, CircularProgress, Stack, Tooltip, Typography } from '@mui/material';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PersonCell from './PersonCell';
import { useDobListState } from '../state/DobListStateContext';
import { isRowCompleted, statusInternalOf } from '../lib/dobRowStatus';
import { selectRequestFields } from '../lib/requestFields';

ModuleRegistry.registerModules([
  AllCommunityModule,
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CustomFilterModule,
  ColumnApiModule,
  ColumnHoverModule,
  CsvExportModule,
  // Enterprise
  RowGroupingModule,
  SetFilterModule,
  MultiFilterModule,
  SideBarModule,
  ColumnsToolPanelModule,
  FiltersToolPanelModule,
  ContextMenuModule,
  MenuModule,
  ColumnMenuModule,
  ClipboardModule,
  RangeSelectionModule,
  ExcelExportModule,
  StatusBarModule,
  RowNumbersModule,
  FindModule,
]);

// Ключ лицензии AG Grid Enterprise — из окружения (VITE_AG_GRID_LICENSE_KEY).
const AG_GRID_LICENSE_KEY = import.meta.env?.VITE_AG_GRID_LICENSE_KEY || '';
if (AG_GRID_LICENSE_KEY) LicenseManager.setLicenseKey(AG_GRID_LICENSE_KEY);

// ---------- helpers (preserved from the previous implementation) ----------

// SharePoint REST returns _x fields as OData__x... (with OData__ prefix), while fields metadata uses _x... without prefix
function getODataValue(row, internal) {
  if (!row || !internal) return undefined;
  if (row[internal] !== undefined) return row[internal];
  const odata = 'OData_' + internal;
  if (row[odata] !== undefined) return row[odata];
  const odata2 = 'OData__' + internal;
  if (row[odata2] !== undefined) return row[odata2];
  if (internal.startsWith('_') && row[internal.slice(1)] !== undefined) return row[internal.slice(1)];
  return undefined;
}
function setODataValue(row, internal, value) {
  row[internal] = value;
  row['OData__' + internal] = value;
  row['OData_' + internal] = value;
}

function isEditableField(f) {
  if (!f) return false;
  if (f.ReadOnlyField) return false;
  if (f.Hidden) return false;
  const t = (f.TypeAsString || '').toLowerCase();
  if (['calculated', 'computed', 'counter', 'contenttypeid', 'lookup', 'attachments', 'file', 'guid', 'integer', 'modstat'].includes(t)) return false;
  if (t === 'calculated' || t === 'computed' || t === 'lookup') return false;
  return true;
}

function htmlToCellText(value) {
  if (value === null || value === undefined) return '';
  const raw = cellText(value);
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    let text = doc.body.textContent || '';
    if (/<\/?[a-z][^>]*>/i.test(text)) {
      text = new DOMParser().parseFromString(text, 'text/html').body.textContent || text;
    }
    return text.replace(/[\u200b\u200c\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  } catch {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

// ---------- column definitions ----------

/**
 * Заголовок колонки в #dob_requests — из Description поля (требование
 * 2026-10-15: все названия колонок берём из Description), с откатом на Title,
 * если описание пустое. Description чистим тем же htmlToCellText: теги,
 * сущности (&#58; → «:») и переводы строк в шапке не нужны.
 * @param {object} f
 * @returns {string}
 */
function columnLabel(f) {
  const desc = htmlToCellText(f?.Description);
  if (desc) return desc;
  return String(f?.Title || f?.InternalName || '').trim();
}

function buildColumnDefs(fields, ctFieldNames, { readOnly = false, contentTypes = null } = {}) {
  if (!fields || fields.length === 0) return [];
  // Завершённые задачи — только просмотр (правило общее для всех интерфейсов).
  const statusInternalGlobal = statusInternalOf(fields);
  // Состав колонок — lib/requestFields: поля типов контента списка + остальные
  // несистемные (требование 2026-10-12). Локальный список исключений удалён —
  // он жил только здесь и расходился с формой.
  const ordered = selectRequestFields(fields, { ctFieldNames });

  const cols = [];
  // Title добавленных колонок (нижний регистр) — чтобы отсечь дубли
  // «Пользователь или группа» рядом с Author/Editor. Сравнивать по headerName
  // больше нельзя: шапка теперь из Description.
  const addedTitles = new Set();
  for (const f of ordered) {
    const internal = f.InternalName;
    const title = f.Title || internal; // для логики (ширина, дубли)
    const label = columnLabel(f);      // для шапки — из Description
    const t = (f.TypeAsString || '').toLowerCase();
    const editable = isEditableField(f);
    const isCalculated = t === 'calculated' || t === 'computed';

    if (internal === 'Author' || internal === 'Editor') {
      addedTitles.add(String(title).toLowerCase());
      cols.push({
        field: internal,
        headerName: label,
        width: 140,
        editable: false,
        // Поля людей показываем ФИО (User/UserMulti раскрываются в список) —
        // так же, как в таблице задач (см. lib/personText.js).
        valueGetter: (p) => personCellText(p.data, internal),
        filterValueGetter: (p) => personCellText(p.data, internal),
        cellRenderer: PersonCell,
        cellStyle: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        filter: 'agSetColumnFilter',
      });
      continue;
    }
    if (internal === 'UserFail') {
      cols.push({
        field: internal,
        headerName: f.Description ? label : 'UserFail (виновный)',
        width: 150,
        editable: false,
        valueGetter: (p) => personCellText(p.data, internal),
        filterValueGetter: (p) => personCellText(p.data, internal),
        cellRenderer: PersonCell,
        filter: 'agSetColumnFilter',
      });
      continue;
    }
    if (isUserField(f)) { // «Пользователь или группа»: User и UserMulti
      const lowTitle = (title || '').toLowerCase();
      const isDupAuthor = lowTitle.includes('кем создано') || lowTitle.includes('создал') || lowTitle === 'автор';
      const isDupEditor = lowTitle.includes('кем измен') || lowTitle.includes('изменил') || lowTitle.includes('изменено');
      if ((isDupAuthor && cols.some((c) => c.field === 'Author')) || (isDupEditor && cols.some((c) => c.field === 'Editor'))) {
        continue;
      }
      if (addedTitles.has(lowTitle)) {
        continue;
      }
      addedTitles.add(lowTitle);
      cols.push({
        field: internal,
        headerName: label + (f.Required ? ' *' : ''),
        width: 140,
        editable: false,
        // User: {Title}; UserMulti: {results:[{Title},…]} — оба дают список ФИО
        // через запятую (раньше многозначное поле показывало ПУСТО: у
        // коллекции нет свойства Title).
        valueGetter: (p) => personCellText(p.data, internal),
        filterValueGetter: (p) => personCellText(p.data, internal),
        cellRenderer: PersonCell,
        cellStyle: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        filter: 'agSetColumnFilter',
      });
      continue;
    }
    if (internal === 'Attachments') {
      cols.push({
        field: 'Attachments',
        headerName: f.Description ? label : 'Вложения',
        width: 100,
        editable: false,
        valueGetter: (p) => (p.data?.Attachments ? 'Да' : 'Нет'),
        cellStyle: (p) => (p.value === 'Да' ? { color: '#2e7d32', fontWeight: 700 } : { color: '#9aa0b4' }),
        filter: 'agSetColumnFilter',
      });
      continue;
    }
    if (internal === 'ChekResult' || internal === '_x041a__x043e__x043c__x04') continue;

    const isODataField = internal.startsWith('_x');
    addedTitles.add(String(title).toLowerCase());
    const col = {
      field: internal,
      headerName: label + (f.Required ? ' *' : ''),
      flex: 1,
      minWidth: 120,
      // editable как ФУНКЦИЯ: ячейка недоступна, если строка — завершённая задача.
      editable: (p) => editable && !isCalculated && !isRowCompleted(p?.data, statusInternalGlobal),
      headerTooltip: `${internal} — ${f.TypeAsString}${f.Description ? ' | ' + String(f.Description).slice(0, 80) : ''}`,
      tooltipValueGetter: (p) => cellText(p.value).slice(0, 120),
      ...(isODataField
        ? {
            valueGetter: (p) => getODataValue(p.data, internal),
            valueSetter: (p) => {
              setODataValue(p.data, internal, p.newValue);
              return true;
            },
          }
        : {}),
    };

    if (['text', 'note', 'url'].includes(t)) col.valueFormatter = (p) => htmlToCellText(p.value);

    if (t === 'note') col.width = 220;
    else if (t === 'choice') col.width = 170;
    else if (t === 'text' && title.includes('Комментар')) col.width = 220;
    else if (t === 'text' && internal === 'Title') col.width = 110;
    else if (t === 'datetime') col.width = 135;
    else if (t === 'currency' || t === 'number') col.width = 120;
    else if (t === 'boolean') col.width = 110;

    if (t === 'choice') {
      const rawChoices = Array.isArray(f.Choices) ? f.Choices : (f.Choices?.results || f.Choices?.Results || []);
      const vals = (rawChoices || []).filter(Boolean).map((c) => cellText(c));
      // Значение может прийти объектом ({Value: 'Годен'}) — показываем текст.
      col.valueFormatter = (p) => cellText(p.value);
      col.filterValueGetter = (p) => cellText(getODataValue(p?.data, internal));
      col.cellEditor = 'agSelectCellEditor';
      col.cellEditorParams = { values: vals.length ? vals : [''], valueListGap: 0 };
      col.filter = 'agSetColumnFilter';
      col.cellStyle = { background: 'rgba(255,255,255,0.02)' };
      if (internal === '_x043e__x0441__x043d__x043e__x04') {
        col.cellStyle = (p) => ({
          background: !p.value ? 'rgba(229,57,53,0.08)' : undefined,
          borderLeft: p.value ? undefined : '3px solid #e53935',
        });
      }
    } else if (t === 'multichoice') {
      // MultiChoice приходит коллекцией, элементы бывают объектами {Value} —
      // без нормализации в ячейке был «[object Object]».
      col.valueFormatter = (p) => cellText(p.value);
      col.filterValueGetter = (p) => cellText(getODataValue(p?.data, internal));
      col.filter = 'agSetColumnFilter';
      col.width = 200;
    } else if (t === 'boolean') {
      col.cellRenderer = (p) => (p.value ? '☑ Да' : '☐ Нет');
      col.cellEditor = 'agCheckboxCellEditor';
      col.filter = 'agSetColumnFilter';
      col.valueGetter = (p) => {
        const raw = p.data?.[internal];
        if (raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true') return true;
        return false;
      };
      col.valueSetter = (p) => {
        p.data[internal] = p.newValue ? true : false;
        return true;
      };
    } else if (t === 'datetime') {
      col.valueFormatter = (p) => {
        // Дату SharePoint тоже может отдать обёрткой {Value: '/Date(…)/'} —
        // иначе String(объект).slice(0, 10) печатал «[object Ob».
        const rawValue = p.value;
        if (!rawValue) return '';
        const v = typeof rawValue === 'object' ? cellText(rawValue) : rawValue;
        if (!v) return '';
        try {
          let d;
          if (typeof v === 'string' && v.startsWith('/Date(')) {
            const ms = parseInt(v.replace(/[^0-9]/g, ''), 10);
            d = new Date(ms);
          } else {
            d = new Date(v);
          }
          if (isNaN(d)) return String(v).slice(0, 10);
          return d.toLocaleDateString('ru-RU');
        } catch {
          return String(v).slice(0, 10);
        }
      };
      col.cellEditor = 'agDateStringCellEditor';
      col.filter = 'agDateColumnFilter';
      col.valueParser = (p) => {
        const s = String(p.newValue || '').trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
        if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
          const [d, m, y] = s.split('.');
          return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`).toISOString();
        }
        return s;
      };
    } else if (t === 'currency' || t === 'number') {
      col.filter = 'agNumberColumnFilter';
      col.cellEditor = 'agNumberCellEditor';
      col.valueFormatter = (p) => {
        // Значение числа может прийти объектом ({Value: 1500} — «выбор»,
        // вычисляемое поле, lookup). String(объект) и давал в ячейке
        // «[object Object]» — сначала достаём текст, потом считаем.
        const rawValue = p.value;
        if (rawValue == null || rawValue === '') return '';
        const v = typeof rawValue === 'object' ? cellText(rawValue) : rawValue;
        if (v === '') return '';
        const n = Number(v);
        if (isNaN(n)) return cellText(rawValue) || '';
        if (t === 'currency') return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return String(n);
      };
      col.valueParser = (p) => {
        const s = String(p.newValue).replace(',', '.');
        const n = Number(s);
        return isNaN(n) ? null : n;
      };
      col.cellStyle = { textAlign: 'right' };
      // aggFunc НЕ задаём: агрегации в таблице убраны (см. ниже).
    } else if (t === 'text' || t === 'note' || t === 'url') {
      col.filter = 'agSetColumnFilter';
      col.cellEditor = t === 'note' ? 'agLargeTextCellEditor' : 'agTextCellEditor';
    } else {
      col.filter = 'agSetColumnFilter';
    }

    // Страховка от «[object Object]»: если для типа не задан свой форматтер,
    // значение всё равно приводим к тексту (объекты {Value}, коллекции, массивы).
    if (!col.valueFormatter) col.valueFormatter = (p) => cellText(p.value);

    // ОБЩАЯ защита: что бы ни вернул форматтер колонки, в ячейку, фильтр,
    // буфер обмена и экспорт не может попасть объект (String({…}) =
    // «[object Object]» — так выглядели пустые/нераскрытые значения).
    const ownFormatter = col.valueFormatter;
    col.valueFormatter = (params) => safeText(ownFormatter ? ownFormatter(params) : params?.value, params?.value);
    if (!col.filterValueGetter) {
      col.filterValueGetter = (params) => safeText(getODataValue(params?.data, internal), params?.value);
    } else {
      const ownFilterGetter = col.filterValueGetter;
      col.filterValueGetter = (params) => safeText(ownFilterGetter(params), params?.value);
    }
    // Ключ группы: при группировке по полю-объекту (lookup, «выбор» объектом,
    // люди) подпись группы бралась из самого значения — тоже «[object Object]».
    col.keyCreator = (params) => safeText(params?.value);

    if (isCalculated) {
      col.editable = false;
      col.cellStyle = { background: 'rgba(0,0,0,0.03)', color: '#5b6273' };
    }
    if (f.Required && editable) {
      const prevStyle = col.cellStyle;
      col.cellStyle = (p) => {
        const base = typeof prevStyle === 'function' ? prevStyle(p) : (typeof prevStyle === 'object' ? prevStyle : {});
        if (!p.value && p.value !== 0) {
          return { ...(base || {}), background: 'rgba(255,193,7,0.15)', borderLeft: '3px solid #ffa000' };
        }
        return base;
      };
    }

    if (internal === 'ID') {
      col.pinned = 'left';
      col.flex = 0;
      col.width = 80;
      col.editable = false;
      col.sortable = true;
      col.filter = 'agNumberColumnFilter';
    }
    if (internal === 'Title') {
      col.pinned = 'left';
      col.flex = 0;
      col.width = 140;
    }
    cols.push(col);
  }
  // ── Колонка «Тип контента» (требование 2026-10-15) ────────────────────────
  // В самом списке такой колонки нет: тип заявки — это ContentTypeId элемента.
  // Показываем имя типа контента (его Description), ставим рядом с «Названием».
  const ctList = (Array.isArray(contentTypes) ? contentTypes : [])
    .map((ct) => ({ id: ctIdOf(ct?.StringId || ct?.Id), name: contentTypeDisplayName(ct) }))
    .filter((ct) => ct.id && ct.name)
    // У наследника ContentTypeId длиннее, чем у родительского типа, — сначала
    // проверяем более длинные Id.
    .sort((a, b) => b.id.length - a.id.length);

  if (ctList.length > 0) {
    const ctCol = {
      field: DOB_CT_COLUMN_FIELD,
      headerName: 'Тип контента',
      width: 190,
      flex: 0,
      editable: false,
      valueGetter: (p) => contentTypeNameOfRow(p?.data, ctList),
      filterValueGetter: (p) => contentTypeNameOfRow(p?.data, ctList),
      filter: 'agSetColumnFilter',
      cellStyle: { color: '#5b6273' },
    };
    const titleIndex = cols.findIndex((c) => c.field === 'Title');
    cols.splice(titleIndex >= 0 ? titleIndex + 1 : 0, 0, ctCol);
  }

  // Заявки не редактируются нигде: снимаем editable со всех колонок разом,
  // чтобы ни одна ветка выше не могла оставить ячейку редактируемой.
  if (readOnly) {
    for (const col of cols) {
      col.editable = false;
      delete col.cellEditorPopup;
    }
  }
  return cols;
}

// ---------- theme ----------
// Light theme with the same param shape as the AG Grid Theme Builder
// (accentColor, borderRadius, headerHeight, rowHeight, fontSize, etc.).
// White background, dark text — the "тёмный фон и тёмный текст в кнопках"
// complaint comes from a previous overly-blue theme; this version is
// deliberately high-contrast and clean.
const dobTheme = themeQuartz.withParams({
  accentColor: '#171c8f',
  backgroundColor: '#ffffff',
  foregroundColor: '#1f2347',
  headerBackgroundColor: '#f4f6ff',
  headerTextColor: '#1f2347',
  headerFontWeight: 700,
  oddRowBackgroundColor: '#fafbff',
  rowHoverColor: '#eef0fb',
  selectedRowBackgroundColor: '#e0e4fa',
  borderColor: '#e6e9f5',
  wrapperBorder: { style: 'solid', width: 1, color: '#e6e9f5' },
  rowBorder: { style: 'solid', width: 1, color: '#f0f2f8' },
  headerRowBorder: { style: 'solid', width: 1, color: '#dde1ee' },
  columnBorder: { style: 'solid', width: 1, color: '#f0f2f8' },
  borderRadius: 8,
  wrapperBorderRadius: 10,
  headerHeight: 46,
  rowHeight: 40,
  fontSize: 13,
  fontFamily: `'Inter','IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif`,
  spacing: 8,
  cellHorizontalPadding: 12,
  menuBackgroundColor: '#ffffff',
  menuShadow: { radius: 16, spread: 0, color: 'rgba(31,35,71,0.12)' },
  inputBackgroundColor: '#ffffff',
  inputBorder: { style: 'solid', width: 1, color: '#cdd2e3' },
  inputFocusBorder: { style: 'solid', width: 1, color: '#171c8f' },
  checkboxBorderRadius: 4,
  iconSize: 16,
  chromeBackgroundColor: '#ffffff',
  panelBackgroundColor: '#ffffff',
  popupShadow: { radius: 16, spread: 0, color: 'rgba(31,35,71,0.16)' },
});

// Default header template — only `eMenu` (more icon) + `eFilterButton`
// (filter icon) + `eLabel` with the column title. `eSortAsc` / eSortDesc /
// eSortOrder are intentionally omitted so the headers look like the
// Theme Builder example: filter icon + more icon, no big sort arrows.
const HEADER_TEMPLATE = `
<div class="ag-cell-label-container" role="presentation">
  <span data-ref="eMenu" class="ag-header-icon ag-header-cell-menu-button" aria-hidden="true"></span>
  <span data-ref="eFilterButton" class="ag-header-icon ag-header-cell-filter-button" aria-hidden="true"></span>
  <div data-ref="eLabel" class="ag-header-cell-label" role="presentation">
    <span data-ref="eText" class="ag-header-cell-text"></span>
    <span data-ref="eFilter" class="ag-header-icon ag-filter-icon" aria-hidden="true"></span>
  </div>
</div>`;

// Компактные кнопки панели над таблицей (30 px — вровень с соседними контролами).
const TOOLBAR_BUTTON_SX = {
  height: 30,
  minHeight: 30,
  px: 1,
  fontSize: '0.75rem',
  textTransform: 'none',
  color: '#171c8f',
  borderColor: '#cdd2e3',
  '&:hover': { borderColor: '#171c8f', bgcolor: 'rgba(23,28,143,0.04)' },
};

// ---------- component ----------

export default function DobGrid({
  fields,
  rows,
  ctFieldNames = null,
  // Типы контента списка — для колонки «Тип контента» (имя берём из Description).
  contentTypes = null,
  readOnly = true,
  // Стартового фильтра по статусу НЕТ (требование 2026-10-15: «убрать фильтр
  // по Открыт») — показываем все заявки, фильтр пользователь ставит сам.
  initialStatusFilter = null,
  // Идентификатор таблицы для сохранения настроек в localStorage.
  stateScope = 'dob_requests',
  // Проброс события готовности грида (api понадобится вне компонента).
  onGridReady = null,
}) {
  const gridRef = useRef(null);
  const {
    selectedId,
    setSelectedId,
    fields: ctxFields,
    loading,
    openItem,
  } = useDobListState();

  const baseColumnDefs = useMemo(
    () => buildColumnDefs(fields || ctxFields || [], ctFieldNames, { readOnly, contentTypes }),
    [fields, ctxFields, ctFieldNames, readOnly, contentTypes],
  );
  const statusInternal = useMemo(() => statusInternalOf(fields || ctxFields || []), [fields, ctxFields]);
  // Завершённую задачу нельзя править и пакетной записью (кнопка «Сохранить»).
  const rowCompletedClassRules = useMemo(
    () => ({ 'dob-row-completed': (p) => isRowCompleted(p?.data, statusInternal) }),
    [statusInternal],
  );
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      // Фильтр по умолчанию — Set-фильтр AG Grid: список значений с галочками
      // (для полей выбора это ровно то, что нужно).
      filter: 'agSetColumnFilter',
      filterParams: {
        buttons: ['reset', 'apply'],
        closeOnApply: true,
        newRowsAction: 'keep',
        excelMode: 'windows',
      },
      resizable: true,
      flex: 1,
      minWidth: 120,
      enableCellChangeFlash: true,
      headerComponentParams: { template: HEADER_TEMPLATE },
      // Колонку можно закрепить и сгруппировать по ней — через меню колонки и
      // панель «Колонки». enableValue выключен: агрегации убраны (2026-10-15),
      // поэтому раздела «Значения» в панели нет и в строке группы нет сумм.
      enableRowGroup: true,
      enableValue: false,
      menuTabs: ['generalMenuTab', 'filterMenuTab', 'columnsMenuTab'],
      cellStyle: { fontSize: 13, lineHeight: '1.35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    }),
    [],
  );

  const rowData = useMemo(() => {
    if (!rows) return [];
    const plain = rows.map((r) => {
      const copy = { ...r };
      if (r.Author && r.Author.Title) copy.Author = r.Author;
      if (r.Editor && r.Editor.Title) copy.Editor = r.Editor;
      return copy;
    });
    return plain;
  }, [rows]);

  const getRowId = useCallback(
    (p) => String(p.data?.ID ?? p.data?.Id ?? p.data?.OData__ID ?? Math.random()),
    [],
  );

  const onRowDoubleClicked = useCallback(
    (evt) => {
      // Двойной клик по строке ГРУППЫ (шеврон/подпись) заявку не открывает.
      if (evt?.node?.group) return;
      const data = evt?.data;
      if (!data) return;
      const id = data.ID ?? data.Id ?? data.OData__ID;
      if (id) openItem?.(String(id));
    },
    [openItem],
  );

  const onSelectionChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const sel = api.getSelectedNodes();
    if (sel && sel.length > 0) {
      const data = sel[0].data;
      const id = data?.ID ?? data?.Id ?? data?.OData__ID ?? data?.ID;
      setSelectedId(id ? String(id) : null);
    } else {
      setSelectedId(null);
    }
  }, [setSelectedId]);

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    if (selectedId == null) return;
    const node = api.getRowNode(String(selectedId));
    if (node && !node.isSelected()) {
      node.setSelected(true, true);
    }
  }, [selectedId]);

  // ── Сохранение пользовательских настроек таблицы ──────────────────────────
  // AG Grid v33: api.getState() отдаёт единый объект настроек, а читает грид их
  // из опции initialState (один раз при инициализации), поэтому после сброса
  // настроек грид пересоздаётся (key = stateVersion).
  const stateKey = useMemo(() => gridStateKey(stateScope), [stateScope]);
  const [savedState, setSavedState] = useState(() => loadGridState(stateKey));
  const [stateVersion, setStateVersion] = useState(0);
  useEffect(() => {
    setSavedState(loadGridState(stateKey));
  }, [stateKey]);

  const saveTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const onStateUpdated = useCallback(
    (evt) => {
      const api = evt?.api || gridRef.current?.api;
      if (!api || typeof api.getState !== 'function') return;
      // Любое изменение настроек (порядок, ширина, закрепление, фильтры,
      // группы, агрегаты) сохраняем с небольшой задержкой — не на каждый кадр.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        saveGridState(stateKey, api.getState());
      }, 400);
    },
    [stateKey],
  );

  const handleResetState = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    clearGridState(stateKey);
    setSavedState(null);
    setStateVersion((v) => v + 1);
  }, [stateKey]);

  // Контекстное меню грида собирается один раз (gridOptions мемоизирован) —
  // актуальный обработчик сброса держим в ref.
  const resetStateRef = useRef(null);
  useEffect(() => {
    resetStateRef.current = handleResetState;
  }, [handleResetState]);

  const handleExpandAll = useCallback(() => {
    gridRef.current?.api?.expandAll?.();
  }, []);
  const handleCollapseAll = useCallback(() => {
    gridRef.current?.api?.collapseAll?.();
  }, []);

  const gridOptions = useMemo(
    () => ({
      animateRows: true,
      // Выделение строки кликом — БЕЗ чекбоксов (требование 2026-10-15:
      // «удали чекбокс из таблицы»): колонка с галочками не отображается, а
      // «Открыть» в шапке по-прежнему работает от выделенной строки.
      rowSelection: {
        mode: 'singleRow',
        enableClickSelection: true,
        checkboxes: false,
        headerCheckbox: false,
      },
      suppressRowHoverHighlight: false,
      ensureDomOrder: true,
      suppressMenuHide: true,

      // ── Управление колонками и строками силами AG Grid ────────────────────
      // Правая панель: «Колонки» (показ/скрытие, порядок, закрепление слева и
      // справа, группы строк) и «Фильтры» (все фильтры списком).
      sideBar: {
        toolPanels: [
          {
            id: 'columns',
            labelDefault: 'Колонки',
            labelKey: 'columns',
            iconKey: 'columns',
            toolPanel: 'agColumnsToolPanel',
            toolPanelParams: {
              suppressPivots: true,
              suppressPivotMode: true,
              // Агрегации убраны — раздела «Значения» в панели нет.
              suppressValues: true,
              suppressRowGroups: false,
            },
          },
          {
            id: 'filters',
            labelDefault: 'Фильтры',
            labelKey: 'filters',
            iconKey: 'filter',
            toolPanel: 'agFiltersToolPanel',
          },
        ],
        // Панель не раскрывается сама — кнопки на правом краю таблицы.
        defaultToolPanel: '',
      },

      // Строка состояния: сколько всего строк, сколько отфильтровано и сколько
      // выделено. Панели агрегатов (сумма/среднее/мин/макс) убраны.
      statusBar: {
        statusPanels: [
          { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
          { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
        ],
      },

      // Выделение диапазонов ячеек + копирование/вставка (Ctrl+C / Ctrl+V),
      // номера строк, экспорт в Excel и CSV из контекстного меню.
      cellSelection: true,
      rowNumbers: true,
      suppressClipboardPaste: false,
      allowContextMenuWithControlKey: false,
      getContextMenuItems: (params) => buildContextMenuItems({
        defaultItems: params?.defaultItems,
        onResetState: () => resetStateRef.current?.(),
      }),
      defaultExcelExportParams: { skipColumnHeaders: false },
    }),
    [],
  );

  // ── Штатная группировка AG Grid (Row Grouping, Enterprise) ────────────────
  // Группируем по колонке статуса: разворачиваемые группы со счётчиком.
  //
  // В AG Grid v33 опции gridOptions.rowGroupCols БОЛЬШЕ НЕТ (грид пишет
  // «invalid gridOptions property 'rowGroupCols'») — группировка включается
  // флагом rowGroup на самой колонке, поэтому помечаем колонку статуса.
  const columnDefs = useMemo(() => {
    if (!statusInternal) return baseColumnDefs;
    let marked = false;
    const cols = baseColumnDefs.map((col) => {
      if (col.field !== statusInternal) return col;
      marked = true;
      return { ...col, rowGroup: true, enableRowGroup: true };
    });
    if (!marked) {
      console.warn(`[DobGrid] колонки «${statusInternal}» нет среди колонок таблицы — группировка не применена`);
      return baseColumnDefs;
    }
    return cols;
  }, [baseColumnDefs, statusInternal]);

  // Стартовый фильтр: открытые заявки (решение 2026-10-15 — «все статусы, но
  // по умолчанию Открыт»). Снимается одним кликом в фильтре колонки статуса или
  // в панели «Фильтры» — дальше это уже настройка пользователя. В тестах
  // отключается пропом initialStatusFilter={null}.
  // В AG Grid v33 стартовое состояние задаётся единой опцией initialState
  // (отдельной initialFilterModel нет — грид пишет «invalid gridOptions
  // property 'initialFilterModel' … did you mean … initialState»).
  const defaultInitialState = useMemo(() => {
    const values = Array.isArray(initialStatusFilter) ? initialStatusFilter.filter(Boolean) : [];
    if (!statusInternal || values.length === 0) return undefined;
    return {
      filter: {
        filterModel: { [statusInternal]: { filterType: 'set', values } },
      },
    };
  }, [statusInternal, initialStatusFilter]);

  // Сохранённые настройки пользователя важнее состояния по умолчанию: если он
  // снял фильтр «Открыт» или перегруппировал таблицу — это его выбор.
  const initialState = useMemo(
    () => (savedState && typeof savedState === 'object' ? savedState : defaultInitialState),
    [savedState, defaultInitialState],
  );

  const autoGroupColumnDef = useMemo(
    () => ({
      headerName: 'Статус',
      minWidth: 240,
      flex: 1,
      pinned: 'left',
      cellRendererParams: { suppressCount: false },
    }),
    [],
  );

  return (
    <Box
      className="dob-grid-shell"
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        bgcolor: '#ffffff',
        // Группы AG Grid: подпись и счётчик — в закрепленной группе-колонке.
        '& .ag-row-group .ag-cell': { fontWeight: 700, color: '#171c8f' },
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        justifyContent="flex-end"
        sx={{ mb: 0.5, flex: '0 0 auto' }}
      >
        <Tooltip title="Развернуть все группы строк">
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={handleExpandAll}
              data-testid="dob-grid-expand-all"
              startIcon={<UnfoldMoreIcon sx={{ fontSize: 16 }} />}
              sx={TOOLBAR_BUTTON_SX}
            >
              Развернуть все
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Свернуть все группы строк">
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCollapseAll}
              data-testid="dob-grid-collapse-all"
              startIcon={<UnfoldLessIcon sx={{ fontSize: 16 }} />}
              sx={TOOLBAR_BUTTON_SX}
            >
              Свернуть все
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Вернуть таблицу к виду по умолчанию: колонки, фильтры, группировка">
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={handleResetState}
              data-testid="dob-grid-reset-state"
              startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
              sx={TOOLBAR_BUTTON_SX}
            >
              Сбросить вид
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Box
        className="dob-ag-grid"
        sx={{
          flex: '1 1 0',
          width: '100%',
          minHeight: 0,
          minWidth: 0,
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 1px 0 rgba(31,35,71,0.04)',
          bgcolor: '#ffffff',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', height: 480, gap: 1 }}>
            <CircularProgress />
            <Typography color="text.secondary">Загрузка заявок ДОБ…</Typography>
          </Box>
        ) : (
          <AgGridReact
            // key меняем при сбросе настроек: initialState грид читает один раз
            // при инициализации, поэтому «сбросить вид» = пересоздать грид.
            key={`dob-grid-${stateVersion}`}
            ref={gridRef}
            theme={dobTheme}
            localeText={AG_GRID_LOCALE_RU}
            columnDefs={columnDefs}
            rowData={rowData}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            groupDisplayType="singleColumn"
            // Без сохранённых настроек группы раскрыты; с сохранёнными —
            // решает сам сохранённый state (rowGroupExpansion), иначе
            // groupDefaultExpanded=-1 перекрывал бы настройку пользователя.
            groupDefaultExpanded={savedState ? 0 : -1}
            groupSuppressBlankHeader
            autoGroupColumnDef={autoGroupColumnDef}
            initialState={initialState}
            pagination
            paginationPageSize={50}
            paginationPageSizeSelector={[20, 50, 100, 200]}
            enableCellTextSelection
            onSelectionChanged={onSelectionChanged}
            onStateUpdated={onStateUpdated}
            onGridReady={onGridReady}
            onRowDoubleClicked={onRowDoubleClicked}
            rowClassRules={rowCompletedClassRules}
            getRowId={getRowId}
            overlayNoRowsTemplate='<span style="padding:12px;color:#5b6273">Нет данных — проверьте доступ к /sites/dob/doblogistic</span>'
          />
        )}
      </Box>

      <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#5b6273' }}>
        Заявки доступны только для просмотра — изменение заявок в этом разделе отключено. Двойной клик по строке
        открывает заявку. Всё управление — средствами AG Grid: кнопка <b>«Колонки»</b> справа — показ/скрытие,
        порядок, закрепление слева/справа и группировка строк; кнопка <b>«Фильтры»</b> — все фильтры списком.
        Фильтр каждой колонки — список значений с галочками (иконка воронки в шапке). Правый клик — копирование,
        экспорт в Excel и CSV, группировка, «Развернуть/Свернуть все группы», «Сбросить настройки таблицы».
        Кнопками над таблицей группы сворачиваются и разворачиваются целиком; в строке группы видно её название и
        число заявок в ней. Агрегатов (сумм, средних и т. п.) в таблице нет. Внизу — счётчики строк. Настройки
        таблицы (колонки, фильтры, группы, сортировка) сохраняются автоматически и восстанавливаются при
        следующем открытии.
</Typography>
    </Box>
  );
}

DobGrid.propTypes = {
  fields: PropTypes.array,
  rows: PropTypes.array,
  // Только просмотр: ни одна ячейка не редактируется.
  readOnly: PropTypes.bool,
  // Стартовый Set-фильтр по статусу (null — показывать все статусы).
  initialStatusFilter: PropTypes.arrayOf(PropTypes.string),
  // Внутренние имена полей из FieldLinks типов контента списка — по ним решаем,
  // какие поля показывать в таблице заявок (см. selectRequestFields).
  ctFieldNames: PropTypes.oneOfType([PropTypes.instanceOf(Set), PropTypes.array]),
  // Типы контента списка: { Id/StringId, Name, Description } — для колонки
  // «Тип контента».
  contentTypes: PropTypes.array,
  // Ключ сохранения настроек таблицы в localStorage.
  stateScope: PropTypes.string,
  // Колбэк готовности грида: (event) => void, event.api — GridApi.
  onGridReady: PropTypes.func,
};