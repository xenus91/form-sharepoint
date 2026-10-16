/* eslint-disable react/prop-types */
// src/features/tasks/components/MyTasksToggle.jsx
//
// Кнопка «Я исполнитель» — вкл/выкл.
//
// ДВА состояния одной кнопки:
//   • нажата (active, variant="contained", aria-pressed="true") — фильтр
//     применён, видны только задачи, которые я веду;
//   • не нажата (variant="outlined", aria-pressed="false") — фильтр выключен,
//     видны все задачи.
// Отдельно кнопка по-настоящему disabled, если не удалось определить текущего
// пользователя: тогда фильтр не дал бы ничего осмысленного.
//
// Показывает только те задачи, которые я ВЕДУ: взял в работу и ещё не закрыл,
// либо закрыл сам. Назначение в «Кому назначено» сюда НЕ входит (требование
// 2026-10-10): на мне или на моей группе может висеть задача, по которой
// работает кто-то другой, и наоборот.
//
// Кто именно взял задачу, определяется в TasksView через
// lib/currentUserMatch.js (Id на сайте источника / ФИО / учётная запись).
import { Button, Tooltip } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";

/**
 * @param {boolean} enabled — фильтр включён (кнопка нажата)
 * @param {(next: boolean) => void} onToggle
 * @param {number|null} [count] — сколько всего задач я веду (в подписи кнопки)
 * @param {boolean} [disabled] — текущий пользователь не опознан
 * @param {boolean} [isHashMode] — в режиме одной задачи (#tasks/<Id>) шапка скрыта
 */
export default function MyTasksToggle({ enabled, onToggle, count = null, disabled = false, isHashMode = false }) {
  if (isHashMode) return null;

  const label = `Я исполнитель${count != null ? ` (${count})` : ""}`;
  const hint = disabled
    ? "Не удалось определить вашего пользователя — фильтр недоступен"
    : enabled
      ? "Фильтр включён: показаны только задачи, которые у меня в работе или завершены мной"
      : "Показывать только задачи, которые у меня в работе или завершены мной";

  return (
    <Tooltip title={hint}>
      {/* span — чтобы подсказка работала и на недоступной кнопке */}
      <span style={{ display: "inline-flex", flexShrink: 0 }}>
        <Button
          size="small"
          data-testid="my-tasks-toggle"
          aria-pressed={!!enabled}
          disabled={disabled}
          onClick={() => onToggle(!enabled)}
          variant={enabled ? "contained" : "outlined"}
          startIcon={<PersonIcon sx={{ fontSize: 16 }} />}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.72rem",
            whiteSpace: "nowrap",
            // высота как у строки с переключателем группировки — они на одной линии
            height: 32,
            px: 1.25,
            flexShrink: 0,
            borderRadius: 0.5,
            ...(enabled ? {} : { color: "text.secondary", borderColor: "divider" }),
          }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}
