// src/features/tasks/components/ViewModeToggle.jsx
// Переключатель cards ↔ table. Виден всем в #tasks, но ТОЛЬКО НА ДЕСКТОПЕ:
// на узком экране таблица нечитаема (горизонтальный скролл и «слоёный» popup
// действий), поэтому там остаются одни карточки.
// План: см. artifacts/plan.md (этап 7).

import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import TableRowsIcon from "@mui/icons-material/TableRows";

/**
 * Показываем только от md (≥900 px) — десктоп. На xs/sm переключатель скрыт
 * полностью (не «серый» и не «disabled»): режима там всё равно нет.
 * Решение на CSS, без JS-замеров ширины окна: не мигает при первой отрисовке.
 */
const VIEW_MODE_TOGGLE_SX = {
  display: { xs: "none", md: "inline-flex" },
  flexShrink: 0,
};

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
      sx={VIEW_MODE_TOGGLE_SX}
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
