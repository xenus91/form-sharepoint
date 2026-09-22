// src/features/dob/components/DobGrid.jsx
// AG Grid wrapper for DOB list — dynamic columns from fields metadata, inline edit + save
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid v32+ uses theming via CSS; simple quartz theme via class
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { Box, Button, Chip, CircularProgress, Typography, Stack, Alert, Tooltip } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import { updateDobItem } from '../api/dobApi';
import { useNotifications } from '../../../NotificationsProvider';

// Helpers
function isEditableField(f) {
  if (!f) return false;
  if (f.ReadOnlyField) return false;
  if (f.Hidden) return false;
  const t = (f.TypeAsString || '').toLowerCase();
  if (['calculated','computed','counter','contenttypeid','lookup','attachments','file','guid','integer','modstat','integer'].includes(t)) return false;
  // keep calculated readOnly
  if (t === 'calculated' || t === 'computed' || t === 'lookup') return false;
  return true;
}

function mapTypeToEditor(f) {
  const t = (f.TypeAsString || '').toLowerCase();
  if (t === 'choice') return 'agSelectCellEditor';
  if (t === 'boolean') return 'agCheckboxCellEditor';
  if (t === 'number' || t === 'currency' || t === 'integer') return 'agNumberCellEditor';
  if (t === 'datetime') return 'agDateStringCellEditor';
  if (t === 'note') return 'agLargeTextCellEditor';
  return 'agTextCellEditor';
}

function buildColumnDefs(fields) {
  if (!fields || fields.length === 0) return [];
  // Whitelist of fields to show (Hidden=false plus key calculated)
  const allowed = new Set([
    'ID','Title','_x0414__x0430__x0442__x0430_','_x0421__x043a__x043b__x0430__x04','_x043e__x0441__x043d__x043e__x04','_x0418__x0437__x043b__x0438__x04','_x0414__x0430__x0442__x0430__x000','_x041a__x043e__x043c__x043c__x04','_x0413__x0418__x0421_','_x2116__x0020__x0415__x041e__x00','_x041f__x0440__x043e__x0434__x04','_x041a__x0440__x0430__x0442__x04','_x041a__x043e__x043b__x0438__x04','_x0421__x0442__x043e__x0438__x04','_x0414__x0430__x0442__x0430__x00','_x0424__x0418__x041e__x0020__x04','_x2116__x0020__x0422__x041a__x00','_x041b__x043e__x0433__x0438__x04','_x0420__x0435__x0437__x0443__x04','_x041a__x043e__x043c__x043c__x040','_x041e__x0448__x0438__x0431__x040','_x041a__x043e__x043b__x002d__x040','_x041e__x0448__x0438__x0431__x04','_x041a__x043e__x043b__x002d__x04','_x0421__x0442__x0430__x0442__x04','_x041d__x0435__x0434__x0435__x04','_x0414__x0430__x0442__x0430__x001','_x041e__x0442__x043a__x043e__x04','_x041d__x0435__x0020__x0430__x04','UserFail','_x0417__x0430__x043f__x0438__x04','ChekResult','Created','Modified','Author','Editor','Attachments'
  ]);
  // Keep order as in allowed set but respect fields order for those present
  const ordered = [];
  // First add fields that are in allowed in the order of allowed set to keep UX stable
  const fieldMap = new Map(fields.map(f=> [f.InternalName, f]));
  for (const name of allowed) {
    const f = fieldMap.get(name);
    if (f) ordered.push(f);
  }
  // Also add any other non-hidden editable that we missed (fallback)
  for (const f of fields) {
    if (!ordered.includes(f) && !f.Hidden && !f.ReadOnlyField && ['text','choice','number','currency','datetime','note','boolean','url','user'].includes((f.TypeAsString||'').toLowerCase())) {
      if (!allowed.has(f.InternalName)) {
        // skip system
        if (['File_x0020_Type','ComplianceAssetId','LinkTitle','PermMask','MetaInfo'].includes(f.InternalName)) continue;
        ordered.push(f);
      }
    }
  }

  const cols = [];
  for (const f of ordered) {
    const internal = f.InternalName;
    const title = f.Title || internal;
    const t = (f.TypeAsString || '').toLowerCase();
    const editable = isEditableField(f);
    const isCalculated = t === 'calculated' || t === 'computed';
    // Special handling for Author/Editor/UserFail
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
          // fallback to expanded
          return p.data?.[`${internal}/Title`] || p.data?.[internal] || '';
        },
        cellRenderer: (p) => {
          const v = p.value;
          return v ? `<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${v}</span>` : '';
        }
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
      });
      continue;
    }
    if (internal === 'Attachments') {
      cols.push({
        field: 'Attachments',
        headerName: 'Вложения',
        width: 100,
        editable: false,
        valueGetter: (p)=> p.data?.Attachments ? 'Да' : 'Нет',
        cellStyle: (p)=> p.value==='Да' ? { color: '#2e7d32', fontWeight:700 } : { color:'rgba(0,0,0,0.45)' }
      });
      continue;
    }
    if (internal === 'ChekResult' || internal === '_x041a__x043e__x043c__x043c__x04') {
      // Note tall
      cols.push({
        field: internal,
        headerName: title,
        width: 220,
        editable: editable,
        cellEditor: 'agLargeTextCellEditor',
        cellEditorParams: { maxLength: 1000, rows: 4, cols: 40 },
        autoHeight: true,
        wrapText: true,
        cellStyle: { lineHeight: '1.2', paddingTop: 6, paddingBottom: 6 }
      });
      continue;
    }

    const col = {
      field: internal,
      headerName: title + (f.Required ? ' *' : ''),
      width: 150,
      editable: editable && !isCalculated,
      headerTooltip: `${internal} — ${f.TypeAsString}${f.Description ? ' | '+String(f.Description).slice(0,80) : ''}`,
      tooltipValueGetter: (p)=> p.value ? String(p.value).slice(0, 120) : '',
      // type-specific
    };

    // Width heuristics
    if (t === 'note') col.width = 220;
    else if (t === 'choice') col.width = 170;
    else if (t === 'text' && title.includes('Комментар')) col.width = 220;
    else if (t === 'text' && internal === 'Title') col.width = 110;
    else if (t === 'datetime') col.width = 135;
    else if (t === 'currency' || t === 'number') col.width = 120;
    else if (t === 'boolean') col.width = 110;

    if (t === 'choice') {
      const vals = (f.Choices || []).filter(Boolean);
      col.cellEditor = 'agSelectCellEditor';
      col.cellEditorParams = { values: vals.length ? vals : [''] , valueListGap: 0 };
      col.filter = 'agSetColumnFilter';
      col.cellStyle = { background: 'rgba(255,255,255,0.02)' };
      if (internal === '_x043e__x0441__x043d__x043e__x04') { // Основание required
        col.cellStyle = (p)=> ({ background: !p.value ? 'rgba(229,57,53,0.08)' : undefined, borderLeft: p.value ? undefined : '3px solid #e53935' });
      }
    } else if (t === 'boolean') {
      col.cellRenderer = (p) => p.value ? '☑ Да' : '☐ Нет';
      col.cellEditor = 'agCheckboxCellEditor';
      col.filter = 'agSetColumnFilter';
      col.valueGetter = (p) => {
        const raw = p.data?.[internal];
        if (raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase()==='true') return true;
        return false;
      };
      col.valueSetter = (p) => { p.data[internal] = p.newValue ? true : false; return true; };
    } else if (t === 'datetime') {
      // SharePoint returns /Date(…) or ISO
      col.valueFormatter = (p) => {
        const v = p.value;
        if (!v) return '';
        try {
          let d;
          if (typeof v === 'string' && v.startsWith('/Date(')) {
            const ms = parseInt(v.replace(/[^0-9]/g,''),10);
            d = new Date(ms);
          } else {
            d = new Date(v);
          }
          if (isNaN(d)) return String(v).slice(0,10);
          return d.toLocaleDateString('ru-RU');
        } catch { return String(v).slice(0,10); }
      };
      col.cellEditor = 'agDateStringCellEditor';
      col.filter = 'agDateColumnFilter';
      col.valueParser = (p) => {
        // input dd.MM.yyyy or yyyy-mm-dd
        const s = String(p.newValue || '').trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
        if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
          const [d,m,y]=s.split('.'); return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00Z`).toISOString();
        }
        return s;
      };
    } else if (t === 'currency' || t === 'number') {
      col.filter = 'agNumberColumnFilter';
      col.cellEditor = 'agNumberCellEditor';
      col.valueFormatter = (p) => {
        const v = p.value;
        if (v==null || v==='') return '';
        const n = Number(v);
        if (isNaN(n)) return String(v);
        if (t==='currency') return n.toLocaleString('ru-RU', { minimumFractionDigits:2, maximumFractionDigits:2 });
        return String(n);
      };
      col.valueParser = (p) => {
        const s = String(p.newValue).replace(',','.');
        const n = Number(s);
        return isNaN(n) ? null : n;
      };
      col.cellStyle = { textAlign: 'right' };
    } else if (t === 'text' || t === 'note' || t === 'url') {
      col.filter = 'agTextColumnFilter';
      col.cellEditor = t==='note' ? 'agLargeTextCellEditor' : 'agTextCellEditor';
    } else {
      col.filter = 'agTextColumnFilter';
    }
    if (isCalculated) {
      col.editable = false;
      col.cellStyle = { background: 'rgba(0,0,0,0.03)', color: 'rgba(0,0,0,0.65)' };
    }
    if (f.Required && editable) {
      // highlight required empty
      const prevStyle = col.cellStyle;
      col.cellStyle = (p) => {
        const base = typeof prevStyle === 'function' ? prevStyle(p) : (typeof prevStyle === 'object' ? prevStyle : {});
        if (!p.value && p.value!==0) return { ...(base||{}), background: 'rgba(255,193,7,0.15)', borderLeft: '3px solid #ffa000' };
        return base;
      };
    }

    // Pin ID
    if (internal === 'ID') {
      col.pinned = 'left';
      col.width = 80;
      col.editable = false;
      col.sortable = true;
      col.filter = 'agNumberColumnFilter';
    }
    if (internal === 'Title') {
      col.pinned = 'left';
      col.width = 90;
    }
    cols.push(col);
  }
  return cols;
}

export default function DobGrid({ fields, rows, loading, onRefresh, isFetching }) {
  const gridRef = useRef(null);
  const { notify } = useNotifications();
  const [dirty, setDirty] = useState(() => new Map()); // id -> payload diff
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const columnDefs = useMemo(() => buildColumnDefs(fields), [fields]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    floatingFilter: false,
    suppressHeaderFilterButton: false,
    cellStyle: { fontSize: 13 },
  }), []);

  const rowData = useMemo(() => {
    if (!rows) return [];
    return rows.map(r => {
      // Flatten Author/Editor for grid
      const copy = { ...r };
      // Author/Title etc already via valueGetter but keep flat for quick
      if (r.Author && r.Author.Title) copy.Author = r.Author;
      if (r.Editor && r.Editor.Title) copy.Editor = r.Editor;
      return copy;
    });
  }, [rows]);

  const onCellValueChanged = useCallback((evt) => {
    const field = evt.colDef.field;
    const newVal = evt.newValue;
    const oldVal = evt.oldValue;
    if (newVal === oldVal) return;
    const id = evt.data?.ID ?? evt.data?.Id;
    if (!id) return;
    setDirty(prev => {
      const next = new Map(prev);
      const existing = next.get(id) || {};
      // Normalize boolean / datetime
      let normalized = newVal;
      // Find field meta
      const meta = fields?.find(f=>f.InternalName===field);
      const t = (meta?.TypeAsString||'').toLowerCase();
      if (t==='boolean') normalized = newVal ? true : false;
      // keep string for choice/text
      next.set(id, { ...existing, [field]: normalized, _orig: evt.data });
      return next;
    });
  }, [fields]);

  const handleSave = useCallback(async () => {
    if (dirty.size===0) return;
    setSaving(true);
    setSaveError('');
    const entries = Array.from(dirty.entries());
    let success = 0;
    let fail = 0;
    const failedIds = [];
    for (const [id, payload] of entries) {
      // strip helper
      const { _orig, ...rest } = payload;
      // Remove readOnly/calculated from payload if accidentally
      // For SharePoint, payload keys must be internal names exactly; for Boolean true/false ok, for Date ISO
      try {
        // Clean empty required? skip validation here
        await updateDobItem(id, rest);
        success++;
        // remove from dirty on success
        setDirty(prev => { const n=new Map(prev); n.delete(id); return n; });
      } catch (e) {
        fail++;
        failedIds.push(id);
        const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка';
        setSaveError(`ID ${id}: ${String(msg).slice(0,200)}`);
        // keep dirty
      }
    }
    setSaving(false);
    if (success) notify(`Сохранено ${success} строк${fail ? `, ошибок ${fail}` : ''}`, { severity: fail ? 'warning' : 'success' });
    if (fail && onRefresh) {
      // optionally refresh failed? keep dirty
    } else if (success && onRefresh) {
      // refresh to get calculated fields updated
      setTimeout(()=> onRefresh(), 500);
    }
  }, [dirty, notify, onRefresh]);

  const handleClearDirty = useCallback(() => {
    setDirty(new Map());
    setSaveError('');
    // revert grid by refreshing data (parent will refetch)
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  const gridOptions = useMemo(() => ({
    enableCellChangeFlash: true,
    animateRows: true,
    rowSelection: 'multiple',
    suppressRowHoverHighlight: false,
  }), []);

  // Auto-size columns on fields change
  useEffect(()=>{
    if (gridRef.current?.api) {
      setTimeout(()=> {
        try { gridRef.current.api.autoSizeAllColumns(false); } catch {}
      }, 300);
    }
  }, [columnDefs]);

  return (
    <Box sx={{ width: '100%', height: '100%', display:'flex', flexDirection:'column', minHeight: 520 }}>
      <Box sx={{ display:'flex', gap:1, alignItems:'center', flexWrap:'wrap', mb:1.5, p:1, border:'1px solid rgba(23,28,143,0.12)', borderRadius:'12px', bgcolor:'rgba(255,255,255,0.9)', backdropFilter:'blur(6px)' }}>
        <Typography variant="subtitle1" sx={{ fontWeight:800, color:'#171c8f', mr:1 }}>Заявки ДОБ</Typography>
        <Chip label={`${rows?.length ?? 0} записей`} size="small" sx={{ fontWeight:700 }} />
        {dirty.size>0 && <Chip label={`Изменено: ${dirty.size}`} color="warning" size="small" sx={{ fontWeight:800 }} />}
        <Box sx={{ flex:1 }} />
        <Tooltip title="Перезагрузить">
          <Button size="small" variant="outlined" onClick={onRefresh} disabled={loading||isFetching} startIcon={isFetching ? <CircularProgress size={14}/> : <RefreshIcon/>} sx={{ borderRadius:2, minWidth: 110 }}>
            Обновить
          </Button>
        </Tooltip>
        <Button size="small" variant="outlined" color="inherit" onClick={handleClearDirty} disabled={dirty.size===0 || saving} sx={{ borderRadius:2 }}>
          Сбросить
        </Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={dirty.size===0 || saving} startIcon={saving ? <CircularProgress size={14} color="inherit"/> : <SaveIcon/>} sx={{ borderRadius:2, minWidth: 120, backgroundImage: 'linear-gradient(180deg,#171c8f 0%,#10146a 100%)' }}>
          {saving ? 'Сохранение…' : `Сохранить${dirty.size ? ` (${dirty.size})` : ''}`}
        </Button>
      </Box>

      {saveError && <Alert severity="error" sx={{ mb:1, borderRadius:2 }} onClose={()=>setSaveError('')}>{saveError}</Alert>}

      <Box className="ag-theme-quartz" sx={{ flex:1, width:'100%', minHeight: 420, borderRadius:'12px', overflow:'hidden', border:'1px solid rgba(23,28,143,0.12)', '& .ag-header': { background: '#f8f9ff' } }}>
        {loading ? (
          <Box sx={{ display:'grid', placeItems:'center', height: 420, gap:1 }}>
            <CircularProgress />
            <Typography color="text.secondary">Загрузка заявок ДОБ…</Typography>
          </Box>
        ) : (
          <AgGridReact
            ref={gridRef}
            columnDefs={columnDefs}
            rowData={rowData}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            pagination={true}
            paginationPageSize={50}
            paginationPageSizeSelector={[20,50,100,200]}
            enableCellTextSelection={true}
            onCellValueChanged={onCellValueChanged}
            stopEditingWhenCellsLoseFocus={true}
            getRowId={(p)=> String(p.data?.ID ?? p.data?.Id ?? p.data?.GUID ?? Math.random())}
            overlayNoRowsTemplate={'<span style="padding:12px;color:#666">Нет данных — проверьте доступ к /sites/dob/doblogistic</span>'}
            rowHeight={36}
            headerHeight={36}
          />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt:1, display:'block' }}>
        Двойной клик по ячейке — редактирование. Choice — выбор из списка, Дата — yyyy-mm-dd или дд.мм.гггг, Валюта/Число — цифры, Чекбокс — клик. После правок нажмите <b>Сохранить</b> (па Batch PATCH по MERGE). Поля <i>Статус / Неделя / Дата подтверждения / Логин (формула)</i> — вычисляемые, только чтение.
      </Typography>
    </Box>
  );
}
