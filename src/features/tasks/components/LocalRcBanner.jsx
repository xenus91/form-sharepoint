// src/features/tasks/components/LocalRcBanner.jsx
// PR2 — баннер локального РЦ вынесен без смены логики
import React from "react";
import { Box, Typography, Button } from "@mui/material";

export default function LocalRcBanner({ isLocalRcActive, localRcValue, localRcOffice, onClearLocalRc }) {
  if (!isLocalRcActive || !localRcValue) return null;
  return (
    <Box sx={{ mb: 1, p: 1.25, borderRadius: 2, bgcolor: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.30)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, boxSizing: "border-box", overflow: "hidden", flexShrink: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: "#8d6e00", display: "flex", alignItems: "center", gap: 1, minWidth: 0, overflow: "hidden" }}>
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#f9a825", flexShrink: 0 }} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Локальный РЦ: {localRcValue} <span style={{ fontWeight: 400, color: "rgba(0,0,0,0.55)" }}>(для {localRcOffice})</span></span>
      </Typography>
      <Button size="small" variant="text" onClick={onClearLocalRc} sx={{ fontWeight: 700, textTransform: "none", color: "#8d6e00", flexShrink: 0, whiteSpace: "nowrap" }}>Сбросить</Button>
    </Box>
  );
}
