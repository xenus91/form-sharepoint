// src/features/tasks/components/TasksGrid.jsx
// AG Grid Community wrapper для табличного режима #tasks (multi-source).
//
// Поведение (по требованиям 2026-10-03):
//   • клик по строке — только ВЫДЕЛЯЕТ задачу (как в разделе «Заявки ДОБ»);
//   • кнопки «Взять в работу» и «Изменить» показываются НА САМОЙ СТРОКЕ
//     (в закреплённой справа колонке действий), когда строка выделена;
//   • двойной клик по строке — тоже открывает форму задачи;
//   • поля результата в таблице не показываются;
//   • «Кому назначено» = AssignedTo, «Исполнитель» = Editor (кто взял в работу).
//
// Сама таблица read-only: MERGE/PUT делает TasksView по колбэкам.

import { AgGridReact } from "ag-grid-react";
import { memo, useMemo, useRef, useEffect, useState } from "react";
import { Box, Button, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { themeQuartz, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { buildTaskColumns, TASK_GRID_DEFAULT_COL_DEF } from "../lib/taskTableColumns";

// Регистрируем все community-модули AG Grid (иначе AG Grid error #272
// "No AG Grid modules are registered" при первом рендере таблицы).
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Ячейка действий в закреплённой справа колонке: кнопки «Взять в работу» и
 * «Изменить» видны только у ВЫДЕЛЕННОЙ строки (клик по строке — выделение).
 *
 * Выделение спрашиваем у самой строки (`params.node.isSelected()`), а колбэки и
 * состояние берём из `params.context` — это тот же объект, что передан в
 * `context` у AgGridReact (AG Grid не копирует его, в отличие от
 * cellRendererParams, которые он deep-merge'ит и тем самым «замораживает»).
 */
const RowActionsCell = memo(function RowActionsCell(params) {
  const actions = params.context || {};
  const data = params.data;
  const isSelected = !!params.node?.isSelected?.();
  if (!data || !isSelected) return null;

  const canTake = typeof actions.canTakeRow === "function" && actions.canTakeRow(data);
  const busy = !!actions.takingId && actions.takingId === data.compositeId;

  const stop = (fn) => (event) => {
    // не даём клику по кнопке «дойти» до строки (выделение/двойной клик)
    event.stopPropagation();
    event.preventDefault();
    fn?.();
  };

  return (
    <Stack
      direction="row"
      spacing={0.5}
      className="tasks-row-actions"
      sx={{ alignItems: "center", justifyContent: "flex-end", width: "100%", height: "100%", pr: 0.5 }}
    >
      {canTake && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<PlayArrowIcon fontSize="small" />}
          disabled={busy}
          onMouseDown={stop()}
          onClick={stop(() => actions.onTakeRow?.(data))}
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            fontWeight: 700,
            minWidth: 0,
            px: 1,
            height: 28,
            fontSize: 12,
            borderColor: "rgba(23,28,143,0.35)",
            color: "#171c8f",
            bgcolor: "#fff",
            "&:hover": { borderColor: "#171c8f", bgcolor: "rgba(23,28,143,0.04)" },
          }}
        >
          Взять в работу
        </Button>
      )}
      <Button
        size="small"
        variant="contained"
        startIcon={<EditIcon fontSize="small" />}
        onMouseDown={stop()}
        onClick={stop(() => actions.onEditRow?.(data))}
        sx={{
          borderRadius: 1.5,
          textTransform: "none",
          fontWeight: 700,
          minWidth: 0,
          px: 1,
          height: 28,
          fontSize: 12,
          bgcolor: "#171c8f",
          color: "#fff",
          "&:hover": { bgcolor: "#10146a" },
        }}
      >
        Изменить
      </Button>
    </Stack>
  );
});

/**
 * @param {object} props
 * @param {Array<any>} props.rows — задачи с compositeId
 * @param {(compositeId:string|null) => void} [props.onSelectRow] — выделение строки
 * @param {(compositeId:string) => void} [props.onRowOpen] — открыть форму (двойной клик)
 * @param {(row:object) => void} [props.onEditRow] — «Изменить» на выделенной строке
 * @param {(row:object) => void} [props.onTakeRow] — «Взять в работу» на выделенной строке
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
  // Выделенная строка (compositeId) — кнопки действий видны только у неё.
  const [selectedId, setSelectedId] = useState(null);
  // Стабильная ссылка на колбэки/состояние для ячейки действий (см. RowActionsCell).
  // Колбэки/состояние для ячейки действий. Объект НЕ пересоздаём: он уходит в
  // `context` грида, а ячейка читает из него свежие значения при перерисовке.
  const actionsRef = useRef({ takingId: null, onEditRow: null, onTakeRow: null, canTakeRow: null });

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

  // Всегда актуальные значения для ячейки действий (объект не пересоздаём).
  actionsRef.current.takingId = takingId;
  actionsRef.current.onEditRow = onEditRow;
  actionsRef.current.onTakeRow = onTakeRow;
  actionsRef.current.canTakeRow = canTakeRow;

  const columnDefs = useMemo(() => {
    const cols = buildTaskColumns({ showSourceColumn: showSourceColumn || showDbg });
    // Колонка действий — закреплена справа, вне сортировки/фильтров/поиска.
    cols.push({
      colId: "rowActions",
      headerName: "",
      width: 232,
      minWidth: 210,
      pinned: "right",
      sortable: false,
      filter: false,
      floatingFilter: false,
      resizable: false,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      cellRenderer: RowActionsCell,
    });
    return cols;
  }, [showSourceColumn, showDbg]);

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
    setSelectedId(id);
    if (typeof onSelectRow === "function") onSelectRow(id);
  }, [onSelectRow]);

  const onRowDoubleClicked = useMemo(() => (event) => {
    if (typeof onRowOpen !== "function") return;
    // двойной клик по кнопкам действий не открывает форму
    const target = event?.event?.target;
    if (target && typeof target.closest === "function" && target.closest(".tasks-row-actions")) return;
    const id = event?.data?.compositeId;
    if (id) onRowOpen(id);
  }, [onRowOpen]);

  // При смене данных выделение живёт в AG Grid; если строк больше нет — сбрасываем.
  useEffect(() => {
    if (rows.length > 0) return;
    setSelectedId(null);
    if (typeof onSelectRow === "function") onSelectRow(null);
  }, [rows.length, onSelectRow]);

  // Кнопки действий живут в ячейке: после смены выделения (или начала взятия
  // в работу) перерисовываем ячейки — так кнопки появляются/исчезают на строке.
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    // force: ячейка перерисовывается, даже если её значение не изменилось —
    // иначе кнопки не появятся/не исчезнут на строке.
    api.refreshCells({ force: true });
  }, [selectedId, takingId]);

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
          context={actionsRef.current}
          onModelUpdated={onModelUpdated}
          onSelectionChanged={onSelectionChanged}
          onRowDoubleClicked={onRowDoubleClicked}
          suppressCellFocus
        />
      </Box>
    </Box>
  );
}
