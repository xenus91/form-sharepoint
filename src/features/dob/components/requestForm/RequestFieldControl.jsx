/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/RequestFieldControl.jsx
// Один контрол формы заявки. Вид контрола — из метаданных SharePoint
// (controlKindOf в tasks/contentTypeFields.js), поэтому форма строится по типу
// контента, а не хардкодом полей.
import {
  Autocomplete, Box, Checkbox, FormControlLabel, MenuItem, TextField, ToggleButton, ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { RESULT_TOGGLE_GROUP_SX } from "../../lib/formStyles";
import RichEditor from "../RichEditor";
import PersonFieldAutocomplete from "../../../tasks/components/PersonFieldAutocomplete";

export default function RequestFieldControl({ control, value, onChange, invalid = false, readOnly = false, isUploading = false }) {
  const { internalName, title, kind, required, choices = [], multiple = false } = control;
  // Подпись поля = Description (см. requestFieldLabel). Тот же текст идёт
  // подсказкой в пустом поле — «Placeholder такой же, как название».
  const common = {
    fullWidth: true,
    size: "small",
    label: title,
    placeholder: title,
    required: !!required,
    error: !!invalid,
    helperText: invalid ? "Обязательное поле" : "",
    inputProps: { "data-testid": `request-field-${internalName}` },
    disabled: readOnly,
  };

  if (kind === "person") {
    return (
      <PersonFieldAutocomplete
        label={title}
        placeholder={title}
        value={value ?? (multiple ? [] : null)}
        onChange={(next) => onChange?.(next)}
        multiple={multiple !== false}
        required={!!required}
        invalid={!!invalid}
      />
    );
  }

  if (kind === "richtext") {
    return (
      <Box>
        <Typography
          variant="caption"
          sx={{ display: "block", fontWeight: 700, mb: 0.5, color: invalid ? "#d32f2f" : "text.secondary" }}
        >
          {`${title}${required ? " *" : ""}`}
        </Typography>
        <RichEditor
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange?.(next)}
          readOnly={readOnly}
          invalid={!!invalid}
          isUploading={isUploading}
          placeholder={title}
        />
        {invalid && (
          <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "#d32f2f", fontWeight: 600 }}>
            Обязательное поле
          </Typography>
        )}
      </Box>
    );
  }

  if (kind === "boolean") {
    return (
      <FormControlLabel
        control={(
          <Checkbox
            checked={value === true}
            onChange={(e) => onChange?.(e.target.checked)}
            inputProps={{ "data-testid": `request-field-${internalName}` }}
            disabled={readOnly}
          />
        )}
        label={title}
      />
    );
  }

  if (kind === "multichoice") {
    return (
      <Autocomplete
        multiple
        size="small"
        options={choices.map(String)}
        value={Array.isArray(value) ? value : (value ? [String(value)] : [])}
        onChange={(_e, next) => onChange?.(next)}
        renderInput={(params) => (
          <TextField
            {...params}
            label={title}
            required={!!required}
            error={!!invalid}
            helperText={invalid ? "Обязательное поле" : ""}
            inputProps={{ ...params.inputProps, "data-testid": `request-field-${internalName}` }}
          />
        )}
        disabled={readOnly}
      />
    );
  }

  // «Результирующий выбор» (OutcomeChoice) — группа кнопок, как в форме задачи.
  if (String(control.typeAsString || "").toLowerCase() === "outcomechoice" && !multiple) {
    return (
      <Box>
        <Typography
          variant="caption"
          sx={{ display: "block", fontWeight: 700, mb: 0.5, color: invalid ? "#d32f2f" : "text.secondary" }}
        >
          {`${title}${required ? " *" : ""}`}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={value == null || value === "" ? null : String(value)}
          disabled={readOnly}
          onChange={(_e, next) => { if (next !== null) onChange?.(next); }}
          sx={RESULT_TOGGLE_GROUP_SX}
        >
          {choices.map((c) => (
            <ToggleButton key={String(c)} value={String(c)} data-testid={`outcome-choice-${internalName}-${c}`}>
              {String(c)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
    );
  }

  if (kind === "choice" || kind === "select" || kind === "autocomplete") {
    // Choice со свободным вводом (FillInChoice) — автокомплит, иначе список.
    if (kind === "autocomplete") {
      return (
        <Autocomplete
          freeSolo
          size="small"
          options={choices.map(String)}
          value={value == null ? "" : String(value)}
          onInputChange={(_e, next) => onChange?.(next)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={title}
              required={!!required}
              error={!!invalid}
              helperText={invalid ? "Обязательное поле" : ""}
              inputProps={{ ...params.inputProps, "data-testid": `request-field-${internalName}` }}
            />
          )}
          disabled={readOnly}
        />
      );
    }
    return (
      <TextField {...common} select value={value == null ? "" : String(value)} onChange={(e) => onChange?.(e.target.value)}>
        {choices.map((c) => <MenuItem key={String(c)} value={String(c)}>{String(c)}</MenuItem>)}
      </TextField>
    );
  }

  if (kind === "number") {
    return (
      <TextField
        {...common}
        type="number"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }

  if (kind === "date") {
    return (
      <TextField
        {...common}
        type="date"
        value={value == null ? "" : String(value).slice(0, 10)}
        onChange={(e) => onChange?.(e.target.value)}
        InputLabelProps={{ shrink: true }}
      />
    );
  }

  // text / url / multiline и всё прочее
  return (
    <TextField
      {...common}
      multiline={kind === "multiline"}
      minRows={kind === "multiline" ? 3 : undefined}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
