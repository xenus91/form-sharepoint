// src/features/dob/DobTasksView.jsx
// Page for hash #dob_tasks — owns the AppBar, the DobListStateProvider and
// the AG Grid. The action toolbar (Изменить / Обновить / Сбросить / Сохранить)
// used to live above the grid; it now lives in the AppBar and exchanges
// state with the grid via the DobListStateContext. The whole page is a
// vertical flex container so the grid fills the remaining viewport height
// below the sticky AppBar.
import { useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useDobFields } from './hooks/useDobFields';
import { useDobItemsPaged } from './hooks/useDobItems';
import DobGrid from './components/DobGrid';
import DobListAppBar from './components/DobListAppBar';
import { DobListStateProvider } from './state/DobListStateContext';
import { useQueryClient } from '@tanstack/react-query';

export default function DobTasksView({ onOpenDrawer }) {
  const fieldsQ = useDobFields(true);
  const fieldsData = useMemo(() => fieldsQ.data || null, [fieldsQ.data]);
  const itemsQ = useDobItemsPaged({ enabled: true, pageSize: 100, fields: fieldsData, filter: '' });
  const qc = useQueryClient();

  useEffect(() => {
    const reportLayout = () => {
      const shell = document.querySelector('[data-dob-shell]');
      const page = document.querySelector('[data-dob-page]');
      const grid = document.querySelector('.ag-root-wrapper');
      console.groupCollapsed('[DOB layout] #dob_tasks');
      console.log({
        viewport: window.innerWidth,
        document: document.documentElement.clientWidth,
        body: document.body.clientWidth,
        shell: shell?.getBoundingClientRect().width,
        page: page?.getBoundingClientRect().width,
        grid: grid?.getBoundingClientRect().width,
        hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
      console.groupEnd();
    };
    const timer = window.setTimeout(reportLayout, 0);
    window.addEventListener('resize', reportLayout);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', reportLayout);
    };
  }, []);

  const fields = useMemo(() => fieldsData || [], [fieldsData]);
  const rawRows = useMemo(() => itemsQ.data || [], [itemsQ.data]);

  // Клиентский фильтр «Открыт» — OData__ prefix (SP возвращает OData__x...)
  const rows = useMemo(() => {
    if (!rawRows.length || !fields.length) return rawRows;
    const statusField = fields.find((x) => {
      const title = String(x.Title || '').trim().toLowerCase();
      return title === 'статус' || title.includes('статус');
    });
    const internal = statusField?.InternalName;
    if (!internal) {
      console.warn('[DOB] поле статуса не найдено — фильтр «Открыт» не применён');
      return rawRows;
    }
    function getVal(r, f) {
      const value = r[f] ?? r['OData__' + f] ?? r['OData_' + f] ?? '';
      return String(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }
    // The list view intentionally contains only open requests.
    return rawRows.filter((r) => getVal(r, internal).toLowerCase() === 'открыт');
  }, [rawRows, fields]);

  const handleRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['dob'] });
    fieldsQ.refetch();
    itemsQ.refetch();
  }, [qc, fieldsQ, itemsQ]);

  if (fieldsQ.isLoading && itemsQ.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 480, p: 3 }}>
        <CircularProgress />
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Загрузка метаданных ДОБ…
        </Typography>
      </Box>
    );
  }

  if (fieldsQ.isError) {
    const msg = String(
      fieldsQ.error?.response?.data?.error?.message?.value ||
        fieldsQ.error?.message ||
        '',
    ).slice(0, 300);
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ borderRadius: 1.5 }}>
          Не удалось загрузить поля ДОБ ({msg}) — проверьте доступ к{' '}
          <code>/sites/dob/doblogistic/_api/web/lists(guid&apos;21B5B544-BD98-4B06-891F-C5A137331394&apos;)</code>.
          <Box sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={handleRefresh}>
              Повторить
            </Button>
          </Box>
        </Alert>
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
          В dev нужно указать VITE_PROXY_BASE_URL=https://your-tenant.sharepoint.com и запустить `npm run dev`. В
          проде страница использует cookies текущего пользователя — нужен доступ на чтение/запись к списку на другом
          сайте.
        </Typography>
      </Box>
    );
  }

  return (
    <DobListStateProvider
      fields={fields}
      rows={rows}
      loading={itemsQ.isLoading}
      isFetching={itemsQ.isFetching}
      onRefresh={handleRefresh}
    >
      <Box
        data-dob-page="true"
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          minWidth: 0,
          mx: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 0',
          bgcolor: '#ffffff',
        }}
      >
        <DobListAppBar onOpenDrawer={onOpenDrawer} />

        {(fieldsQ.isFetching || itemsQ.isFetching) && (
          <Typography variant="caption" sx={{ px: 2, pt: 1, color: '#5b6273' }}>
            обновление…
          </Typography>
        )}
        {itemsQ.isError && (
          <Alert
            severity="warning"
            sx={{ m: 2, borderRadius: 1.5 }}
            action={
              <Button size="small" onClick={handleRefresh}>
                Повторить
              </Button>
            }
          >
            {String(itemsQ.error?.message || 'Ошибка загрузки данных').slice(0, 300)}
          </Alert>
        )}

        <Box
          sx={{
            flex: '1 1 0',
            minHeight: 0,
            minWidth: 0,
            p: { xs: 1, sm: 2 },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <DobGrid fields={fields} rows={rows} />
        </Box>
      </Box>
    </DobListStateProvider>
  );
}

DobTasksView.propTypes = {
  onOpenDrawer: PropTypes.func,
};