// src/features/tasks/components/TasksGrid.jsx
// AG Grid Community wrapper для табличного режима #tasks (multi-source).
//
// Поведение (по требованиям 2026-10-03):
//   • клик по строке — только ВЫДЕЛЯЕТ задачу (как в разделе «Заявки ДОБ»);
//   • переход в форму редактирования — кнопкой «Изменить» или двойным кликом
//     (для задачи dob форма та же, что dob_tasks/[id], но по списку источника);
//   • поля результата в таблице не показываются;
//   • «Кому назначено» = AssignedTo, «Исполнитель» = Editor (кто взял в работу),
//     с фолбэком на AssignedTo.
//
// Полностью read-only: не делает MERGE/PUT.

import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useEffect, useState } from "react";
import { Box, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { themeQuartz, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { buildTaskColumns, TASK_GRID_DEFAULT_COL_DEF } from "../lib/taskTableColumns";

// Регистрируем все community-модули AG Grid (иначе AG Grid error #272
// "No AG Grid modules are registered" при первом рендере таблицы).
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * @param {object} props
 * @param {Array<any>} props.rows — задачи с compositeId
 * @param {(compositeId:string|null) => void} [props.onSelectRow] — выделение строки
 * @param {(compositeId:string) => void} [props.onRowOpen] — открыть форму (двойной клик)
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
  showSourceColumn = false,
  loading = false,
  error = null,
}) {
  const gridRef = useRef(null);
  // Общий поиск по всем полям таблицы (AG Grid quick filter).
  const [quickFilter, setQuickFilter] = useState("");
  // Сколько строк осталось после поиска/фильтров — показываем рядом с полем.
  const [shownCount, setShownCount] = useState(null);

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
    [showSourceColumn, showDbg],
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

  // Пересчёт счётчика строк при любом изменении модели (поиск/фильтр/данные).
  const onModelUpdated = useMemo(() => (event) => {
    const api = event?.api || gridRef.current?.api;
    const count = api?.getDisplayedRowCount?.();
    setShownCount(typeof count === "number" ? count : null);
  }, []);

  const onSelectionChanged = useMemo(() => () => {
    if (typeof onSelectRow !== "function") return;
    const api = gridRef.current?.api;
    const selected = api?.getSelectedNodes?.() || [];
    onSelectRow(selected.length > 0 ? (selected[0].data?.compositeId ?? null) : null);
  }, [onSelectRow]);

  const onRowDoubleClicked = useMemo(() => (event) => {
    if (typeof onRowOpen !== "function") return;
    const id = event?.data?.compositeId;
    if (id) onRowOpen(id);
  }, [onRowOpen]);

  // При смене данных выделение живёт в AG Grid; если строк больше нет — сбрасываем.
  useEffect(() => {
    if (rows.length > 0) return;
    if (typeof onSelectRow === "function") onSelectRow(null);
  }, [rows.length, onSelectRow]);

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
          onRowDoubleClicked={onRowDoubleClicked}
          suppressCellFocus
        />
      </Box>
    </Box>
  );
}
