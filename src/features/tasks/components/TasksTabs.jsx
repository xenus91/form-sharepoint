// src/features/tasks/components/TasksTabs.jsx
// PR2 — вкладки Активные/Выполненные (вынесена из TasksView без смены визуала)
import React from "react";
import { Paper, Tabs, Tab } from "@mui/material";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

export default function TasksTabs({ tab, onChange, activeCount, archivedCount, completedCount, hashMode, isTabPending }) {
  if (hashMode) return null;
  const active = activeCount ?? 0;
  const completed = archivedCount ?? completedCount ?? 0;
  return (
    <Paper sx={{ borderRadius: "28px", overflow: "hidden", mb: 1.5, height: 56, minHeight: 56, maxHeight: 56, display: "flex", alignItems: "stretch", width: "100%", minWidth: 0, flexShrink: 0, alignSelf: "stretch", boxSizing: "border-box", flex: "0 0 auto", boxShadow: "0 2px 8px rgba(23,28,143,0.06)" }}>
      <Tabs
        value={tab}
        onChange={(_, v) => onChange(v)}
        variant="fullWidth"
        textColor="primary"
        indicatorColor="primary"
        sx={{
          height: 56,
          minHeight: 56,
          maxHeight: 56,
          width: "100%",
          minWidth: 0,
          flex: 1,
          "& .MuiTabs-flexContainer": { height: 56, minHeight: 56, alignItems: "stretch", width: "100%", display: "flex", flexWrap: "nowrap" },
          "& .MuiTabs-scroller": { height: 56, width: "100%", minWidth: 0, flex: "1 1 auto", overflow: "hidden !important" },
          "& .MuiTab-root": { fontWeight: 700, textTransform: "none", minHeight: 56, height: 56, maxHeight: 56, flex: "1 1 0", minWidth: 0, maxWidth: "50%", width: "50%", fontSize: "0.92rem", px: 1 },
          "& .MuiTab-iconWrapper": { marginRight: 1 },
          "& .MuiTabs-indicator": { height: 3 },
        }}
      >
        <Tab icon={<HourglassEmptyIcon />} iconPosition="start" label={`Активные (${active})`} sx={{ opacity: isTabPending && tab !== 0 ? 0.6 : 1, flex: 1, minWidth: 0 }} />
        <Tab icon={<CheckCircleOutlineIcon />} iconPosition="start" label={`Завершенные (${completed})`} sx={{ opacity: isTabPending && tab !== 1 ? 0.6 : 1, flex: 1, minWidth: 0 }} />
      </Tabs>
    </Paper>
  );
}
