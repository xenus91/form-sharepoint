/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/RequestTypePicker.jsx
// Выбор типа заявки — кнопки/чипы на одной странице формы (до 7 типов).
// Название типа берём из его ОПИСАНИЯ (Description), как и везде в разделе.
import { Box, Chip, Typography } from "@mui/material";

/** Типы, которые заявкой быть не могут (системная «Папка» 0x0120…). */
function isFolderCt(ct) {
  if (/^0x0120/i.test(String(ct?.StringId || ct?.Id || ""))) return true;
  return /^(?:folder|папка)$/i.test(String(ct?.Name || "").trim());
}

export default function RequestTypePicker({
  contentTypes = [],
  value = "",
  onChange,
  disabled = false,
  error = false,
  ctLabelOf,
}) {
  const options = (contentTypes || [])
    .filter((ct) => !isFolderCt(ct))
    .map((ct) => ({ id: String(ct?.StringId || ct?.Id || ""), ct }))
    .filter((o) => o.id);

  const labelOf = (ct) => (ctLabelOf ? ctLabelOf(ct) : String(ct?.Description || ct?.Name || ""));

  return (
    <Box data-testid="request-type-picker">
      <Typography
        variant="caption"
        sx={{ display: "block", fontWeight: 700, mb: 0.75, color: error ? "#d32f2f" : "text.secondary" }}
      >
        Тип заявки
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {options.map(({ id, ct }) => {
          const selected = String(value) === id;
          return (
            <Chip
              key={id}
              clickable={!disabled}
              disabled={disabled}
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              label={labelOf(ct)}
              onClick={() => !disabled && onChange?.(id)}
              data-testid={`request-type-${id}`}
              data-selected={selected ? "true" : "false"}
              sx={{ fontWeight: selected ? 700 : 600 }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
