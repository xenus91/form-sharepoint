// src/features/tasks/components/TasksGroupingToggle.jsx
// PR2 — тумблер группировки ТК (вынесен без смены визуала, точный стиль оригинала)
import React from "react";
import { Box, Typography } from "@mui/material";

export default function TasksGroupingToggle({ groupingEnabled, onToggle, countGroups, isHashMode, tab }) {
  if (isHashMode || tab !== 0) return null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, minHeight: 32, height: 32, width: "100%", flexShrink: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>Группировка по ТК</Typography>
        <Box
          onClick={() => onToggle(!groupingEnabled)}
          sx={{
            width: 44,
            height: 24,
            borderRadius: 12,
            bgcolor: groupingEnabled ? "#171c8f" : "rgba(0,0,0,0.2)",
            position: "relative",
            cursor: "pointer",
            transition: "background 150ms",
            flexShrink: 0,
          }}
        >
          <Box sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: "white", position: "absolute", top: 3, left: groupingEnabled ? 23 : 3, transition: "left 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
        </Box>
      </Box>
    </Box>
  );
}
