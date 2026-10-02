// src/features/tasks/components/ViewModeToggle.jsx
// Переключатель cards ↔ table. Виден всем в #tasks.
// План: см. artifacts/plan.md (этап 7).

import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import TableRowsIcon from "@mui/icons-material/TableRows";

export default function ViewModeToggle({ value, onChange, size = "small" }) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_e, next) => {
        if (!next) return;
        onChange(next);
      }}
      size={size}
      aria-label="режим отображения задач"
    >
      <ToggleButton value="cards" aria-label="карточки" data-testid="viewmode-cards">
        <ViewAgendaIcon fontSize="small" sx={{ mr: 0.5 }} />
        Карточки
      </ToggleButton>
      <ToggleButton value="table" aria-label="таблица" data-testid="viewmode-table">
        <TableRowsIcon fontSize="small" sx={{ mr: 0.5 }} />
        Таблица
      </ToggleButton>
    </ToggleButtonGroup>
  );
}