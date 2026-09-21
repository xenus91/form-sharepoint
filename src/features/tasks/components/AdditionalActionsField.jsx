// src/features/tasks/components/AdditionalActionsField.jsx
// Универсальный компонент — §19 плана. Не знает Search/Picking/Video, только {fieldInternalName, choices, value, onChange}

import React from "react";
import { Autocomplete, TextField, Chip, Box, Typography } from "@mui/material";

/**
 * @param {object} props
 * @param {string} props.fieldInternalName
 * @param {boolean} props.required
 * @param {Array<{value:string,label:string}>} props.choices
 * @param {boolean} props.allowFillIn
 * @param {string[]} props.value
 * @param {(next:string[])=>void} props.onChange
 * @param {string} props.error
 * @param {boolean} props.disabled
 */
export default function AdditionalActionsField({ fieldInternalName, required, choices = [], allowFillIn = true, value = [], onChange, error = "", disabled = false }) {
  const normalizedChoices = React.useMemo(() => choices.map((c) => (typeof c === "string" ? { value: c, label: c } : c)), [choices]);

  const handleChange = (_e, next) => {
    // next — array of strings or objects — нормализуем к string[]
    const arr = (next || []).map((v) => (typeof v === "string" ? v : v.value || v.label || String(v))).map((s) => String(s).trim()).filter(Boolean);
    // dedup
    const uniq = [...new Set(arr)];
    onChange?.(uniq);
  };

  if (!required && (!value || value.length === 0)) {
    // §18: если required=false — контрол полностью отсутствует. Но если есть значение (старая Task) — показываем.
    // Для required=false и пусто — не рендерим (вызывается из TaskCard условно)
    // Оставим пустой Box для совместимости, но родитель должен скрывать.
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
        Дополнительные действия {required ? "" : "(необязательно)"} — {fieldInternalName}
      </Typography>
      <Autocomplete
        multiple
        freeSolo={allowFillIn}
        options={normalizedChoices.map((c) => c.value)}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => {
            const { key, ...rest } = getTagProps({ index });
            return <Chip key={key} label={option} size="small" {...rest} />;
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={value.length === 0 ? "Выберите из списка или введите своё" : "Добавить ещё..."}
            error={!!error}
            helperText={error}
            variant="outlined"
            size="small"
          />
        )}
      />
      {value.length > 0 && !error && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>
          Выбрано: {value.length}
        </Typography>
      )}
    </Box>
  );
}
