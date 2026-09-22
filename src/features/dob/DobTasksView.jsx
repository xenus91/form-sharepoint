// src/features/dob/DobTasksView.jsx
// Page for hash #dob_tasks — AG Grid editable over /sites/dob/doblogistic list 64DB263C...
import React, { useMemo, useEffect } from 'react';
import { Box, Paper, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useDobFields } from './hooks/useDobFields';
import { useDobItemsPaged } from './hooks/useDobItems';
import DobGrid from './components/DobGrid';
import { useQueryClient } from '@tanstack/react-query';

export default function DobTasksView() {
  const fieldsQ = useDobFields(true);
  const fieldsData = fieldsQ.data || null;
  // Calculated поле Статус нельзя фильтровать на сервере (SPException) — только клиентский
  const statusFilter = React.useMemo(() => '', [fieldsData]);
  const itemsQ = useDobItemsPaged({ enabled: true, pageSize: 100, fields: fieldsData, filter: statusFilter });
  const qc = useQueryClient();
  useEffect(() => {
    const reportLayout = () => {
      const shell = document.querySelector('[data-dob-shell]');
      const page = document.querySelector('[data-dob-page]');
      const grid = document.querySelector('.ag-root-wrapper');
      const chain = (node) => {
        const result = [];
        let current = node;
        for (let i = 0; current && i < 7; i += 1, current = current.parentElement) {
          const rect = current.getBoundingClientRect();
          const style = getComputedStyle(current);
          result.push({ tag: current.tagName, class: String(current.className).slice(0, 100), width: Math.round(rect.width), clientWidth: current.clientWidth, maxWidth: style.maxWidth, display: style.display, overflowX: style.overflowX });
        }
        return result;
      };
      console.groupCollapsed('[DOB layout] ширина #dob_tasks');
      console.log({ viewport: window.innerWidth, document: document.documentElement.clientWidth, body: document.body.clientWidth, root: document.getElementById('root')?.clientWidth, shell: shell?.getBoundingClientRect().width, page: page?.getBoundingClientRect().width, grid: grid?.getBoundingClientRect().width, horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth });
      console.table(chain(page || shell));
      console.groupEnd();
    };
    const timer = window.setTimeout(reportLayout, 0);
    window.addEventListener('resize', reportLayout);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', reportLayout); };
  }, []);

  // Все хуки до условных return (Rules of Hooks)
  const fields = fieldsData || [];
  const rawRows = itemsQ.data || [];
  // Клиентский фильтр Открыт — OData__ prefix (SP возвращает OData__x...)
  const rows = React.useMemo(() => {
    if (!rawRows.length || !fields.length) return rawRows;
    const statusField = fields.find(x => x.Title === 'Статус' || x.Title?.toLowerCase() === 'статус');
    const internal = statusField?.InternalName;
    if (!internal) return rawRows;
    function getVal(r, f) {
      return r[f] ?? r['OData__' + f] ?? r['OData_' + f] ?? '';
    }
    const filtered = rawRows.filter(r => String(getVal(r, internal) || '').trim() === 'Открыт');
    if (filtered.length === 0 && rawRows.length > 0) {
      const hasOpen = rawRows.some(r => String(getVal(r, internal)||'').trim()==='Открыт');
      return hasOpen ? filtered : rawRows;
    }
    return filtered;
  }, [rawRows, fields]);

  const handleRefresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ['dob'] });
    fieldsQ.refetch();
    itemsQ.refetch();
  }, [qc, fieldsQ, itemsQ]);

  if (fieldsQ.isLoading && itemsQ.isLoading) {
    return (
      <Box sx={{ display:'grid', placeItems:'center', minHeight: 400, p:3 }}>
        <CircularProgress />
        <Typography color="text.secondary" sx={{ mt:1 }}>Загрузка метаданных ДОБ…</Typography>
      </Box>
    );
  }

  if (fieldsQ.isError) {
    const msg = String(fieldsQ.error?.response?.data?.error?.message?.value || fieldsQ.error?.message || '').slice(0,300);
    return (
      <Box sx={{ p:2 }}>
        <Alert severity="error" sx={{ borderRadius:2 }}>
          Не удалось загрузить поля ДОБ ({msg}) — проверьте доступ к <code>/sites/dob/doblogistic/_api/web/lists(guid'64DB263C-2ED6-4FD5-8760-AE5E3E4A331C')</code>.
          <Box sx={{ mt:1 }}><Button size="small" variant="outlined" onClick={handleRefresh}>Повторить</Button></Box>
        </Alert>
        <Paper sx={{ p:2, mt:2, borderRadius:2 }}>
          <Typography variant="caption" color="text.secondary">
            В dev нужно указать VITE_PROXY_BASE_URL=https://your-tenant.sharepoint.com и запустить `npm run dev`.
            В проде страница использует cookies текущего пользователя — нужен доступ на чтение/запись к списку на другом сайте.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box data-dob-page="true" sx={{ p:{xs:1, sm:2}, maxWidth: 'none', mx: 0, width:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', height:'calc(100vh - 8px)', minHeight:'calc(100vh - 8px)' }}>
      {(fieldsQ.isFetching || itemsQ.isFetching) && <Typography variant="caption" color="text.secondary" sx={{ mb:1 }}>обновление…</Typography>}
      {itemsQ.isError && <Alert severity="warning" sx={{ mb:1, borderRadius:2 }}>{String(itemsQ.error?.message||'Ошибка загрузки данных').slice(0,300)} <Button size="small" onClick={handleRefresh}>Повторить</Button></Alert>}
      <Box sx={{ flex:1, minHeight: 520, display:'flex' }}>
        <DobGrid fields={fields} rows={rows} loading={itemsQ.isLoading} isFetching={itemsQ.isFetching} onRefresh={handleRefresh} />
      </Box>
    </Box>
  );
}
