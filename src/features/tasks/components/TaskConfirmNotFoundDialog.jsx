// src/features/tasks/components/TaskConfirmNotFoundDialog.jsx
// PR2 — диалог подтверждения результата (Behaviour.c=true).
// Тексты задаются в TaskBehaviour.Behaviour: ct (заголовок), cm (сообщение), ok (кнопка подтверждения), no (отмена).
// Скругления заданы в px, а не в единицах theme.shape.borderRadius (он = 28), иначе углы получаются огромными.
import React from "react";
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, CircularProgress } from "@mui/material";

// Текст задачи может прийти с HTML (например, из hash-режима) — показываем как простой текст.
function plain(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

const RADIUS_OUTER = "14px";
const RADIUS_INNER = "10px";

export default function TaskConfirmNotFoundDialog({
  confirmSx = null,
  cancelSx = null,
  confirmIcon = null,
  cancelIcon = null,
  confirmVariant = null,
  cancelVariant = null, open, onClose, pendingTask, pendingResult, updatingId, onConfirm, confirmTexts }) {
  const title = confirmTexts?.title || "Подтверждение";
  const message =
    confirmTexts?.message ||
    `Вы уверены, что хотите завершить задачу #${pendingTask?.Id} как «${pendingResult}»? Это действие нельзя отменить.`;
  const okText = confirmTexts?.okText || "Подтвердить";
  const cancelText = confirmTexts?.cancelText || "Отмена";
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: RADIUS_OUTER } }}>
      <DialogTitle sx={{ fontWeight: 800, borderRadius: `${RADIUS_OUTER} ${RADIUS_OUTER} 0 0` }}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {pendingTask?.Body && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(229,57,53,0.06)", borderRadius: RADIUS_INNER, border: "1px solid rgba(229,57,53,0.15)" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#b71c1c" }}>Текст задачи:</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.5 }}>{plain(pendingTask.Body)}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit" variant={cancelVariant || "text"} startIcon={cancelIcon || undefined} sx={{ borderRadius: RADIUS_INNER, fontWeight: 700, ...(cancelSx || {}) }} disabled={updatingId === pendingTask?.Id}>{cancelText}</Button>
        <Button onClick={() => { const task = pendingTask; const result = pendingResult; onClose?.(); if (task) onConfirm?.(task, result); }} variant={confirmVariant || "contained"} color="error" startIcon={confirmIcon || undefined} sx={{ borderRadius: RADIUS_INNER, fontWeight: 800, backgroundImage: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", ...(confirmSx || {}) }} disabled={updatingId === pendingTask?.Id}>
          {updatingId === pendingTask?.Id ? <CircularProgress size={20} sx={{ color: "white" }} /> : okText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
