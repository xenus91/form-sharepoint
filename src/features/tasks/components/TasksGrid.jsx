// src/features/tasks/components/TasksGrid.jsx
// Read-only AG Grid Community wrapper для табличного режима #tasks.
// План: см. artifacts/plan.md (этап 7).
//
// Не использует DobListStateContext — полностью read-only. Не делает MERGE/PUT.
// Универсален: получает rows (уже смерженные или нет) и fields (per-source).
//
// Клик по строке → вызывает onRowClick(compositeId), выше — переход в карточку.

import { AgGridReact } from "ag-grid-react";
import { useMemo, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { themeQuartz, ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Регистрируем все community-модули AG Grid (иначе AG Grid error #272
// "No AG Grid modules are registered" при первом рендере таблицы).
ModuleRegistry.registerModules([AllCommunityModule]);

const STATUS_BG = {
  "В работе": "#e3f2fd",
  "Завершена": "#e8f5e9",
  "Отменена": "#ffebee",
  "На паузе": "#fff8e1",
};

function statusCellStyle(params) {
  const v = params.value;
  const bg = STATUS_BG[v];
  if (!bg) return null;
  return {
    backgroundColor: bg,
    color: "rgba(0,0,0,0.87)",
    fontWeight: 500,
  };
}

function formatDate(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (_e) {
    void _e;
    return String(value);
  }
}

/**
 * @param {object} props
 * @param {Array<any>} props.rows — задачи с compositeId
 * @param {Array<{InternalName:string,Title:string,TypeAsString:string}>} [props.fields]
 * @param {string[]} [props.resultFieldInternalNames=[]]
 * @param {(compositeId:string) => void} [props.onRowClick]
 * @param {boolean} [props.showSourceColumn=false] — показать колонку "Сайт" (под ?dbg=1)
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 */
export default function TasksGrid({
  rows = [],
  fields = [],
  resultFieldInternalNames = [],
  onRowClick,
  showSourceColumn = false,
  loading = false,
  error = null,
}) {
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

  const columnDefs = useMemo(() => {
    const cols = [];
    cols.push({
      headerName: "Id",
      field: "Id",
      width: 80,
      pinned: "left",
      sortable: true,
    });
    cols.push({
      headerName: "Заголовок",
      field: "Title",
      flex: 2,
      minWidth: 220,
      sortable: true,
    });
    cols.push({
      headerName: "Статус",
      field: "Status",
      width: 130,
      sortable: true,
      cellStyle: statusCellStyle,
    });
    cols.push({
      headerName: "Исполнитель",
      valueGetter: (p) => p.data?.AssignedTo?.Title || "",
      width: 160,
      sortable: true,
    });
    cols.push({
      headerName: "Срок",
      field: "DueDate",
      width: 120,
      sortable: true,
      valueFormatter: (p) => formatDate(p.value),
    });
    cols.push({
      headerName: "Изменён",
      field: "Modified",
      width: 130,
      sortable: true,
      valueFormatter: (p) => formatDate(p.value),
    });
    // ResultSearchTHU (динамический — может отличаться на разных сайтах)
    if (resultFieldInternalNames && resultFieldInternalNames.length > 0) {
      for (const fn of resultFieldInternalNames) {
        cols.push({
          headerName: fn,
          field: fn,
          width: 140,
          sortable: true,
        });
      }
    }
    if (showSourceColumn || showDbg) {
      cols.push({
        headerName: "Сайт",
        field: "sourceId",
        width: 110,
        sortable: true,
      });
    }
    return cols;
  }, [resultFieldInternalNames, showSourceColumn, showDbg]);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    suppressMovable: true,
  }), []);

  const getRowId = useMemo(() => (params) => params.data?.compositeId ?? String(params.data?.Id ?? Math.random()), []);

  const onRowClicked = useMemo(() => (event) => {
    if (typeof onRowClick !== "function") return;
    const id = event?.data?.compositeId;
    if (id) onRowClick(id);
  }, [onRowClick]);

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
        width: "100%",
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
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={getRowId}
        onRowClicked={onRowClicked}
        rowSelection={undefined}
        animateRows={false}
        suppressCellFocus
        domLayout="autoHeight"
      />
    </Box>
  );
}