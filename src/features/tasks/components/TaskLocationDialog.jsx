// src/features/tasks/components/TaskLocationDialog.jsx
// PR2 — вынос диалога "Где найдена" из TasksView (без смены бизнес-логики)
import React from "react";
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField, CircularProgress } from "@mui/material";
import { resolveTaskResultDefinition } from "../../../services/taskResultDefinitions";
import { ADDITIONAL_ACTIONS_STANDARD } from "../../../tasks/config";
import AdditionalActionsField from "./AdditionalActionsField";

export default function TaskLocationDialog({
  open,
  onClose,
  pendingTask,
  pendingResult,
  locationComment,
  setLocationComment,
  pendingAdditionalActions,
  setPendingAdditionalActions,
  pendingAdditionalError,
  setPendingAdditionalError,
  pendingCustomAction,
  setPendingCustomAction,
  updatingId,
  taskConfiguration,
  // Behaviour.aa для текущего результата: true/false — решает правило,
  // null/undefined — нет правила (legacy-поведение по определениям результатов).
  showAdditionalActions = null,
  onSubmit,
}) {
  const handleSubmit = (skip) => onSubmit?.(skip);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "14px" } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Где найдена ЕО?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Укажите местоположение, где была найдена ЕО для задачи #{pendingTask?.Id}. Вы можете пропустить этот шаг.
        </DialogContentText>
        <TextField
          autoFocus
          label="Местоположение (Location1)"
          placeholder="Например: Зона отгрузки, ряд 5, ячейка 12"
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          value={locationComment}
          onChange={(e) => setLocationComment(e.target.value)}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
        />
        {(() => {
          const ctForDialog = String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim();
          const defForDialog = taskConfiguration?.data?.taskResultDefinitions ? resolveTaskResultDefinition(pendingResult, ctForDialog, taskConfiguration.data.taskResultDefinitions) : null;
          // ⭐ v8+: если правило Behaviour есть, доп. действия включаются ТОЛЬКО его aa: true
          // (как в карточке). Legacy-определения результатов — лишь когда правила нет вовсе.
          const showForDialog = showAdditionalActions === true
            ? true
            : showAdditionalActions === false
              ? false
              : (defForDialog ? !!defForDialog.showAdditionalActions : true);
          if (!showForDialog) return null;
          return (
            <Box sx={{ width: "100%", mt: 2 }}>
              <Box sx={{ position: "relative", width: "100%", borderRadius: "14px", backgroundColor: "#F1F3F4", overflow: "visible", p: "3px", "&:has(.Mui-expanded)": { borderRadius: "14px 14px 0 0" } }}>
                <AdditionalActionsField
                  fieldInternalName={taskConfiguration?.data?.ctConfigMap?.get(String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim())?.additionalActionsField?.internalName || "AdditionalActions"}
                  required={pendingAdditionalActions.length > 0}
                  choices={(taskConfiguration?.data?.ctConfigMap?.get(String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim())?.additionalActionsField?.choices || ADDITIONAL_ACTIONS_STANDARD).map((v) => (typeof v === "string" ? { value: v, label: v } : v))}
                  allowFillIn={taskConfiguration?.data?.ctConfigMap?.get(String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim())?.additionalActionsField?.allowFillIn ?? true}
                  value={pendingAdditionalActions}
                  onChange={(next) => {
                    setPendingAdditionalActions(next);
                    if (pendingAdditionalError) setPendingAdditionalError("");
                    if (pendingCustomAction) setPendingCustomAction("");
                  }}
                  error={pendingAdditionalError}
                  disabled={updatingId === pendingTask?.Id}
                />
              </Box>
              {pendingAdditionalError && <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 0.75 }}>{pendingAdditionalError}</Typography>}
              {pendingAdditionalActions.length > 0 && !pendingAdditionalError && <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>Выбрано: {pendingAdditionalActions.length}</Typography>}
            </Box>
          );
        })()}
        {pendingAdditionalError && pendingAdditionalActions.length === 0 && <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 1 }}>{pendingAdditionalError}</Typography>}
        {pendingTask?.Body && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(23,28,143,0.06)", borderRadius: "10px" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#171c8f" }}>Текст задачи:</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.5 }}>{pendingTask.Body}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={() => handleSubmit(true)} color="inherit" sx={{ borderRadius: "10px", fontWeight: 700 }} disabled={updatingId === pendingTask?.Id}>Пропустить</Button>
        <Button onClick={() => handleSubmit(false)} variant="contained" sx={{ borderRadius: "10px", fontWeight: 700, backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)" }} disabled={updatingId === pendingTask?.Id}>
          {updatingId === pendingTask?.Id ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Отправить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
