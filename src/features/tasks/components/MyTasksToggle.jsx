/* eslint-disable react/prop-types */
// src/features/tasks/components/MyTasksToggle.jsx
//
// Тумблер «Я исполнитель» — вкл/выкл.
//
// Показывает только те задачи, которые я ВЕДУ: взял в работу и ещё не закрыл,
// либо закрыл сам. Назначение в «Кому назначено» сюда НЕ входит (требование
// 2026-10-10): на мне или на моей группе может висеть задача, по которой
// работает кто-то другой, и наоборот.
//
// Кто именно взял задачу, определяется в TasksView через
// lib/currentUserMatch.js (Id на сайте источника / ФИО / учётная запись).
//
// Визуально повторяет соседний TasksGroupingToggle — тот же ползунок, чтобы два
// переключателя в шапке читались одинаково.
import { Box, Tooltip, Typography } from "@mui/material";

/**
 * @param {boolean} enabled — фильтр включён
 * @param {(next: boolean) => void} onToggle
 * @param {number|null} [count] — сколько всего задач я веду (подпись на тумблере)
 * @param {boolean} [disabled] — текущий пользователь не опознан, фильтр недоступен
 * @param {boolean} [isHashMode] — в режиме одной задачи (#tasks/<Id>) шапка скрыта
 */
export default function MyTasksToggle({ enabled, onToggle, count = null, disabled = false, isHashMode = false }) {
  if (isHashMode) return null;

  const label = `Я исполнитель${count != null ? ` (${count})` : ""}`;
  const hint = disabled
    ? "Не удалось определить вашего пользователя — фильтр недоступен"
    : enabled
      ? "Показывать все задачи"
      : "Показывать только задачи, которые у меня в работе или завершены мной";

  const toggle = () => {
    if (!disabled) onToggle(!enabled);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        mb: 1,
        minHeight: 32,
        height: 32,
        width: "100%",
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: disabled ? "text.disabled" : "text.secondary" }}
        >
          {label}
        </Typography>
        <Tooltip title={hint}>
          <Box
            role="switch"
            aria-checked={!!enabled}
            aria-label={label}
            aria-disabled={disabled}
            data-testid="my-tasks-toggle"
            tabIndex={disabled ? -1 : 0}
            onClick={toggle}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                toggle();
              }
            }}
            sx={{
              width: 44,
              height: 24,
              borderRadius: 12,
              bgcolor: disabled
                ? "rgba(0,0,0,0.12)"
                : enabled
                  ? "#171c8f"
                  : "rgba(0,0,0,0.2)",
              position: "relative",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "background 150ms",
              flexShrink: 0,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                bgcolor: "white",
                position: "absolute",
                top: 3,
                left: enabled ? 23 : 3,
                transition: "left 150ms",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
}
