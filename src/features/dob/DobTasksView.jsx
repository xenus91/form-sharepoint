// src/features/dob/DobTasksView.jsx
// Page for hash #dob_tasks — AG Grid editable over /sites/dob/doblogistic list 64DB263C...
import React, { useMemo } from 'react';
import { Box, Paper, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useDobFields } from './hooks/useDobFields';
import { useDobItemsPaged } from './hooks/useDobItems';
import DobGrid from './components/DobGrid';
import { useQueryClient } from '@tanstack/react-query';

export default function DobTasksView() {
  const fieldsQ = useDobFields(true);
  const fieldsData = fieldsQ.data || null;
  // Фильтр только Открытые — вычисляемое поле Статус (Title 'Статус', InternalName типа _x0421__x0442__x0430__x0442__x04...)
  const statusFilter = React.useMemo(() => {
    if (!fieldsData || !fieldsData.length) return '';
    const f = fieldsData.find(x => x.Title === 'Статус' || x.Title?.toLowerCase() === 'статус' || x.InternalName?.toLowerCase().includes('_x0421__x0442__x0430__x0442__x04'));
    const internal = f?.InternalName;
    if (!internal) return '';
    // OData eq 'Открыт' — для Calculated поля с типом Text
    return `${internal} eq 'Открыт'`;
  }, [fieldsData]);
  const itemsQ = useDobItemsPaged({ enabled: true, pageSize: 100, fields: fieldsData, filter: statusFilter });
  const qc = useQueryClient();

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

  const fields = fieldsData || [];
  const rows = itemsQ.data || [];

  return (
    <Box sx={{ p:{xs:1, sm:2}, maxWidth: 1600, mx:'auto', width:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', height:'calc(100vh - 8px)', minHeight:'calc(100vh - 8px)' }}>
      <Paper sx={{ p:1.5, mb:1.5, borderRadius:'16px', border:'1px solid rgba(23,28,143,0.12)', background:'rgba(255,255,255,0.9)' }}>
        <Typography variant="h6" sx={{ fontWeight:800, color:'#171c8f' }}>Заявки ДОБ</Typography>
        <Typography variant="caption" color="text.secondary">
          Источник: <code>/sites/dob/doblogistic</code> — список <code>64DB263C-2ED6-4FD5-8760-AE5E3E4A331C</code> · редактирование inline (AG Grid) · сохранение MERGE по кнопке · вычисляемые поля только для чтения
        </Typography>
        {(fieldsQ.isFetching || itemsQ.isFetching) && <Typography variant="caption" color="text.secondary" sx={{ ml:1 }}>· обновление…</Typography>}
        {itemsQ.isError && <Alert severity="warning" sx={{ mt:1, borderRadius:2 }}>{String(itemsQ.error?.message||'Ошибка загрузки данных').slice(0,300)} <Button size="small" onClick={handleRefresh}>Повторить</Button></Alert>}
      </Paper>
      <Box sx={{ flex:1, minHeight: 520, display:'flex' }}>
        <DobGrid fields={fields} rows={rows} loading={itemsQ.isLoading} isFetching={itemsQ.isFetching} onRefresh={handleRefresh} />
      </Box>
    </Box>
  );
}
