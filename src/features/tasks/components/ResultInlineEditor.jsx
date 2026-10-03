/* eslint-disable react/prop-types */
// src/features/tasks/components/ResultInlineEditor.jsx
//
// Инлайн-форма результата для ПОПАПА таблицы — 1:1 с карточкой (TaskCard):
//   • prompt-поля (Behaviour.p) с той же подписью/типом/обязательностью;
//   • блок доп. действий (Behaviour.aa / aar) — тем же компонентом AdditionalActionsField;
//   • кнопки: «Сохранить — <результат>» + «Отмена» (StylingActions.promptSubmit/promptCancel),
//     а для Behaviour.ic без полей — ok/no (confirm/cancel), как в карточке.
//
// Никаких диалогов: попап таблицы показывает форму в себе, ровно как карточка показывает
// её в себе. Сабмит уходит наверх тем же вызовом completeTask, что и из карточки.

import React from "react";
import { Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import AdditionalActionsField from "./AdditionalActionsField";

const CARD_SUBMIT_BASE_SX = {
  backgroundImage: "linear-gradient(180deg, #43a047 0%, #2e7d32 100%)",
  color: "#fff",
  "&:hover": { backgroundImage: "linear-gradient(180deg, #66bb6a 0%, #388e3c 100%)" },
};

export default function ResultInlineEditor({
  result = "",
  fields = [],
  showAdditionalActions = false,
  aaFieldInternalName = "AdditionalActions",
  aaChoices = [],
  aaAllowFillIn = true,
  aaInitial = [],
  icMode = false,
  okLabel = "",
  noLabel = "Отмена",
  // Стили кнопки отправки: база (для ic — цвет самой кнопки результата) + StylingActions
  baseSubmitSx = null,
  submitSx = null,
  submitVariant = null,
  submitIcon = null,
  cancelSx = null,
  cancelVariant = null,
  cancelIcon = null,
  submitting = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = React.useState({});
  const [acts, setActs] = React.useState(() => (Array.isArray(aaInitial) ? [...aaInitial] : []));
  const [error, setError] = React.useState("");

  const validate = () => {
    const missing = fields.filter((f) => f.required && !String(values[f.internalName] || "").trim());
    if (missing.length > 0) {
      setError(`Заполните обязательные поля: ${missing.map((m) => m.title).join(", ")}`);
      return false;
    }
    setError("");
    return true;
  };

  const submit = () => {
    if (!validate()) return;
    const req = showAdditionalActions ? (acts.length > 0 ? "Да" : "Нет") : null;
    onSubmit?.({ ...values }, req, showAdditionalActions ? [...acts] : []);
  };

  const submitLabel = icMode ? (okLabel || "Подтвердить") : `Сохранить — ${result}`;

  return (
    <Box sx={{ px: 0.5, pb: 0.5 }} data-testid="tasks-row-result-editor">
      <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "#171c8f", fontSize: "0.72rem", mb: 0.5 }}>
        {icMode ? result : `Результат: ${result}`}
      </Typography>
      <Stack spacing={0.75}>
        {fields.map((f, idx) => (
          <TextField
            key={f.internalName}
            label={f.title || f.internalName}
            placeholder={f.title || f.internalName}
            value={values[f.internalName] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.internalName]: e.target.value }))}
            size="small"
            fullWidth
            multiline={f.type === "multiline"}
            minRows={f.type === "multiline" ? 2 : undefined}
            maxRows={f.type === "multiline" ? 4 : undefined}
            disabled={submitting}
            autoFocus={idx === 0}
            required={!!f.required}
            error={Boolean(error && f.required && !String(values[f.internalName] || "").trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && f.type !== "multiline") {
                e.preventDefault();
                submit();
              }
            }}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#fff", fontSize: "0.9rem" },
              "& .MuiInputLabel-root": { fontSize: "0.85rem" },
            }}
          />
        ))}
        {showAdditionalActions && (
          <Box sx={{ width: "100%", borderRadius: "10px", backgroundColor: "#F1F3F4", p: "3px" }}>
            <AdditionalActionsField
              fieldInternalName={aaFieldInternalName}
              required={false}
              choices={aaChoices.map((v) => (typeof v === "string" ? { value: v, label: v } : v))}
              allowFillIn={aaAllowFillIn}
              value={acts}
              onChange={(next) => { setActs(next); if (error) setError(""); }}
              error={error && showAdditionalActions && acts.length === 0 ? error : ""}
              disabled={submitting}
            />
          </Box>
        )}
        {showAdditionalActions && acts.length > 0 && !error && (
          <Typography variant="caption" color="text.secondary">Выбрано: {acts.length}</Typography>
        )}
        {error && !showAdditionalActions && (
          <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600 }}>{error}</Typography>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, pt: 0.5 }}>
          <Button
            fullWidth
            size="small"
            variant={submitVariant || (icMode ? "contained" : "contained")}
            startIcon={submitIcon || undefined}
            disabled={submitting}
            onClick={submit}
            sx={{
              borderRadius: "7px",
              fontWeight: 800,
              textTransform: "none",
              minHeight: 34,
              ...(icMode ? (baseSubmitSx || {}) : CARD_SUBMIT_BASE_SX),
              ...(submitSx || {}),
            }}
          >
            {submitting ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : submitLabel}
          </Button>
          <Button
            fullWidth
            size="small"
            variant={cancelVariant || "text"}
            startIcon={cancelIcon || undefined}
            disabled={submitting}
            onClick={() => onCancel?.()}
            sx={{
              borderRadius: "7px",
              fontWeight: 700,
              textTransform: "none",
              minHeight: 30,
              color: "text.secondary",
              ...(cancelSx || {}),
            }}
          >
            {noLabel}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
