/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/RequestContentTypeSelect.jsx
// Выбор типа контента заявки. От выбранного типа зависит состав полей формы
// (поля берутся из FieldLinks типа контента — см. requestFields/contentTypeFields).
import { MenuItem, TextField } from "@mui/material";
import { contentTypeDisplayName } from "../../lib/requestFields";

export default function RequestContentTypeSelect({ contentTypes = [], value = "", onChange, disabled = false, error = false }) {
  // Название типа берём из его ОПИСАНИЯ (Description), внутреннее имя — запасной вариант.
  const options = (contentTypes || [])
    .map((ct) => ({
      id: String(ct?.StringId || ct?.Id || ""),
      name: contentTypeDisplayName(ct),
    }))
    .filter((o) => o.id && o.name);

  return (
    <TextField
      select
      size="small"
      label="Тип заявки"
      value={value}
      disabled={disabled || options.length === 0}
      error={!!error}
      helperText={error ? "Выберите тип заявки" : (options.length === 0 ? "Типы контента списка не загружены" : "")}
      onChange={(e) => onChange?.(e.target.value)}
      inputProps={{ "data-testid": "request-ct-select" }}
      sx={{ minWidth: 260 }}
    >
      {options.map((o) => (
        <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
      ))}
    </TextField>
  );
}
