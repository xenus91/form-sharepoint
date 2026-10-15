// src/features/dob/DobTasksView.jsx
// Страница #dob_requests: шапка, провайдер состояния и таблица.
//
// Конвейер строк (требования 2026-10-15):
//   1) область видимости сотрудника — DC = Office (для «Отдела по обеспечению
//      бизнеса») либо DC = Office И InitiatingDepartment = Department;
//      Поршаков Сергей — исключение, видит всё (lib/requestScope);
//   2) дальше строки уходят в таблицу как есть: фильтрация (в том числе
//      стартовый «Открыт»), группировка и закрепление колонок настраиваются
//      пользователем средствами AG Grid (см. components/DobGrid.jsx).
//
// Заявки здесь только просматриваются: правки в таблице и в шапке нет.
import { useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useDobFields } from './hooks/useDobFields';
import { useDobContentTypes } from './hooks/useDobContentTypes';
import { useDobItemsPaged } from './hooks/useDobItems';
import DobGrid from './components/DobGrid';
import DobListAppBar from './components/DobListAppBar';
import { DobListStateProvider } from './state/DobListStateContext';
import { useQueryClient } from '@tanstack/react-query';
import { buildRequestScope, applyRequestScope } from './lib/requestScope';

export default function DobTasksView({ onOpenDrawer, tasksCount = 0, userProfile = null }) {
  const fieldsQ = useDobFields(true);
  // Типы контента: их поля идут первыми колонками таблицы заявок.
  const { ctFieldNames } = useDobContentTypes();
  const fieldsData = useMemo(() => fieldsQ.data || null, [fieldsQ.data]);
  const itemsQ = useDobItemsPaged({ enabled: true, pageSize: 100, fields: fieldsData, filter: '' });
  const qc = useQueryClient();

  useEffect(() => {
    const reportLayout = () => {
      const shell = document.querySelector('[data-dob-shell]');
      const page = document.querySelector('[data-dob-page]');
      const grid = document.querySelector('.ag-root-wrapper');
      console.groupCollapsed('[DOB layout] #dob_requests');
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

  // ── 1) Область видимости сотрудника (DC / InitiatingDepartment) ────────────
  const scope = useMemo(
    () => buildRequestScope({
      office: userProfile?.userOffice,
      department: userProfile?.userDepartment,
      displayName: userProfile?.userDisplayName,
    }),
    [userProfile?.userOffice, userProfile?.userDepartment, userProfile?.userDisplayName],
  );

  const scoped = useMemo(
    () => applyRequestScope(rawRows, { fields, scope }),
    [rawRows, fields, scope],
  );
  const scopedRows = scoped.rows;

  const scopeNote = useMemo(() => {
    if (scope.mode === 'all') return scope.reason === 'в профиле нет Office' || scope.reason === 'в профиле нет Department' ? '' : 'Показаны все заявки (фильтр по подразделению не применяется)';
    if (scope.mode === 'office') return `Показаны заявки офиса ${scope.office}`;
    return `Показаны заявки: офис ${scope.office}, департамент ${scope.department}`;
  }, [scope]);

  // Отображаемые строки: после правила видимости. Фильтр по статусу («Открыт»)
  // и группировка по статусу задаются в самой таблице как стартовое состояние
  // AG Grid (initialFilterModel + rowGroup) — пользователь меняет их там же.
  const rows = scopedRows;

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
      scopeNote={scopeNote}
      scopeWarning={scoped.warning}
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
        <DobListAppBar onOpenDrawer={onOpenDrawer} tasksCount={tasksCount} />

        {scoped.warning && (
          <Alert severity="warning" data-testid="dob-scope-alert" sx={{ m: { xs: 1, sm: 2 }, mb: 0, borderRadius: 1.5 }}>
            {scoped.warning}
          </Alert>
        )}

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
          <DobGrid fields={fields} rows={rows} ctFieldNames={ctFieldNames} readOnly />
        </Box>
      </Box>
    </DobListStateProvider>
  );
}

DobTasksView.propTypes = {
  onOpenDrawer: PropTypes.func,
  tasksCount: PropTypes.number,
  // Профиль текущего пользователя: Office/Department — для фильтра по
  // подразделению, ФИО — для исключения (Поршаков Сергей).
  userProfile: PropTypes.shape({
    userOffice: PropTypes.string,
    userDepartment: PropTypes.string,
    userDisplayName: PropTypes.string,
  }),
};
