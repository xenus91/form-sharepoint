// src/features/tasks/components/TasksHeader.jsx
// PR2 — UI декомпозиция TasksView: шапка с заголовком, кнопкой назад (hash) и обновлением
import React from "react";
import { Box, Typography, Button, IconButton, Tooltip } from "@mui/material";
import AssignmentIcon from "@mui/icons-material/Assignment";
import RefreshIcon from "@mui/icons-material/Refresh";

export default function TasksHeader({ isHashMode, elementIdParam, onClearElementHash, onRefresh, loading }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, mt: 0, pl: { xs: 6, sm: 6 } }}>
      <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 800, color: "#171c8f" }}>
        <AssignmentIcon /> {isHashMode ? `Элемент #${elementIdParam}` : "Задачи"}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isHashMode && (
          <Button size="small" variant="outlined" onClick={() => onClearElementHash?.()} sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: "none" }}>
            ← К списку
          </Button>
        )}
        <Tooltip title="Обновить">
          <span>
            <IconButton onClick={onRefresh} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
