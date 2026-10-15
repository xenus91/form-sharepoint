// src/features/dob/components/DobGrid.jsx
// AG Grid (Community) wrapper for the DOB list — dynamic columns from fields
// metadata. Заявки в этой таблице ТОЛЬКО просматриваются (readOnly): правки в
// ячейках и накопления dirty-строк больше нет (требование 2026-10-15).
// Группировка по статусу собирается вручную — Row Grouping в AG Grid это
// Enterprise-фича, а стоит у нас ag-grid-community (см. lib/requestListFilters).
// Header uses AG Grid's default
// `headerComponentParams.template` so every header shows the filter icon
// (`eFilterButton`) + more icon (`eMenu`) the way the AG Grid Theme Builder
// example does; sort still works on click but no sort icons are rendered.
// The grid fills the remaining viewport height after the sticky AppBar.
import PropTypes from 'prop-types';
import { useMemo, useRef, useCallback, useEffect } from 'react';
import { isUserField } from "../lib/dobFormFields";
import { cellText } from "../lib/cellText";
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
import { Box, CircularProgress, Typography } from '@mui/material';
import { useDobListState } from '../state/DobListStateContext';
import { isRowCompleted, statusInternalOf } from '../lib/dobRowStatus';
import { selectRequestFields } from '../lib/requestFields';
import { groupRowsByStatus, regroupSortedNodes, isGroupRow, groupRowId } from '../lib/requestListFilters';

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
]);

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

function buildColumnDefs(fields, ctFieldNames, { readOnly = false } = {}) {
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
        valueGetter: (p) => {
          const v = p.data?.[internal];
          if (v && typeof v === 'object' && v.Title) return v.Title;
          if (p.data?.[internal]?.Title) return p.data[internal].Title;
          return p.data?.[`${internal}/Title`] || p.data?.[internal] || '';
        },
        cellStyle: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        filter: 'agTextColumnFilter',
      });
      continue;
    }
    if (internal === 'UserFail') {
      cols.push({
        field: internal,
        headerName: f.Description ? label : 'UserFail (виновный)',
        width: 150,
        editable: false,
        valueGetter: (p) => {
          const v = p.data?.[internal];
          if (v && typeof v === 'object') return v.Title || v.Name || '';
          return p.data?.['UserFail/Title'] || p.data?.UserFailTitle || p.data?.['UserFailId'] || '';
        },
        filter: 'agTextColumnFilter',
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
        valueGetter: (p) => {
          const v = p.data?.[internal];
          if (v && typeof v === 'object') return v.Title || v.Name || '';
          return p.data?.[`${internal}/Title`] || p.data?.[internal] || '';
        },
        cellStyle: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        filter: 'agTextColumnFilter',
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
        filter: 'agTextColumnFilter',
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
      col.filter = 'agTextColumnFilter';
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
      col.filter = 'agTextColumnFilter';
      col.width = 200;
    } else if (t === 'boolean') {
      col.cellRenderer = (p) => (p.value ? '☑ Да' : '☐ Нет');
      col.cellEditor = 'agCheckboxCellEditor';
      col.filter = 'agTextColumnFilter';
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
        const v = p.value;
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
        const v = p.value;
        if (v == null || v === '') return '';
        const n = Number(v);
        if (isNaN(n)) return String(v);
        if (t === 'currency') return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return String(n);
      };
      col.valueParser = (p) => {
        const s = String(p.newValue).replace(',', '.');
        const n = Number(s);
        return isNaN(n) ? null : n;
      };
      col.cellStyle = { textAlign: 'right' };
    } else if (t === 'text' || t === 'note' || t === 'url') {
      col.filter = 'agTextColumnFilter';
      col.cellEditor = t === 'note' ? 'agLargeTextCellEditor' : 'agTextCellEditor';
    } else {
      col.filter = 'agTextColumnFilter';
    }

    // Страховка от «[object Object]»: если для типа не задан свой форматтер,
    // значение всё равно приводим к тексту (объекты {Value}, коллекции, массивы).
    if (!col.valueFormatter) col.valueFormatter = (p) => cellText(p.value);

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

// ---------- component ----------

export default function DobGrid({ fields, rows, ctFieldNames = null, groupByStatus = false, readOnly = true }) {
  const gridRef = useRef(null);
  const {
    selectedId,
    setSelectedId,
    fields: ctxFields,
    loading,
    openItem,
  } = useDobListState();

  const baseColumnDefs = useMemo(
    () => buildColumnDefs(fields || ctxFields || [], ctFieldNames, { readOnly }),
    [fields, ctxFields, ctFieldNames, readOnly],
  );
  // Строка-заголовок группы растягивается на всю ширину таблицы.
  const columnDefs = useMemo(() => {
    if (!groupByStatus || baseColumnDefs.length === 0) return baseColumnDefs;
    const [first, ...rest] = baseColumnDefs;
    return [
      { ...first, colSpan: (p) => (isGroupRow(p.data) ? baseColumnDefs.length : undefined) },
      ...rest,
    ];
  }, [baseColumnDefs, groupByStatus]);
  // В какую колонку пишем подпись группы.
  const labelField = groupByStatus ? baseColumnDefs[0]?.field || null : null;
  const statusInternal = useMemo(() => statusInternalOf(fields || ctxFields || []), [fields, ctxFields]);
  // Завершённую задачу нельзя править и пакетной записью (кнопка «Сохранить»).
  const rowCompletedClassRules = useMemo(
    () => ({ 'dob-row-completed': (p) => isRowCompleted(p?.data, statusInternal) }),
    [statusInternal],
  );
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      minWidth: 120,
      enableCellChangeFlash: true,
      headerComponentParams: { template: HEADER_TEMPLATE },
      // Community build: do not configure enterprise-only column menu tabs.
      cellStyle: { fontSize: 13, lineHeight: '1.35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      filterParams: { buttons: ['reset', 'apply'], closeOnApply: true },
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
    return groupByStatus ? groupRowsByStatus(plain, statusInternal, { labelField }) : plain;
  }, [rows, groupByStatus, statusInternal, labelField]);

  // После любой сортировки пользователя группы собираются заново.
  const postSortRows = useCallback(
    (rowNodes) => regroupSortedNodes(rowNodes, statusInternal),
    [statusInternal],
  );

  const getRowId = useCallback(
    (p) => (isGroupRow(p.data)
      ? groupRowId(p.data)
      : String(p.data?.ID ?? p.data?.Id ?? p.data?.OData__ID ?? Math.random())),
    [],
  );

  const getRowClass = useCallback(
    (p) => (isGroupRow(p.data) ? 'dob-group-row' : ''),
    [],
  );

  const onRowDoubleClicked = useCallback(
    (evt) => {
      const data = evt?.data;
      if (!data || isGroupRow(data)) return;
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

  const gridOptions = useMemo(
    () => ({
      animateRows: true,
      rowSelection: { mode: 'singleRow', enableClickSelection: true },
      suppressRowHoverHighlight: false,
      ensureDomOrder: true,
      suppressMenuHide: true,
      postSortRows: groupByStatus ? postSortRows : undefined,
      // Side bar lets users drag columns between the grid and a hidden panel.
      // We keep it off by default to match the Theme Builder look.
      sideBar: false,
      statusBar: undefined,
    }),
    [groupByStatus, postSortRows],
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
        // Строка-заголовок группы статусов (группировка собирается вручную).
        '& .dob-group-row .ag-cell': {
          bgcolor: '#eef1ff',
          color: '#171c8f',
          fontWeight: 700,
          borderBottom: '1px solid #d8ddf5',
        },
        '& .dob-group-row': { cursor: 'default' },
      }}
    >
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
            ref={gridRef}
            theme={dobTheme}
            columnDefs={columnDefs}
            rowData={rowData}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            pagination
            paginationPageSize={50}
            paginationPageSizeSelector={[20, 50, 100, 200]}
            enableCellTextSelection
            onSelectionChanged={onSelectionChanged}
            onRowDoubleClicked={onRowDoubleClicked}
            rowClassRules={rowCompletedClassRules}
            getRowId={getRowId}
            getRowClass={getRowClass}
            overlayNoRowsTemplate='<span style="padding:12px;color:#5b6273">Нет данных — проверьте доступ к /sites/dob/doblogistic</span>'
          />
        )}
      </Box>

      <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#5b6273' }}>
        Заявки доступны только для просмотра — изменение заявок в этом разделе отключено. Двойной клик по строке
        открывает заявку на просмотр. Фильтры по статусу и типу заявки — в шапке; группировку по статусу можно
        выключить там же. Скрытие/показ колонок — через меню «⋮» в шапке таблицы.
      </Typography>
    </Box>
  );
}

DobGrid.propTypes = {
  fields: PropTypes.array,
  rows: PropTypes.array,
  // Группировать строки по статусу (заголовки групп вставляются в rowData).
  groupByStatus: PropTypes.bool,
  // Только просмотр: ни одна ячейка не редактируется.
  readOnly: PropTypes.bool,
  // Внутренние имена полей из FieldLinks типов контента списка — по ним решаем,
  // какие поля показывать в таблице заявок (см. selectRequestFields).
  ctFieldNames: PropTypes.oneOfType([PropTypes.instanceOf(Set), PropTypes.array]),
};