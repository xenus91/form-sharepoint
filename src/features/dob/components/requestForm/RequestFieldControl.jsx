/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/RequestFieldControl.jsx
// Один контрол формы заявки. Вид контрола — из метаданных SharePoint
// (controlKindOf в tasks/contentTypeFields.js), поэтому форма строится по типу
// контента, а не хардкодом полей.
import {
  Autocomplete, Checkbox, FormControlLabel, MenuItem, TextField,
} from "@mui/material";
import RichEditor from "../RichEditor";
import PersonFieldAutocomplete from "../../../tasks/components/PersonFieldAutocomplete";

export default function RequestFieldControl({ control, value, onChange, invalid = false, readOnly = false }) {
  const { internalName, title, kind, required, choices = [], multiple = false, description = "" } = control;
  const common = {
    fullWidth: true,
    size: "small",
    label: title,
    required: !!required,
    error: !!invalid,
    helperText: invalid ? "Обязательное поле" : (description ? description.slice(0, 120) : ""),
    inputProps: { "data-testid": `request-field-${internalName}` },
    disabled: readOnly,
  };

  if (kind === "person") {
    return (
      <PersonFieldAutocomplete
        label={title}
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
      <RichEditor
        value={typeof value === "string" ? value : ""}
        onChange={(next) => onChange?.(next)}
        readOnly={readOnly}
        invalid={!!invalid}
      />
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
