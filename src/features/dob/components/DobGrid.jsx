// src/features/dob/components/DobGrid.jsx
// AG Grid (Community) wrapper for the DOB list — dynamic columns from fields
// metadata, inline edit + queue dirty rows. Header uses AG Grid's default
// `headerComponentParams.template` so every header shows the filter icon
// (`eFilterButton`) + more icon (`eMenu`) the way the AG Grid Theme Builder
// example does; sort still works on click but no sort icons are rendered.
// The grid fills the remaining viewport height after the sticky AppBar.
import PropTypes from 'prop-types';
import { useMemo, useRef, useCallback, useEffect } from 'react';
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
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { useDobListState } from '../state/DobListStateContext';

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
  const raw = String(value);
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

function buildColumnDefs(fields) {
  if (!fields || fields.length === 0) return [];
  const systemSkip = new Set([
    'File_x0020_Type', 'ComplianceAssetId', 'LinkTitle', 'LinkTitleNoMenu', 'PermMask',
    'MetaInfo', 'FileRef', 'FileDirRef', 'FileLeafRef', 'ContentType', 'ContentTypeId',
    '_UIVersionString', 'DocIcon', 'ItemChildCount', 'FolderChildCount',
    'OData__ContentTypeId',
  ]);
  const ordered = [];
  const priority = ['ID', 'Title'];
  const fieldMap = new Map(fields.map((f) => [f.InternalName, f]));
  for (const name of priority) {
    const f = fieldMap.get(name);
    if (f) ordered.push(f);
  }
  for (const f of fields) {
    if (ordered.includes(f)) continue;
    if (f.Hidden) continue;
    if (f.InternalName === 'ChekResult' || /chekresult/i.test(f.InternalName || '') || /результат.*провер/i.test(f.Title || '')) continue;
    if (systemSkip.has(f.InternalName)) continue;
    if (f.InternalName === 'ContentType' || f.Title === 'Тип контента' || (f.Title || '').toLowerCase().includes('тип контента')) continue;
    const t = (f.TypeAsString || '').toLowerCase();
    if (['calculated', 'computed', 'text', 'choice', 'number', 'currency', 'datetime', 'note', 'boolean', 'url', 'user', 'integer', 'counter'].includes(t) || f.InternalName === 'Attachments' || f.InternalName === 'UserFail' || f.InternalName === 'ChekResult') {
      ordered.push(f);
    } else if (!f.Hidden && !systemSkip.has(f.InternalName)) {
      ordered.push(f);
    }
  }

  const cols = [];
  for (const f of ordered) {
    const internal = f.InternalName;
    const title = f.Title || internal;
    const t = (f.TypeAsString || '').toLowerCase();
    const editable = isEditableField(f);
    const isCalculated = t === 'calculated' || t === 'computed';

    if (internal === 'Author' || internal === 'Editor') {
      cols.push({
        field: internal,
        headerName: title,
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
        headerName: 'UserFail (виновный)',
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
    if ((f.TypeAsString || '').toLowerCase() === 'user') {
      const lowTitle = (title || '').toLowerCase();
      const isDupAuthor = lowTitle.includes('кем создано') || lowTitle.includes('создал') || lowTitle === 'автор';
      const isDupEditor = lowTitle.includes('кем измен') || lowTitle.includes('изменил') || lowTitle.includes('изменено');
      if ((isDupAuthor && cols.some((c) => c.field === 'Author')) || (isDupEditor && cols.some((c) => c.field === 'Editor'))) {
        continue;
      }
      if (cols.some((c) => (c.headerName || '').toLowerCase() === lowTitle && c.field !== internal)) {
        continue;
      }
      cols.push({
        field: internal,
        headerName: title + (f.Required ? ' *' : ''),
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
        headerName: 'Вложения',
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
    const col = {
      field: internal,
      headerName: title + (f.Required ? ' *' : ''),
      flex: 1,
      minWidth: 120,
      editable: editable && !isCalculated,
      headerTooltip: `${internal} — ${f.TypeAsString}${f.Description ? ' | ' + String(f.Description).slice(0, 80) : ''}`,
      tooltipValueGetter: (p) => (p.value ? String(p.value).slice(0, 120) : ''),
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
      const vals = (rawChoices || []).filter(Boolean);
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

export default function DobGrid({ fields, rows }) {
  const gridRef = useRef(null);
  const {
    selectedId,
    setSelectedId,
    setDirty,
    fields: ctxFields,
    saveError,
    clearSaveError,
    loading,
  } = useDobListState();

  const baseColumnDefs = useMemo(() => buildColumnDefs(fields || ctxFields || []), [fields, ctxFields]);
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
    return rows.map((r) => {
      const copy = { ...r };
      if (r.Author && r.Author.Title) copy.Author = r.Author;
      if (r.Editor && r.Editor.Title) copy.Editor = r.Editor;
      return copy;
    });
  }, [rows]);

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

  const onCellValueChanged = useCallback(
    (evt) => {
      const field = evt.colDef.field;
      const newVal = evt.newValue;
      const oldVal = evt.oldValue;
      if (newVal === oldVal) return;
      const id = evt.data?.ID ?? evt.data?.Id ?? evt.data?.OData__ID ?? evt.data?.ID;
      if (!id) return;
      setDirty((prev) => {
        const next = new Map(prev);
        const existing = next.get(id) || {};
        const meta = (fields || ctxFields || []).find((f) => f.InternalName === field);
        const t = (meta?.TypeAsString || '').toLowerCase();
        const normalized = t === 'boolean' ? (newVal ? true : false) : newVal;
        next.set(id, { ...existing, [field]: normalized, _orig: evt.data });
        return next;
      });
    },
    [setDirty, fields, ctxFields],
  );

  const gridOptions = useMemo(
    () => ({
      animateRows: true,
      rowSelection: { mode: 'singleRow', enableClickSelection: true },
      suppressRowHoverHighlight: false,
      ensureDomOrder: true,
      suppressMenuHide: true,
      // Side bar lets users drag columns between the grid and a hidden panel.
      // We keep it off by default to match the Theme Builder look.
      sideBar: false,
      statusBar: undefined,
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
      }}
    >
      {saveError && (
        <Alert severity="error" sx={{ mb: 1, borderRadius: 1.5 }} onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

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
            columnDefs={baseColumnDefs}
            rowData={rowData}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            pagination
            paginationPageSize={50}
            paginationPageSizeSelector={[20, 50, 100, 200]}
            enableCellTextSelection
            onCellValueChanged={onCellValueChanged}
            onSelectionChanged={onSelectionChanged}
            stopEditingWhenCellsLoseFocus
            getRowId={(p) => String(p.data?.ID ?? p.data?.Id ?? p.data?.ID ?? Math.random())}
            overlayNoRowsTemplate='<span style="padding:12px;color:#5b6273">Нет данных — проверьте доступ к /sites/dob/doblogistic</span>'
          />
        )}
      </Box>

      <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#5b6273' }}>
        Двойной клик по ячейке — редактирование. Choice — выбор из списка, Дата — yyyy-mm-dd или дд.мм.гггг, Валюта/Число —
        цифры, Чекбокс — клик. После правок нажмите <b>Сохранить</b> (пакетный MERGE). Поля <i>Статус / Неделя / Дата
        подтверждения / Логин (формула)</i> — вычисляемые, только чтение. Скрытие/показ колонок — через меню «⋮» в шапке.
      </Typography>
    </Box>
  );
}

DobGrid.propTypes = {
  fields: PropTypes.array,
  rows: PropTypes.array,
};