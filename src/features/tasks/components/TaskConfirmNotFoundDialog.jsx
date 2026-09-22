// src/features/tasks/components/TaskConfirmNotFoundDialog.jsx
// PR2 — диалог подтверждения "Не найдена"
import React from "react";
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, CircularProgress } from "@mui/material";

export default function TaskConfirmNotFoundDialog({ open, onClose, pendingTask, pendingResult, updatingId, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Подтверждение</DialogTitle>
      <DialogContent>
        <DialogContentText>Вы уверены, что хотите завершить задачу #{pendingTask?.Id} как «{pendingResult}»? Это действие нельзя отменить.</DialogContentText>
        {pendingTask?.Body && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(229,57,53,0.06)", borderRadius: 2, border: "1px solid rgba(229,57,53,0.15)" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#b71c1c" }}>Текст задачи:</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.5 }}>{pendingTask.Body}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit" sx={{ borderRadius: 2, fontWeight: 700 }} disabled={updatingId === pendingTask?.Id}>Отмена</Button>
        <Button onClick={() => { const task = pendingTask; const result = pendingResult; onClose?.(); if (task) onConfirm?.(task, result); }} variant="contained" color="error" sx={{ borderRadius: 2, fontWeight: 800, backgroundImage: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)" }} disabled={updatingId === pendingTask?.Id}>
          {updatingId === pendingTask?.Id ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Подтвердить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
