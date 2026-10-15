// src/features/dob/components/DobListAppBar.jsx
// Шапка #dob_requests.
//
// Что здесь есть (требования 2026-10-15):
//   * фильтры: статус и тип заявки (мультивыбор, пусто = все);
//   * переключатель группировки таблицы по статусу;
//   * «Создать заявку», «Открыть» (заявка открывается только на просмотр) и
//     «Обновить».
//
// Правки заявок в шапке больше нет: кнопки «Изменить»/«Сбросить»/«Сохранить»
// и накопление dirty-строк убраны — заявки в этом разделе не редактируются.
import PropTypes from 'prop-types';
import {
  AppBar, Toolbar, Box, Button, Chip, Tooltip, CircularProgress, Typography,
  Autocomplete, TextField, FormControlLabel, Switch,
} from '@mui/material';
import BurgerWithCount from '../../navigation/BurgerWithCount';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddIcon from '@mui/icons-material/Add';
import { buildDobCreateHash } from '../lib/dobRoute';
import { useDobListState } from '../state/DobListStateContext';

const OUTLINED_SX = {
  borderRadius: 1.5,
  textTransform: 'none',
  fontWeight: 600,
  borderColor: '#cdd2e3',
  color: '#1f2347',
  backgroundImage: 'none',
  bgcolor: '#ffffff',
  '&:hover': { borderColor: '#171c8f', bgcolor: '#f4f6ff', backgroundImage: 'none' },
  '&.Mui-disabled': { borderColor: '#e6e9f5', color: '#9aa0b4', bgcolor: '#fafbff' },
};

const FILTER_SX = { width: { xs: 170, sm: 210 }, '& .MuiInputBase-root': { minHeight: 32 } };

export default function DobListAppBar({ onOpenDrawer, tasksCount = 0 }) {
  const state = useDobListState();
  const {
    rows,
    selectedId,
    handleRefresh,
    openItem,
    statusOptions = [],
    statusFilter = [],
    setStatusFilter,
    ctOptions = [],
    ctFilter = [],
    setCtFilter,
    groupByStatus = true,
    setGroupByStatus,
    scopeNote = '',
    scopeWarning = '',
  } = state;

  const totalRows = rows?.length ?? 0;

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        zIndex: 1200,
        bgcolor: '#ffffff',
        color: '#1f2347',
        borderBottom: '1px solid #e6e9f5',
        backgroundImage: 'none',
      }}
    >
      <Toolbar
        variant="dense"
        sx={{
          minHeight: { xs: 56, sm: 60 },
          px: { xs: 1.5, sm: 2 },
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <BurgerWithCount onClick={onOpenDrawer} count={tasksCount} buttonSx={{ color: '#1f2347' }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.1, color: '#1f2347' }}>
            Заявки ДОБ
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`${totalRows} записей`}
              sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#f4f6ff', color: '#1f2347' }}
            />
            {scopeNote && (
              <Tooltip title={scopeNote}>
                <Chip
                  size="small"
                  label="Мои заявки"
                  data-testid="dob-scope-chip"
                  sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#eef1ff', color: '#171c8f' }}
                />
              </Tooltip>
            )}
            {scopeWarning && (
              <Tooltip title={scopeWarning}>
                <Chip
                  size="small"
                  color="warning"
                  label="Фильтр по подразделению не применён"
                  data-testid="dob-scope-warning"
                  sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
                />
              </Tooltip>
            )}
            {selectedId && (
              <Chip
                size="small"
                label={`Выбран: ${selectedId}`}
                sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#171c8f', color: '#ffffff' }}
              />
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1 }} />

        <Autocomplete
          multiple
          size="small"
          disableCloseOnSelect
          options={statusOptions}
          value={statusFilter.filter((s) => statusOptions.includes(s))}
          onChange={(_e, next) => setStatusFilter?.(next)}
          sx={FILTER_SX}
          data-testid="dob-filter-status"
          limitTags={1}
          renderInput={(params) => (
            <TextField {...params} label="Статус" placeholder={statusFilter.length ? '' : 'Все статусы'} />
          )}
        />

        <Autocomplete
          multiple
          size="small"
          disableCloseOnSelect
          options={ctOptions}
          getOptionLabel={(option) => option?.label || ''}
          isOptionEqualToValue={(a, b) => String(a?.id) === String(b?.id)}
          value={ctOptions.filter((option) => ctFilter.includes(option.id))}
          onChange={(_e, next) => setCtFilter?.(next.map((option) => option.id))}
          sx={{ ...FILTER_SX, width: { xs: 190, sm: 250 } }}
          data-testid="dob-filter-ct"
          limitTags={1}
          renderInput={(params) => (
            <TextField {...params} label="Тип заявки" placeholder={ctFilter.length ? '' : 'Все типы'} />
          )}
        />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={!!groupByStatus}
              onChange={(e) => setGroupByStatus?.(e.target.checked)}
              inputProps={{ 'data-testid': 'dob-group-toggle' }}
            />
          }
          label={
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1f2347', whiteSpace: 'nowrap' }}>
              Группы по статусу
            </Typography>
          }
          sx={{ mr: 0, ml: 0.5 }}
        />

        <Tooltip title="Создать заявку: выбор типа контента, затем поля этого типа">
          <Button
            size="small"
            variant="outlined"
            onClick={() => { window.location.hash = buildDobCreateHash(); }}
            startIcon={<AddIcon />}
            data-testid="request-create-open"
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
          >
            Создать заявку
          </Button>
        </Tooltip>

        <Tooltip title="Открыть выбранную заявку (только просмотр — заявки здесь не редактируются)">
          <span>
            <Button
              size="small"
              variant="contained"
              disabled={!selectedId}
              onClick={() => openItem(selectedId)}
              startIcon={<VisibilityIcon />}
              data-testid="dob-open-item"
              sx={{
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                color: '#ffffff',
                backgroundImage: 'none',
                bgcolor: '#171c8f',
                '&:hover': { bgcolor: '#10146a', backgroundImage: 'none' },
                '&.Mui-disabled': { bgcolor: '#e6e9f5', color: '#9aa0b4' },
              }}
            >
              Открыть
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Перезагрузить данные списка">
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={handleRefresh}
              disabled={state.loading || state.isFetching}
              startIcon={
                state.isFetching ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />
              }
              sx={OUTLINED_SX}
            >
              Обновить
            </Button>
          </span>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

DobListAppBar.propTypes = {
  onOpenDrawer: PropTypes.func,
  // Активные задачи — чип на бургере (число приходит из useActiveTasksCount в App).
  tasksCount: PropTypes.number,
};
