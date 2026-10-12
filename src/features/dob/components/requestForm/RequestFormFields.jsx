/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/RequestFormFields.jsx
// Список полей формы заявки: состав и порядок — из типа контента.
import { Box, Typography } from "@mui/material";
import RequestFieldControl from "./RequestFieldControl";

export default function RequestFormFields({ controls = [], values = {}, invalidNames = [], onChange, readOnly = false }) {
  const bad = new Set(invalidNames.map(String));
  if (!controls.length) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="request-form-empty">
        У выбранного типа контента нет полей для заполнения.
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {controls.map((control) => (
        <RequestFieldControl
          key={control.internalName}
          control={control}
          value={values[control.internalName]}
          onChange={(next) => onChange?.(control.internalName, next)}
          invalid={bad.has(control.internalName)}
          readOnly={readOnly}
        />
      ))}
    </Box>
  );
}
