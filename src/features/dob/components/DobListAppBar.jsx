// src/features/dob/components/DobListAppBar.jsx
// Sticky header for #dob_tasks — holds the title and the four action
// buttons (Изменить / Обновить / Сбросить / Сохранить) that used to live
// above the grid. Reads its state from the DobListStateContext.
import PropTypes from 'prop-types';
import { AppBar, Toolbar, Box, Button, Chip, IconButton, Tooltip, CircularProgress, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import { useDobListState } from '../state/DobListStateContext';

export default function DobListAppBar({ onOpenDrawer }) {
  const state = useDobListState();
  const {
    rows,
    dirty,
    saving,
    selectedId,
    handleSave,
    handleRevert,
    handleRefresh,
    openEdit,
  } = state;

  const dirtyCount = dirty.size;
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
        <IconButton
          onClick={onOpenDrawer}
          size="small"
          sx={{ color: '#1f2347' }}
          aria-label="Открыть меню"
        >
          <MenuIcon />
        </IconButton>

        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.1, color: '#1f2347' }}>
            Заявки ДОБ
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`${totalRows} записей`}
              sx={{
                height: 20,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: '#f4f6ff',
                color: '#1f2347',
              }}
            />
            {dirtyCount > 0 && (
              <Chip
                size="small"
                color="warning"
                label={`Изменено: ${dirtyCount}`}
                sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
              />
            )}
            {selectedId && (
              <Chip
                size="small"
                label={`Выбран: ${selectedId}`}
                sx={{
                  height: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  bgcolor: '#171c8f',
                  color: '#ffffff',
                }}
              />
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Открыть форму редактирования выбранной строки">
          <span>
            <Button
              size="small"
              variant="contained"
              disabled={!selectedId}
              onClick={() => openEdit(selectedId)}
              startIcon={<EditIcon />}
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
              Изменить
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
                state.isFetching ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <RefreshIcon />
                )
              }
              sx={{
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#cdd2e3',
                color: '#1f2347',
                backgroundImage: 'none',
                bgcolor: '#ffffff',
                '&:hover': { borderColor: '#171c8f', bgcolor: '#f4f6ff', backgroundImage: 'none' },
                '&.Mui-disabled': { borderColor: '#e6e9f5', color: '#9aa0b4', bgcolor: '#fafbff' },
              }}
            >
              Обновить
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Отменить локальные изменения и перезагрузить">
          <span>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={handleRevert}
              disabled={dirtyCount === 0 || saving}
              sx={{
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: '#cdd2e3',
                color: '#1f2347',
                backgroundImage: 'none',
                bgcolor: '#ffffff',
                '&:hover': { borderColor: '#171c8f', bgcolor: '#f4f6ff', backgroundImage: 'none' },
                '&.Mui-disabled': { borderColor: '#e6e9f5', color: '#9aa0b4', bgcolor: '#fafbff' },
              }}
            >
              Сбросить
            </Button>
          </span>
        </Tooltip>

        <Tooltip
          title={
            dirtyCount === 0
              ? 'Нет несохранённых правок'
              : `Отправить ${dirtyCount} изменений в SharePoint (MERGE)`
          }
        >
          <span>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={dirtyCount === 0 || saving}
              startIcon={
                saving ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <SaveIcon />
                )
              }
              sx={{
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 700,
                minWidth: 140,
                color: '#ffffff',
                backgroundImage: 'none',
                bgcolor: '#171c8f',
                '&:hover': { bgcolor: '#10146a', backgroundImage: 'none' },
                '&.Mui-disabled': { bgcolor: '#e6e9f5', color: '#9aa0b4' },
              }}
            >
              {saving ? 'Сохранение…' : `Сохранить${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </Button>
          </span>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

DobListAppBar.propTypes = {
  onOpenDrawer: PropTypes.func,
};