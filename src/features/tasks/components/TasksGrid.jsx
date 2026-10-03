/* eslint-disable react/prop-types */
// src/features/tasks/components/TasksGrid.jsx
// AG Grid Community wrapper для табличного режима #tasks (multi-source).
//
// Поведение (по требованиям 2026-10-03):
//   • клик по строке — только ВЫДЕЛЯЕТ задачу (как в разделе «Заявки ДОБ»);
//   • действия по задаче открываются В ТОЧКЕ КЛИКА по строке (popup у курсора),
//     и в нём — ВЕСЬ набор действий, который есть у карточки задачи
//     («Взять в работу», кнопки результатов, «Изменить»);
//   • двойной клик по строке — открывает форму задачи;
//   • поля результата в таблице не показываются;
//   • «Кому назначено» = AssignedTo, «Исполнитель» = Editor (кто взял в работу).
//
// Сама таблица read-only: MERGE/PUT делает TasksView по колбэкам.

import { AgGridReact } from "ag-grid-react";
import { memo, useMemo, useRef, useEffect, useState } from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { themeQuartz, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { buildTaskColumns, TASK_GRID_DEFAULT_COL_DEF } from "../lib/taskTableColumns";

// Регистрируем все community-модули AG Grid (иначе AG Grid error #272
// "No AG Grid modules are registered" при первом рендере таблицы).
ModuleRegistry.registerModules([AllCommunityModule]);

/** Иконки действий: строковый ключ из описания действия → MUI-иконка. */
const ACTION_ICONS = {
  take: <PlayArrowIcon fontSize="small" />,
  edit: <EditIcon fontSize="small" />,
  result: <TaskAltIcon fontSize="small" />,
};

/**
 * Popup с действиями по задаче — открывается В ТОЧКЕ КЛИКА по строке.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {{top:number,left:number}|null} props.anchorPosition — координаты клика (viewport)
 * @param {object|null} props.row
 * @param {Array<{key:string,label:string,icon?:any,variant?:string,color?:string,sx?:object,disabled?:boolean,hint?:string,onClick?:Function}>} props.actions
 * @param {() => void} props.onClose
 */
const RowActionsPopover = memo(function RowActionsPopover({ open, anchorPosition, row, actions, onClose }) {
  const list = Array.isArray(actions) ? actions : [];
  return (
    <Popover
      open={!!open && !!anchorPosition && !!row}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition || undefined}
      onClose={onClose}
      marginThreshold={12}
      disableAutoFocus
      disableRestoreFocus
      slotProps={{
        paper: {
          className: "tasks-row-actions",
          "data-testid": "tasks-row-actions",
          elevation: 6,
          sx: {
            // Аккуратные скругления: в теме shape.borderRadius = 28 (карточки),
            // но для компактного меню такие углы выглядели «гигантскими».
            borderRadius: "10px",
            border: "1px solid rgba(23,28,143,0.14)",
            boxShadow: "0 8px 22px rgba(15,18,61,0.16)",
            p: 0.75,
            minWidth: 224,
            maxWidth: 320,
            overflow: "visible",
          },
        },
      }}
    >
      <Box sx={{ px: 0.5, pt: 0.25, pb: 0.5 }}>
        <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "#171c8f", fontSize: "0.72rem" }}>
          Задача #{row?.Id}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.7rem", lineHeight: 1.3 }}>
          {row?.Status || "—"}
          {row?.AssignedTo ? ` • ${row.AssignedTo}` : ""}
        </Typography>
      </Box>
      <Divider sx={{ mb: 0.5 }} />
      <Stack spacing={0.5} data-testid="tasks-row-actions-list">
        {list.map((action) => action.kind === "info" ? (
          <Box
            key={action.key}
            sx={{
              px: 0.75,
              py: 0.5,
              borderRadius: 1.5,
              bgcolor: "rgba(255,193,7,0.12)",
              border: "1px solid rgba(255,193,7,0.3)",
            }}
          >
            <Typography variant="caption" sx={{ display: "block", fontWeight: 700, color: "#8d6e00" }}>
              {action.label}
            </Typography>
            {action.hint && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {action.hint}
              </Typography>
            )}
          </Box>
        ) : (
          <Button
            key={action.key}
            fullWidth
            size="small"
            variant={action.variant || "outlined"}
            color={action.color || "primary"}
            startIcon={typeof action.icon === "string" ? ACTION_ICONS[action.icon] || null : action.icon || null}
            disabled={!!action.disabled}
            title={action.hint || undefined}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onClose?.();
              action.onClick?.();
            }}
            sx={{
              justifyContent: "flex-start",
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "7px",
              minHeight: 32,
              fontSize: 12.5,
              px: 1.25,
              ...(action.sx || {}),
            }}
          >
            {action.label}
          </Button>
        ))}
        {list.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 0.75, py: 0.5 }}>
            Нет доступных действий
          </Typography>
        )}
      </Stack>
    </Popover>
  );
});

/**
 * @param {object} props
 * @param {Array<any>} props.rows — задачи с compositeId
 * @param {(compositeId:string|null) => void} [props.onSelectRow] — выделение строки
 * @param {(compositeId:string) => void} [props.onRowOpen] — открыть форму (двойной клик)
 * @param {(row:object) => Array<object>} [props.getRowActions] — полный набор действий
 *        по задаче (как в карточке). Если не передан — собирается из legacy-пропов ниже.
 * @param {(row:object) => void} [props.onEditRow] — «Изменить» (legacy-фолбэк)
 * @param {(row:object) => void} [props.onTakeRow] — «Взять в работу» (legacy-фолбэк)
 * @param {(row:object) => boolean} [props.canTakeRow] — можно ли взять строку в работу
 * @param {string|null} [props.takingId] — compositeId строки, которая берётся в работу
 * @param {boolean} [props.showSourceColumn=false] — колонка источника (debug)
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 *
 * Поиск: одно поле над таблицей ищет по ВСЕМ колонкам сразу (AG Grid quick filter).
 * Строк фильтров под каждым заголовком (floating filter) нет — по требованию 2026-10-03.
 */
export default function TasksGrid({
  rows = [],
  onSelectRow,
  onRowOpen,
  getRowActions,
  onEditRow,
  onTakeRow,
  canTakeRow,
  takingId = null,
  showSourceColumn = false,
  loading = false,
  error = null,
}) {
  const gridRef = useRef(null);
  // Общий поиск по всем полям таблицы (AG Grid quick filter).
  const [quickFilter, setQuickFilter] = useState("");
  // Сколько строк осталось после поиска/фильтров — показываем рядом с полем.
  const [shownCount, setShownCount] = useState(null);
  // Popup действий: строка + координаты клика (viewport coordinates).
  const [menuRow, setMenuRow] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const showDbg = useMemo(() => {
    try {
      if (typeof window === "undefined") return false;
      const url = new URLSearchParams(location.search);
      if (url.get("dbg") === "1") return true;
      if (localStorage.getItem("dbg") === "1") return true;
      if (localStorage.getItem("dbg_tasks") === "1") return true;
    } catch (_e) { void _e; }
    return false;
  }, []);

  const columnDefs = useMemo(
    () => buildTaskColumns({ showSourceColumn: showSourceColumn || showDbg }),
    [showSourceColumn, showDbg]
  );

  const defaultColDef = useMemo(() => ({ ...TASK_GRID_DEFAULT_COL_DEF }), []);

  const getRowId = useMemo(() => (params) => params.data?.compositeId ?? String(params.data?.Id ?? Math.random()), []);

  const gridOptions = useMemo(() => ({
    animateRows: false,
    // Клик по строке — выделение (переход в форму отдельным действием).
    rowSelection: { mode: "singleRow", enableClickSelection: true, checkboxes: false },
    suppressMenuHide: true,
    // Шапка закреплена, строки скроллятся внутри грида: убираем autoHeight,
    // иначе таблица растёт целиком и шапка уезжает вместе со скроллом страницы.
    domLayout: "normal",
    headerHeight: 44,
  }), []);

  const closeActions = useMemo(() => () => { setMenuRow(null); setMenuAnchor(null); }, []);

  // Полный набор действий строки: приоритет — getRowActions (TasksView собирает
  // его из тех же данных, что и карточка); иначе — legacy-фолбэк «Взять / Изменить».
  const actionsForRow = useMemo(() => (row) => {
    if (!row) return [];
    if (typeof getRowActions === "function") {
      try {
        const list = getRowActions(row);
        if (Array.isArray(list)) return list;
      } catch (_e) { void _e; /* показываем legacy-набор */ }
    }
    const fallback = [];
    const canTake = typeof canTakeRow === "function" && canTakeRow(row);
    if (canTake) {
      fallback.push({
        key: "take",
        label: "Взять в работу",
        icon: "take",
        variant: "outlined",
        disabled: !!takingId && takingId === row.compositeId,
        onClick: () => onTakeRow?.(row),
      });
    }
    fallback.push({
      key: "edit",
      label: "Изменить",
      icon: "edit",
      variant: "contained",
      onClick: () => onEditRow?.(row),
    });
    return fallback;
  }, [getRowActions, canTakeRow, takingId, onTakeRow, onEditRow]);

  // Пересчёт счётчика строк при любом изменении модели (поиск/фильтр/данные).
  const onModelUpdated = useMemo(() => (event) => {
    const api = event?.api || gridRef.current?.api;
    const count = api?.getDisplayedRowCount?.();
    setShownCount(typeof count === "number" ? count : null);
  }, []);

  const onSelectionChanged = useMemo(() => () => {
    const api = gridRef.current?.api;
    const selected = api?.getSelectedNodes?.() || [];
    const id = selected.length > 0 ? (selected[0].data?.compositeId ?? null) : null;
    if (typeof onSelectRow === "function") onSelectRow(id);
  }, [onSelectRow]);

  // Клик по строке: выделение + popup действий В ТОЧКЕ КЛИКА.
  const onCellClicked = useMemo(() => (event) => {
    const row = event?.data;
    if (!row) return;
    const native = event?.event;
    let left = Number(native?.clientX);
    let top = Number(native?.clientY);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      // Фолбэк (например, клик пришёл из кода): берём позицию ячейки.
      const rect = event?.event?.target?.getBoundingClientRect?.();
      left = rect ? rect.left + Math.min(24, rect.width / 2) : 0;
      top = rect ? rect.top + rect.height : 0;
    }
    setMenuRow(row);
    setMenuAnchor({ top, left });
  }, []);

  const onRowDoubleClicked = useMemo(() => (event) => {
    if (typeof onRowOpen !== "function") return;
    const id = event?.data?.compositeId;
    if (id) onRowOpen(id);
  }, [onRowOpen]);

  // При смене данных выделение живёт в AG Grid; если строк больше нет — сбрасываем.
  useEffect(() => {
    if (rows.length > 0) return;
    closeActions();
    if (typeof onSelectRow === "function") onSelectRow(null);
  }, [rows.length, onSelectRow, closeActions]);

  // Строка могла исчезнуть из данных (обновился источник) — закрываем popup.
  useEffect(() => {
    if (!menuRow) return;
    const stillThere = (rows || []).some((r) => r && r.compositeId === menuRow.compositeId);
    if (!stillThere) closeActions();
  }, [rows, menuRow, closeActions]);

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">Загрузка…</Typography>
      </Box>
    );
  }
  if (error && rows.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="error">{String(error)}</Typography>
      </Box>
    );
  }

  return (
    <Box
      className="ag-theme-quartz"
      sx={{
        height: "100%",
        minHeight: 320,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        // Минимальные стили — основная тема в themeQuartz
        ["--ag-font-family"]: "Roboto, Arial, sans-serif",
        ["--ag-font-size"]: "13px",
        ["--ag-row-hover-color"]: "#f5f7fa",
        ["--ag-selected-row-background-color"]: "#e3f2fd",
        ["--ag-odd-row-background-color"]: "#fcfcfd",
        ["--ag-header-background-color"]: "#fafbfc",
        ["--ag-border-color"]: "#e0e0e0",
        ["--ag-cell-horizontal-border"]: "1px solid #f0f0f0",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1, width: "100%" }}>
        <TextField
          size="small"
          fullWidth
          value={quickFilter}
          onChange={(e) => setQuickFilter(e.target.value)}
          placeholder="Поиск по всем полям: заголовок, описание, статус, исполнитель…"
          inputProps={{ "data-testid": "tasks-grid-search", "aria-label": "Поиск по всем полям" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: quickFilter ? (
              <InputAdornment position="end">
                <Tooltip title="Очистить поиск">
                  <IconButton size="small" aria-label="Очистить поиск" onClick={() => setQuickFilter("")}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : null,
          }}
          sx={{ "& .MuiInputBase-root": { height: 36, borderRadius: 0.5, fontSize: 13 } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {shownCount === null ? "" : `Найдено: ${shownCount} из ${rows.length}`}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, width: "100%" }}>
        <AgGridReact
          ref={gridRef}
          theme={themeQuartz}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          gridOptions={gridOptions}
          quickFilterText={quickFilter}
          onModelUpdated={onModelUpdated}
          onSelectionChanged={onSelectionChanged}
          onCellClicked={onCellClicked}
          onRowDoubleClicked={onRowDoubleClicked}
          // При прокрутке строк координата клика «уезжает» — закрываем меню.
          onBodyScroll={closeActions}
          suppressCellFocus
        />
      </Box>
      <RowActionsPopover
        open={!!menuRow}
        anchorPosition={menuAnchor}
        row={menuRow}
        actions={menuRow ? actionsForRow(menuRow) : []}
        onClose={closeActions}
      />
    </Box>
  );
}
