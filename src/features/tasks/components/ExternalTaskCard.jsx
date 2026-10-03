/* eslint-disable react/prop-types */
// src/features/tasks/components/ExternalTaskCard.jsx
// Карточка задачи из «внешнего» источника (например, сайт ДОБ / список RequestsTask).
//
// Почему отдельный компонент, а не TaskCard: основная TaskCard завязана на
// конфигурацию TaskBehaviour основного сайта (ContentTypeId → Title), поля
// результата, AdditionalActions и мутации, которые пишут ТОЛЬКО в основной список
// (TASKS_LIST_API). Для задачи с другого сайта те же Id указывают на другой элемент —
// писать по ним в main-список нельзя. Поэтому внешние задачи показываются
// read-only карточкой: заголовок, описание, статус, исполнитель, срок, источник.

import React from "react";
import { Paper, Typography, Chip, Stack, Divider } from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import { isCompletedStatus } from "../../../tasks/status";
import { formatDueLeft, formatDueDateFull } from "../../../tasks/formatters";

function stripHtml(html) {
  if (!html) return "";
  const tmp = String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "");
  return tmp
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * @param {{task:any, isCompleted?:boolean, isOverdue?:boolean}} props
 */
function ExternalTaskCard({ task, isCompleted, isOverdue }) {
  if (!task) return null;
  const title = stripHtml(task.Title) || stripHtml(task.Body).split("\n")[0] || "Без названия";
  const bodyRaw = stripHtml(task.Body);
  const body = bodyRaw && bodyRaw !== title ? bodyRaw : "";
  const completed = isCompleted ?? isCompletedStatus(task.Status, task.PercentComplete);
  const due = formatDueLeft(task.DueDate);
  const overdue = isOverdue ?? due.overdue;
  const sourceLabel = task.sourceLabel || task.sourceId || "внешний источник";

  return (
    <Paper
      data-testid="external-task-card"
      data-composite-id={task.compositeId || `${task.sourceId}:${task.Id}`}
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        borderColor: "rgba(23,28,143,0.16)",
        background: completed ? "#f6f8f6" : "#fff",
        opacity: completed ? 0.85 : 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
        <Chip
          icon={<PublicIcon sx={{ fontSize: 14 }} />}
          label={sourceLabel}
          size="small"
          sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, bgcolor: "rgba(23,28,143,0.08)", color: "#171c8f" }}
        />
        {task.Status ? (
          <Chip
            label={task.Status}
            size="small"
            sx={{
              height: 22,
              fontSize: "0.7rem",
              fontWeight: 700,
              bgcolor: completed ? "rgba(46,125,50,0.12)" : "rgba(2,136,209,0.12)",
              color: completed ? "#2e7d32" : "#01579b",
            }}
          />
        ) : null}
        {task.DueDate ? (
          <Chip
            label={overdue && !completed ? `Просрочено · ${due.label}` : formatDueDateFull(task.DueDate)}
            size="small"
            sx={{
              height: 22,
              fontSize: "0.7rem",
              fontWeight: 700,
              bgcolor: overdue && !completed ? "rgba(229,57,53,0.12)" : "rgba(0,0,0,0.06)",
              color: overdue && !completed ? "#c62828" : "text.secondary",
            }}
          />
        ) : null}
        {task.Id != null ? (
          <Typography variant="caption" sx={{ color: "text.secondary", ml: "auto" }}>
            #{task.Id}
          </Typography>
        ) : null}
      </Stack>

      <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.25, wordBreak: "break-word" }}>
        {title}
      </Typography>
      {body ? (
        <Typography
          variant="body2"
          sx={{ mt: 0.5, color: "text.secondary", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {body}
        </Typography>
      ) : null}

      <Divider sx={{ my: 1 }} />
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Исполнитель: <b>{task.AssignedTo || "—"}</b>
        </Typography>
        {task.Modified ? (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Изменён: <b>{formatDueDateFull(task.Modified)}</b>
          </Typography>
        ) : null}
      </Stack>
      <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
        Задача другого сайта — действия доступны в разделе этого источника.
      </Typography>
    </Paper>
  );
}

export default React.memo(ExternalTaskCard);
