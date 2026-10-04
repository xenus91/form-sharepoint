/* eslint-disable react/prop-types */
// src/features/tasks/components/ExternalTaskCard.jsx
// Карточка задачи из внешнего источника (например, список задач ДОБ / RequestsTask).
//
// ВАЖНО (требование 2026-10-03): карточка должна выглядеть КАК ОБЫЧНАЯ карточка
// задачи и не сообщать пользователю, что задача «из другого источника» — никаких
// бейджей сайта и подписей про «другой сайт».
//
// Почему не TaskCard: основная TaskCard завязана на TaskBehaviour основного сайта
// (ContentTypeId → Title), поля результата и мутации, которые пишут ТОЛЬКО в
// основной список (TASKS_LIST_API). Для задачи с другого сайта те же Id указывают
// на другой элемент — писать по ним в main-список нельзя. Поэтому здесь тот же
// визуальный язык TaskCard (Paper 28px, полоса статуса, заголовок/описание,
// кнопка действия, футер «Исполнитель • Статус» и «#Id»), но действия ведут в
// форму редактирования этого источника (как dob_tasks/[id]).

import React from "react";
import { Box, Paper, Typography, Chip, Button, CircularProgress } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from "../../../tasks/status";
import { resolveTaker } from "../lib/resolveTaker";
import { isTaskTakenByCurrentUser } from "../lib/currentUserMatch";
import { formatDueLeft, formatDueDateFull, formatSolveTime } from "../../../tasks/formatters";

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
 * @param {{task:any, isCompleted?:boolean, isOverdue?:boolean, onOpen?:(task:any)=>void,
 *          onTake?:(task:any)=>void, taking?:boolean, currentUserId?:number|null}} props
 */
function ExternalTaskCard({ task, isCompleted, isOverdue, onOpen, onTake, taking = false, currentUserId = null, currentUserTitle = "", currentUserIdBySource = null }) {
  if (!task) return null;
  const title = stripHtml(task.Title) || stripHtml(task.Body).split("\n")[0] || "Без названия";
  const bodyRaw = stripHtml(task.Body);
  const body = bodyRaw && bodyRaw !== title ? bodyRaw : "";
  const completed = isCompleted ?? isCompletedStatus(task.Status, task.PercentComplete);
  const due = formatDueLeft(task.DueDate);
  const overdue = isOverdue ?? due.overdue;
  // «Кому назначено» — всегда AssignedTo, «Исполнитель» — всегда тот, кто ВЗЯЛ
  // задачу в работу (до взятия исполнителя нет — см. resolveTaker).
  const assignedTo = task.AssignedTo || "";
  const taker = resolveTaker(task);
  const taken = isInProgressStatus(task.Status);
  // Кнопку показываем всегда, когда задачу можно взять (обработчик может быть не
  // передан в тестах/на других экранах — тогда клик ничего не делает).
  const canTake = !completed && !taken && (isNotStartedStatus(task.Status) || !task.Status);
  // «Задача моя?» — Id взявшего на сайте источника ИЛИ совпадение ФИО
  // (Id на разных сайтах не совпадают, а Editor может прийти строкой).
  const isMine = isTaskTakenByCurrentUser(task, { currentUserId, currentUserTitle, currentUserIdBySource });

  return (
    <Paper
      id={`task-${task.compositeId || task.Id}`}
      data-testid="external-task-card"
      data-composite-id={task.compositeId || `${task.sourceId}:${task.Id}`}
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        pl: { xs: 2, sm: 2.4 },
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        borderRadius: "28px",
        border: "1px solid rgba(23,28,143,0.12)",
        background: overdue && !completed ? "rgba(229,57,53,0.12)" : completed ? "rgba(46,125,50,0.06)" : "rgba(255,255,255,0.95)",
        overflow: "hidden",
        wordBreak: "break-word",
        position: "relative",
        transition: "box-shadow 180ms ease, border-color 180ms ease",
        // цветовая полоса статуса слева: просрочено / выполнено / в работе
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: "28px 0 0 28px",
          bgcolor: overdue && !completed ? "#e53935" : completed ? "#2e7d32" : "#171c8f",
          opacity: completed ? 0.5 : 1,
        },
        "&:hover": {
          borderColor: "rgba(23,28,143,0.22)",
          boxShadow: "0 6px 18px rgba(15,18,61,0.10)",
        },
      }}
    >
      {/* шапка: срок (или время решения) — как у обычных карточек */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
        {completed ? (
          <Chip
            label={formatSolveTime(task).label}
            size="small"
            variant="filled"
            sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24, flexShrink: 0, bgcolor: "#ECEFF1", color: "#37474F", border: "1px solid #CFD8DC" }}
            title={formatSolveTime(task).title}
          />
        ) : task.DueDate ? (
          <Chip
            label={due.label}
            size="small"
            color={due.color === "default" ? "default" : due.color}
            variant={overdue ? "filled" : "outlined"}
            sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24, flexShrink: 0 }}
            title={formatDueDateFull(task.DueDate)}
          />
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <Box sx={{ flex: 1 }} />
      </Box>

      {/* Заголовок и описание */}
      <Box sx={{ mb: 1.25 }}>
        <Typography
          sx={{
            fontWeight: 800,
            color: "#0F123D",
            fontSize: "0.98rem",
            lineHeight: 1.35,
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={title}
        >
          {title}
        </Typography>
        {body ? (
          <Typography
            variant="body2"
            sx={{
              mt: 0.5,
              color: "rgba(15,18,61,0.62)",
              fontSize: "0.86rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={body}
          >
            {body}
          </Typography>
        ) : null}
      </Box>

      {canTake && (
        <Box sx={{ mt: 1.5 }}>
          <Button
            variant="contained"
            size="large"
            disabled={taking}
            onClick={() => onTake?.(task)}
            startIcon={<PlayArrowIcon />}
            sx={{
              borderRadius: "12px",
              fontWeight: 800,
              textTransform: "none",
              width: "100%",
              height: 48,
              fontSize: "1rem",
              backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)",
              color: "#fff",
              "&:hover": { backgroundImage: "linear-gradient(180deg, #8D95FF 0%, #6B7CFF 100%)" },
              "&.Mui-disabled": { backgroundImage: "linear-gradient(180deg, #9BA3FF 0%, #7B84FF 100%)", color: "#fff", opacity: 1 },
            }}
          >
            {taking ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : "Взять в работу"}
          </Button>
        </Box>
      )}

      {taken && !completed && taker && (
        <Box sx={{ mt: 1.5, p: 1.25, borderRadius: "10px", bgcolor: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.3)" }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: "#8d6e00" }}>
            {isMine ? "В работе у вас" : `В работе у ${taker}`}
          </Typography>
          {!isMine && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Задача уже взята другим пользователем. Возьмите другую задачу.
            </Typography>
          )}
        </Box>
      )}

      {typeof onOpen === "function" && (
        <Box sx={{ mt: canTake || (taken && taker && !completed) ? 1 : 1.5 }}>
          <Button
            variant="outlined"
            size="large"
            onClick={() => onOpen(task)}
            startIcon={<EditIcon />}
            sx={{
              borderRadius: "12px",
              fontWeight: 700,
              textTransform: "none",
              width: "100%",
              height: 44,
              fontSize: "0.95rem",
              borderColor: "rgba(23,28,143,0.35)",
              color: "#171c8f",
              "&:hover": { borderColor: "#171c8f", bgcolor: "rgba(23,28,143,0.04)" },
            }}
          >
            Изменить
          </Button>
        </Box>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1, gap: 1 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 0 }}>
          Кому назначено: {assignedTo || "—"} • Исполнитель: {taker || "—"} • Статус: {task.Status || "—"}
        </Typography>
        <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap" }}>
          #{task.Id}
        </Typography>
      </Box>
    </Paper>
  );
}

export default React.memo(ExternalTaskCard);
