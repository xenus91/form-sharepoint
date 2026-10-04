// src/features/tasks/components/ContentTypeResultDialog.jsx
// Диалог закрытия задачи: форма строится ИСКЛЮЧИТЕЛЬНО по типу контента и типам
// колонок SharePoint (см. tasks/contentTypeFields.js).
//
//   • DobSearchResult (и любой «Результирующий выбор») — кнопки результата;
//   • DescriptionCheckResult (Note) — рич-текст (RichEditor), обязательность из SP;
//   • ErrorTypeValidation (Choice) — автокомплит с подстановкой своего значения;
//   • ErrorCountValidation (Number) — числовое поле «Кол-во ошибок»;
//   • Guilty (Пользователь или группа) — автокомплит по учётной записи,
//     многократный выбор, подпись «Имя — Должность».
//
// Обязательные поля (Required=true в SharePoint) не дают отправить форму:
// показываем список того, что нужно заполнить. Значения уходят в completeTask
// (Result + поля типа контента + Status/PercentComplete=1).

/* eslint-disable react/prop-types */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Autocomplete, Box, Checkbox, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography,
} from "@mui/material";
import RichEditor from "../../dob/components/RichEditor";
import PersonFieldAutocomplete from "./PersonFieldAutocomplete";
import {
  buildContentTypeForm,
  fetchContentTypeFields,
  plainText,
  validateRequiredFields,
} from "../../../tasks/contentTypeFields";

function readTaskValue(task, internal) {
  if (!task || !internal) return undefined;
  // Карточка/строка несут исходный элемент SharePoint в raw — поля типа контента
  // (DescriptionCheckResult, Guilty и т.п.) легче всего достать оттуда.
  const sources = [task, task.raw];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    if (source[internal] !== undefined) return source[internal];
    if (source[`OData__${internal}`] !== undefined) return source[`OData__${internal}`];
  }
  return undefined;
}

function asUserList(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw.results) ? raw.results : [raw]);
  return list
    .map((u) => {
      if (!u) return null;
      if (typeof u === "object") {
        const id = Number(u.Id ?? u.ID);
        return {
          Id: Number.isFinite(id) ? id : undefined,
          Title: String(u.Title || u.Name || "").trim(),
          LoginName: String(u.LoginName || "").trim(),
          Email: String(u.Email || u.EMail || "").trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

const toISODate = (value) => {
  if (!value) return "";
  try {
    if (typeof value === "string" && value.startsWith("/Date(")) {
      const ms = Number(String(value).replace(/[^0-9]/g, ""));
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toISOString().slice(0, 10);
  } catch (_e) {
    void _e;
    return "";
  }
};

export default function ContentTypeResultDialog({
  open = false,
  task = null,
  contentTypeId = "",
  contentTypeName = "",
  resultFieldInternalName = "",
  resultChoices = [],
  initialResult = "",
  confirmTexts = null,
  submitLabel = "",
  cancelLabel = "",
  submitting = false,
  onSubmit,
  onClose,
  // inline: та же форма, но не в модальном окне — её показывает форма ДОБ
  // (страница #dob_tasks/<id>), чтобы задача «Результат проверки ООБ» закрывалась
  // кнопками результата прямо на экране задачи.
  inline = false,
}) {
  const [result, setResult] = React.useState(initialResult || "");
  const [values, setValues] = React.useState({});
  const [problems, setProblems] = React.useState([]);
  const [touched, setTouched] = React.useState(false);

  const fieldsQ = useQuery({
    queryKey: ["ct-fields", contentTypeId],
    queryFn: () => fetchContentTypeFields(contentTypeId),
    enabled: Boolean((open || inline) && contentTypeId),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const form = React.useMemo(
    () => buildContentTypeForm(fieldsQ.data || [], {
      resultFieldInternalNames: resultFieldInternalName ? [resultFieldInternalName] : [],
    }),
    [fieldsQ.data, resultFieldInternalName],
  );

  // Инициализация значений из задачи + результата из Behaviour/карточки
  React.useEffect(() => {
    if (!open && !inline) return;
    const next = {};
    for (const control of form.controls) {
      const raw = readTaskValue(task, control.internalName);
      if (control.kind === "person") next[control.internalName] = asUserList(raw);
      else if (control.kind === "boolean") next[control.internalName] = raw === true || raw === 1 || String(raw).toLowerCase() === "true";
      else if (control.kind === "number") next[control.internalName] = raw === undefined || raw === null ? "" : String(raw);
      else if (control.kind === "date") next[control.internalName] = toISODate(raw);
      else next[control.internalName] = raw === undefined || raw === null ? "" : String(raw);
    }
    setValues(next);
    setProblems([]);
    setTouched(false);
  }, [open, inline, task, form.controls]);

  React.useEffect(() => {
    if (open || inline) setResult(initialResult || "");
  }, [open, inline, initialResult]);

  const choices = React.useMemo(() => {
    const list = (Array.isArray(resultChoices) ? resultChoices : []).map((c) => String(c)).filter(Boolean);
    if (list.length > 0) return list;
    return form.resultBlock?.choices || [];
  }, [resultChoices, form.resultBlock]);

  const setValue = (internal, value) => {
    setValues((prev) => ({ ...prev, [internal]: value }));
    if (touched && problems.length > 0) setProblems([]);
  };

  const handleSubmit = () => {
    setTouched(true);
    const found = validateRequiredFields(form.controls, values, form.resultBlock, result);
    if (!result) found.unshift("Выберите результат проверки");
    if (found.length > 0) {
      setProblems(found);
      return;
    }
    const payload = {};
    for (const control of form.controls) {
      const value = values[control.internalName];
      if (control.kind === "person") {
        const list = asUserList(value).filter((u) => u.Id != null);
        if (list.length > 0 || (control.required && list.length === 0)) {
          payload[control.internalName] = { __userIds: list.map((u) => u.Id), __userMulti: control.multiple };
        }
        continue;
      }
      if (control.kind === "boolean") {
        payload[control.internalName] = value === true;
        continue;
      }
      if (control.kind === "number") {
        const text = String(value ?? "").trim();
        if (text === "") {
          if (control.required) payload[control.internalName] = null;
          continue;
        }
        const num = Number(text.replace(",", "."));
        payload[control.internalName] = Number.isFinite(num) ? num : text;
        continue;
      }
      const text = String(value ?? "");
      if (text.trim() === "" && !control.required) continue;
      payload[control.internalName] = text;
    }
    // resultField — имя колонки результата (нужно форме ДОБ, чтобы записать MERGE)
    onSubmit?.({ result, values: payload, resultField: form.resultBlock?.internalName || resultFieldInternalName || "" });
  };

  const title = confirmTexts?.title || `Закрытие задачи #${task?.Id ?? ""}`.trim();
  const message = confirmTexts?.message || "";

  const Wrapper = inline ? Paper : Dialog;
  const wrapperProps = inline
    ? {
      elevation: 0,
      "data-testid": "ct-result-dialog",
      sx: { borderRadius: "14px", border: "1px solid rgba(23,28,143,0.12)", background: "#fff" },
    }
    : {
      open,
      onClose: submitting ? undefined : onClose,
      fullWidth: true,
      maxWidth: "md",
      PaperProps: { sx: { borderRadius: "14px" }, "data-testid": "ct-result-dialog" },
    };

  return (
    <Wrapper {...wrapperProps}>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
        {title}
        {contentTypeName && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 500 }}>
            {contentTypeName}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {message && (
          <Typography variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>{message}</Typography>
        )}
        {fieldsQ.isLoading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">Загружаю поля типа контента…</Typography>
          </Box>
        )}
        {fieldsQ.isError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            Не удалось получить поля типа контента — форма построена по частичным данным.
          </Alert>
        )}

        {!fieldsQ.isLoading && (
          <Stack spacing={1.5}>
            {choices.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 700 }}>
                  {form.resultBlock?.title || "Результат"}
                  {form.resultBlock?.required ? " *" : ""}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {choices.map((choice) => {
                    const active = choice === result;
                    return (
                      <Button
                        key={choice}
                        size="small"
                        variant={active ? "contained" : "outlined"}
                        disabled={submitting}
                        onClick={() => { setResult(choice); if (problems.length) setProblems([]); }}
                        sx={{
                          borderRadius: "8px",
                          textTransform: "none",
                          fontWeight: 700,
                          ...(active ? { backgroundColor: "#171c8f", color: "#fff", "&:hover": { backgroundColor: "#2a31a8" } } : {}),
                        }}
                      >
                        {choice}
                      </Button>
                    );
                  })}
                </Box>
              </Box>
            )}

            {form.controls.map((control) => {
              const value = values[control.internalName];
              const invalid = touched && control.required
                && (value === undefined || value === null || String(value).trim() === ""
                  || (control.kind === "richtext" && plainText(value).length === 0)
                  || (Array.isArray(value) && value.length === 0));
              const helper = control.description || (invalid ? "Обязательное поле" : "");
              const common = { key: control.internalName, size: "small", fullWidth: true, disabled: submitting };

              if (control.kind === "richtext") {
                return (
                  <Box key={control.internalName}>
                    <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 700, color: invalid ? "#c62828" : "text.primary" }}>
                      {control.title}{control.required ? " *" : ""}
                    </Typography>
                    <RichEditor
                      value={value || ""}
                      readOnly={submitting}
                      onChange={(html) => setValue(control.internalName, html)}
                    />
                    {control.description && (
                      <Typography variant="caption" color="text.secondary">{control.description}</Typography>
                    )}
                    {invalid && (
                      <Typography variant="caption" sx={{ display: "block", color: "#c62828", fontWeight: 600 }}>
                        Обязательное поле
                      </Typography>
                    )}
                  </Box>
                );
              }

              if (control.kind === "person") {
                return (
                  <PersonFieldAutocomplete
                    key={control.internalName}
                    label={control.title}
                    value={value || []}
                    onChange={(next) => setValue(control.internalName, next)}
                    multiple={control.multiple !== false}
                    required={control.required}
                    disabled={submitting}
                    error={Boolean(invalid)}
                    helperText={helper}
                  />
                );
              }

              // Поле выбора без свободного ввода — настоящий select (как в форме ДОБ).
              if (control.kind === "select") {
                return (
                  <TextField
                    key={control.internalName}
                    select
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    value={value || ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                  >
                    <MenuItem value=""><em>— не выбрано —</em></MenuItem>
                    {(control.choices || []).map((choice) => (
                      <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                    ))}
                  </TextField>
                );
              }

              // Многократный выбор: с FillInChoice — автокомплит (можно ввести своё),
              // без — select с множественным выбором.
              if (control.kind === "multichoice") {
                const selected = Array.isArray(value)
                  ? value
                  : (value === null || value === undefined || value === ""
                    ? []
                    : String(value).split(";#").map((v) => v.trim()).filter(Boolean));
                if (control.allowFillIn === true) {
                  return (
                    <Autocomplete
                      key={control.internalName}
                      multiple
                      freeSolo
                      disableCloseOnSelect
                      disabled={submitting}
                      options={control.choices || []}
                      value={selected}
                      onChange={(_e, next) => setValue(
                        control.internalName,
                        (Array.isArray(next) ? next : []).map((v) => String(v)).filter(Boolean),
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={`${control.title}${control.required ? " *" : ""}`}
                          error={Boolean(invalid)}
                          helperText={helper}
                          size="small"
                          fullWidth
                        />
                      )}
                    />
                  );
                }
                return (
                  <TextField
                    key={control.internalName}
                    select
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    value={selected}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                    SelectProps={{ multiple: true, renderValue: (sel) => (Array.isArray(sel) ? sel : []).join(", ") }}
                  >
                    {(control.choices || []).map((choice) => (
                      <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                    ))}
                  </TextField>
                );
              }

              if (control.kind === "autocomplete" || control.kind === "choice") {
                const freeSolo = control.kind === "autocomplete" && control.allowFillIn !== false;
                return (
                  <Autocomplete
                    key={control.internalName}
                    freeSolo={freeSolo}
                    multiple={control.multiple === true}
                    disabled={submitting}
                    options={control.choices}
                    value={control.multiple ? (Array.isArray(value) ? value : []) : (value || "")}
                    onChange={(_e, next) => setValue(control.internalName, next)}
                    onInputChange={freeSolo ? (_e, next, reason) => { if (reason === "input" && typeof value === "string") setValue(control.internalName, next); } : undefined}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={`${control.title}${control.required ? " *" : ""}`}
                        error={Boolean(invalid)}
                        helperText={helper}
                        size="small"
                        fullWidth
                      />
                    )}
                  />
                );
              }

              if (control.kind === "number") {
                return (
                  <TextField
                    key={control.internalName}
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    type="number"
                    value={value ?? ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                  />
                );
              }

              if (control.kind === "date") {
                return (
                  <TextField
                    key={control.internalName}
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    type="date"
                    value={value || ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                    InputLabelProps={{ shrink: true }}
                  />
                );
              }

              if (control.kind === "boolean") {
                return (
                  <FormControlLabel
                    key={control.internalName}
                    control={(
                      <Checkbox
                        checked={value === true}
                        disabled={submitting}
                        onChange={(e) => setValue(control.internalName, e.target.checked)}
                      />
                    )}
                    label={`${control.title}${control.required ? " *" : ""}`}
                  />
                );
              }

              if (control.kind === "multiline") {
                return (
                  <TextField
                    key={control.internalName}
                    {...common}
                    label={`${control.title}${control.required ? " *" : ""}`}
                    multiline
                    minRows={2}
                    maxRows={6}
                    value={value || ""}
                    onChange={(e) => setValue(control.internalName, e.target.value)}
                    error={Boolean(invalid)}
                    helperText={helper}
                  />
                );
              }

              return (
                <TextField
                  key={control.internalName}
                  {...common}
                  label={`${control.title}${control.required ? " *" : ""}`}
                  value={value || ""}
                  onChange={(e) => setValue(control.internalName, e.target.value)}
                  error={Boolean(invalid)}
                  helperText={helper}
                />
              );
            })}

            {form.controls.length === 0 && !fieldsQ.isLoading && (
              <Alert severity="info">
                В типе контента нет полей, доступных для заполнения — выберите результат и сохраните.
              </Alert>
            )}

            {problems.length > 0 && (
              <Alert severity="warning" data-testid="ct-result-dialog-problems">
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                  Заполните обязательные поля (настроены в SharePoint):
                </Typography>
                {problems.map((p) => (
                  <Typography key={p} variant="body2">• {p}</Typography>
                ))}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {form.required.map((c) => (
                <Chip
                  key={c.internalName}
                  size="small"
                  variant="outlined"
                  label={`${c.title} *`}
                  sx={{ borderRadius: "6px", fontSize: "0.7rem" }}
                />
              ))}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={submitting} variant="outlined" sx={{ borderRadius: "8px", textTransform: "none" }}>
          {cancelLabel || "Отмена"}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || fieldsQ.isLoading}
          variant="contained"
          startIcon={submitting ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : null}
          sx={{
            borderRadius: "8px",
            textTransform: "none",
            fontWeight: 800,
            backgroundColor: "#2e7d32",
            "&:hover": { backgroundColor: "#388e3c" },
          }}
        >
          {submitLabel || "Сохранить"}
        </Button>
      </DialogActions>
    </Wrapper>
  );
}
