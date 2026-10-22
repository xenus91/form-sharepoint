// src/features/tasks/components/AdditionalActionsField.jsx
// Универсальный компонент — §19 плана. Не знает Search/Picking/Video, только {fieldInternalName, choices, value, onChange}
// Fix 2026-09-24: нормальные названия в автокомплите — показываем Title (label), храним Title (value==label для совместимости). Поддерживает Default из TaskActionDefinitions.

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

  // Maps for normal names: value (Title) <-> label (Title) — for new data value==label, for legacy ActionId we map value->label
  const valueToLabel = React.useMemo(() => {
    const m = new Map();
    normalizedChoices.forEach((c) => {
      // if same value repeated, keep first label
      if (!m.has(c.value)) m.set(c.value, c.label);
      // also map label->label for convenience (if value is Title, label same, but custom fill-in may be label)
      if (!m.has(c.label)) m.set(c.label, c.label);
    });
    return m;
  }, [normalizedChoices]);

  const labelToValue = React.useMemo(() => {
    const m = new Map();
    normalizedChoices.forEach((c) => {
      if (!m.has(c.label)) m.set(c.label, c.value);
      if (!m.has(c.value)) m.set(c.value, c.value);
    });
    return m;
  }, [normalizedChoices]);

  const handleChange = (_e, next) => {
    // next — array of strings or objects — нормализуем к string[] (храним value, которое для Title==label)
    const arr = (next || []).map((v) => {
      if (typeof v === "string") {
        // v may be label typed or selected — map label->value, fallback to raw string (custom fill-in)
        const trimmed = String(v).trim();
        if (!trimmed) return "";
        // If user typed custom not in map, keep as is
        return labelToValue.get(trimmed) || trimmed;
      }
      // object from options
      return v.value || v.label || String(v);
    }).map((s) => String(s).trim()).filter(Boolean);
    // dedup case-insensitive but keep original case of first occurrence
    const seen = new Set();
    const uniq = [];
    for (const s of arr) {
      const k = s.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniq.push(s);
      }
    }
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
        Дополнительные действия {required ? "" : "(необязательно)"}
      </Typography>
      <Autocomplete
        multiple
        freeSolo={allowFillIn}
        options={normalizedChoices}
        getOptionLabel={(option) => (typeof option === "string" ? option : option.label || option.value || String(option))}
        isOptionEqualToValue={(option, val) => {
          const optVal = typeof option === "string" ? option : option.value || option.label;
          const valStr = typeof val === "string" ? val : val.value || val.label || String(val);
          return String(optVal).toLowerCase() === String(valStr).toLowerCase();
        }}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => {
            const { key, ...rest } = getTagProps({ index });
            const raw = typeof option === "string" ? option : option.value || option.label || String(option);
            const label = valueToLabel.get(raw) || raw;
            return <Chip key={key} label={label} size="small" {...rest} />;
          })
        }
        renderOption={(props, option) => {
          const label = typeof option === "string" ? option : option.label || option.value;
          return (
            <li {...props} key={String(typeof option === "string" ? option : option.value)}>
              {label}
            </li>
          );
        }}
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
