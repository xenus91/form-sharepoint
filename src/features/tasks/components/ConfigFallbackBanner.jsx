// src/features/tasks/components/ConfigFallbackBanner.jsx
// ★ PR: показывается только когда оба SP-списка (TaskResultDefinitions и TaskPromptFields) вернули 404
// и используется локальный fallback на resultConfig.js. Видимость: ?configWarn=1 или ?dbg=1.
//
// В проде без флага banner не виден — только console.warn. Это чтобы не раздражать пользователей.

import React from "react";
import { Box, Typography } from "@mui/material";

function __bannerDbg() {
  try {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(location.search);
    if (sp.get("configWarn") === "1") return true;
    if (sp.get("dbg") === "1") return true;
    if (localStorage.getItem("dbg") === "1") return true;
    if (localStorage.getItem("dbg_tasks") === "1") return true;
    return false;
  } catch { return false; }
}

export default function ConfigFallbackBanner({ taskConfiguration }) {
  if (!__bannerDbg()) return null;
  const data = taskConfiguration?.data;
  if (!data) return null;

  // Показываем только когда ОБА списка вернули null (graceful 404)
  const resultDefsMissing = data.taskResultDefinitions === null;
  const promptFieldsMissing = data.taskPromptFields === null;
  if (!resultDefsMissing && !promptFieldsMissing) return null;

  return (
    <Box
      role="status"
      data-testid="config-fallback-banner"
      sx={{
        mb: 1,
        p: 1.25,
        borderRadius: 2,
        bgcolor: "rgba(255,152,0,0.10)",
        border: "1px solid rgba(255,152,0,0.30)",
        display: "flex",
        alignItems: "center",
        gap: 1,
        boxSizing: "border-box",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#fb8c00", flexShrink: 0 }} />
      <Typography variant="body2" sx={{ fontWeight: 700, color: "#a8500a", minWidth: 0, overflow: "hidden" }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
          ⚠ Конфигурация UI из SharePoint не загружена
          {resultDefsMissing && promptFieldsMissing
            ? " (TaskResultDefinitions + TaskPromptFields → 404)"
            : resultDefsMissing
            ? " (TaskResultDefinitions → 404)"
            : " (TaskPromptFields → 404)"}
          . Используется локальный fallback (resultConfig.js). Создайте списки в tenant для полной кастомизации.
        </span>
      </Typography>
    </Box>
  );
}