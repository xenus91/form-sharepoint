import React, { useEffect, useState, useCallback, useMemo, useTransition, useRef } from "react";
import apiClient, { normalizeNextUrl, invalidate } from "./api";
import { buildTaskIndex, findInIndex } from "./utils/taskIndex";
import { createAdaptivePolling } from "./utils/polling";
import { runWithConcurrency } from "./utils/concurrency";
import { mapRawTask } from "./tasks/mapping";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fetchTasks } from "./tasks/fetchTasks";
import { fetchResultFieldsMeta, fetchContentTypeResultMap, getResultFieldForTask, getTaskResultValue, getResultChoicesForTask } from "./tasks/resultField";
import { getResultUiConfig } from "./tasks/resultConfig";
import { HASH_LOG, HASH_WARN } from "./tasks/log";
import { searchTaskByRelatedItem, fetchFullTask } from "./tasks/hashSearch";
import { enrichTasksWithRelated } from "./tasks/enrich";
import { fetchProblemsPalletItem } from "./tasks/problemsPallet";
import {
  getGroupIdsFromDistribution,
  resolveDistributionViaDcEmail,
  getTaskFieldNames,
  detectRecipientField,
  detectSCNumberField,
  DCEMAIL_LIST_TITLE,
} from "./tasks/distribution";
import { buildTaskListQuery } from "./tasks/listQuery";
import { TASKS_LIST_API, FULL_TASK_SELECT, FULL_TASK_EXPAND, ADDITIONAL_ACTIONS_STANDARD, fetchAdditionalActionsDefault, getCachedAdditionalActionsDefaultSync } from "./tasks/config";
import {
  formatDueLeft,
  formatDueDateFull,
  formatSolveTime,
  extractTKNumber,
  extractSCNumber,
  extractTKNumberFromTask,
  extractSCNumberFromTask,
  extractEONumberFromTask,
} from "./tasks/formatters";
import { isCompletedStatus, isNotStartedStatus, isInProgressStatus } from "./tasks/status";
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  IconButton,
  Tabs,
  Tab,
  Divider,
  Tooltip,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Checkbox,
  FormGroup,
  Autocomplete,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderIcon from "@mui/icons-material/Folder";
import { keyframes } from "@emotion/react";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CelebrationIcon from "@mui/icons-material/Celebration";
import { useNotifications } from "./NotificationsProvider";


// getGroupIdsFromDistribution / resolveDistributionViaDcEmail / getTaskFieldNames /
// detectRecipientField / detectSCNumberField — все импортированы из "./tasks/distribution".



function stripHtml(html) {
  if (!html) return "";
  const tmp = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "");
  let s = tmp.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  // Чистим артефакты JSON (хвост "))}" и пробел перед запятой "28 ,")
  s = s.replace(/\s*\)+\s*\}+\s*$/, "").replace(/\s+,/g, ",");
  return s;
}

// formatDueLeft / formatDueDateFull / formatSolveTime / extractTKNumber /
// extractSCNumber / extractTKNumberFromTask / extractSCNumberFromTask /
// extractEONumberFromTask — все импортированы из "./tasks/formatters".

// Memoized task card to avoid freeze on rerender
const TaskCard = React.memo(function TaskCard({ task, isCompleted, isOverdue, fieldDefaultActions, choices, updatingId, updatingAction, onResultClick, onTakeInWork, onComplete, currentUserId, currentUserTitle, initialAction, resultFieldsMeta: propResultFieldsMeta, ctResultMap: propCtResultMap }) {
  const dueInfo = formatDueLeft(task.DueDate);
  const tkRaw = extractTKNumberFromTask(task);
  const tk = tkRaw !== "Без ТК" ? tkRaw.replace(/^TK/, "ТК ") : "";
  const eo = extractEONumberFromTask(task);
  const headerTitle = [tk, eo ? `ЕО ${eo}` : ""].filter(Boolean).join(" • ") || task.Title || "Без текста";
  const isUpdating = updatingId === task.Id;
  const isTaking = isUpdating && isNotStartedStatus(task.Status);
  const [confirmNotFoundMode, setConfirmNotFoundMode] = React.useState(() => initialAction === "notfound" && isInProgressStatus(task.Status) && !isCompleted);
  const [foundInputMode, setFoundInputMode] = React.useState(() => initialAction === "found" && isInProgressStatus(task.Status) && !isCompleted);
  const [foundLocation, setFoundLocation] = React.useState("");
  // Доп. действия по найденной ЕО (AdditionalActionsRequired + AdditionalActions Multi-Choice Fill-in)
  const [additionalActions, setAdditionalActions] = React.useState(() => {
    const sync = getCachedAdditionalActionsDefaultSync();
    if (sync !== null) return [...sync];
    if (Array.isArray(fieldDefaultActions)) return [...fieldDefaultActions];
    return ["Отправить ЕО в OTM"];
  });
  const additionalRequired = additionalActions.length > 0 ? "Да" : "Нет";
  // Динамическое поле результата для этой задачи (по ContentType) — для открытой задачи всегда свежие choices
  const dynamicFieldMeta = React.useMemo(() => {
    const fromProp = propResultFieldsMeta && propCtResultMap ? getResultFieldForTask(task, propCtResultMap, propResultFieldsMeta) : null;
    if (fromProp) return fromProp;
    // fallback: ищем по raw полям
    if (task.raw) {
      for (const k of Object.keys(task.raw)) {
        if (k.toLowerCase().includes("result") && typeof task.raw[k] === "string") {
          // не хардкодим, просто возвращаем первое
        }
      }
    }
    return null;
  }, [task, propResultFieldsMeta, propCtResultMap]);
  const dynamicInternalName = dynamicFieldMeta?.internalName || "ResultSearchTHU";
  // Эффективные choices для этой задачи: из динамического поля или глобальные choices
  const effectiveChoices = React.useMemo(() => {
    if (dynamicFieldMeta?.choices && dynamicFieldMeta.choices.length > 0) return dynamicFieldMeta.choices;
    return choices;
  }, [dynamicFieldMeta, choices]);
  // Для открытой задачи — подгружаем свежие choices по ContentType с кэшем (forceRefresh уже в родителе, но дублируем для карточки)
  const [freshChoices, setFreshChoices] = React.useState(null);
  const [freshField, setFreshField] = React.useState(null);
  React.useEffect(() => {
    if (!isInProgressStatus(task.Status) || isCompleted) {
      setFreshChoices(null);
      setFreshField(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { choices: ch, field } = await getResultChoicesForTask(apiClient, task, { forceRefresh: true });
        if (!cancelled && ch && ch.length > 0) {
          setFreshChoices(ch);
          setFreshField(field);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [task.Id, task.ContentTypeId, task.Status, isCompleted]);
  const displayedChoices = freshChoices || effectiveChoices;
  const displayedFieldMeta = freshField || dynamicFieldMeta;
  const displayedInternalName = displayedFieldMeta?.internalName || dynamicInternalName;
  React.useEffect(() => {
    const def = fieldDefaultActions !== null ? fieldDefaultActions : getCachedAdditionalActionsDefaultSync();
    if (def === null) return;
    const isHardcoded = additionalActions.length === 1 && additionalActions[0] === "Отправить ЕО в OTM";
    if (def.length === 0 && isHardcoded) {
      setAdditionalActions([]);
    } else if (def.length > 0 && additionalActions.length === 0) {
      setAdditionalActions([...def]);
    } else if (def.length > 0 && isHardcoded && (def.length !== 1 || def[0] !== "Отправить ЕО в OTM")) {
      setAdditionalActions([...def]);
    } else if (def.length === 0 && additionalActions.length === 0) {
      // already empty, no need
    }
  }, [fieldDefaultActions]);
  const [customActionInput, setCustomActionInput] = React.useState("");
  const [additionalError, setAdditionalError] = React.useState("");
  const [showCelebrate, setShowCelebrate] = React.useState(false);
  const [showSherlock, setShowSherlock] = React.useState(false);
  // Reset inline modes when task status changes (e.g., after take)
  React.useEffect(() => {
    if (!isInProgressStatus(task.Status)) {
      setConfirmNotFoundMode(false);
      setFoundInputMode(false);
      setFoundLocation("");
      const defReset = fieldDefaultActions !== null ? [...fieldDefaultActions] : (getCachedAdditionalActionsDefaultSync() !== null ? [...getCachedAdditionalActionsDefaultSync()] : ["Отправить ЕО в OTM"]);
      setAdditionalActions(defReset);
      setCustomActionInput("");
      setAdditionalError("");
    }
  }, [task.Status, task.Id, fieldDefaultActions]);
  // Also reset when task changes id
  React.useEffect(() => {
    if (initialAction === "notfound" && isInProgressStatus(task.Status) && !isCompleted) {
      setConfirmNotFoundMode(true);
      setFoundInputMode(false);
    } else if (initialAction === "found" && isInProgressStatus(task.Status) && !isCompleted) {
      setFoundInputMode(true);
      setConfirmNotFoundMode(false);
    } else {
      setConfirmNotFoundMode(false);
      setFoundInputMode(false);
    }
    setFoundLocation("");
    if (Array.isArray(task.AdditionalActions) && task.AdditionalActions.length > 0) {
      setAdditionalActions([...task.AdditionalActions]);
    } else {
      const def = fieldDefaultActions !== null ? [...fieldDefaultActions] : (getCachedAdditionalActionsDefaultSync() !== null ? [...getCachedAdditionalActionsDefaultSync()] : ["Отправить ЕО в OTM"]);
      setAdditionalActions(def);
    }
    setCustomActionInput("");
    setAdditionalError("");
  }, [task.Id, initialAction, isCompleted]);
  React.useEffect(() => {
    if (showCelebrate) {
      const t = setTimeout(() => setShowCelebrate(false), 1600);
      return () => clearTimeout(t);
    }
  }, [showCelebrate]);
  React.useEffect(() => {
    if (showSherlock) {
      const t = setTimeout(() => setShowSherlock(false), 1600);
      return () => clearTimeout(t);
    }
  }, [showSherlock]);
  return (
    <Paper
      id={`task-${task.Id}`}
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        borderRadius: '28px',
        border: "1px solid rgba(23,28,143,0.12)",
        background: isOverdue ? "rgba(229,57,53,0.12)" : isCompleted ? "rgba(46,125,50,0.06)" : "rgba(255,255,255,0.95)",
        backdropFilter: "none",
        overflow: "hidden",
        wordBreak: "break-word",
        position: "relative",
        opacity: isUpdating ? 0.65 : 1,
        pointerEvents: isUpdating ? "none" : "auto",
        transition: "opacity 150ms",
        // content-visibility убран для виртуализованного списка — виртуализатор уже виртуализует,
        // двойная виртуализация оставляла пустое место при закрытии/удалении карточки
        willChange: "transform",
        contain: "layout paint",
      }}
    >
      {isUpdating && (() => {
        const action = updatingAction || (isTaking ? "take" : null);
        const isNotFoundAction = action === "notFound";
        const isFoundAction = action === "found";
        const overlayBg = isNotFoundAction ? "rgba(255, 235, 238, 0.88)" : isFoundAction ? "rgba(232, 245, 233, 0.88)" : "rgba(255,255,255,0.82)";
        const spinnerColor = isNotFoundAction ? "#c62828" : isFoundAction ? "#2e7d32" : "#5A67D8";
        const titleColor = isNotFoundAction ? "#b71c1c" : isFoundAction ? "#1b5e20" : "#171c8f";
        const titleText = isNotFoundAction ? "ЕО не найдена" : isFoundAction ? "ЕО найдена — сохраняю..." : isTaking ? "Беру в работу..." : "Сохранение...";
        const subText = isNotFoundAction ? "Создаю заявку на ООБ..." : isFoundAction ? "Фиксирую место и закрываю задачу..." : "Подождите, идёт проверка блокировки";
        return (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: overlayBg,
              backdropFilter: "blur(3px)",
              display: "grid",
              placeItems: "center",
              zIndex: 5,
              borderRadius: 1,
              border: isNotFoundAction ? "1px solid rgba(229,57,53,0.18)" : isFoundAction ? "1px solid rgba(46,125,50,0.18)" : "none",
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25, p: 2, textAlign: "center" }}>
              <CircularProgress size={32} thickness={4} sx={{ color: spinnerColor }} />
              <Typography variant="body2" sx={{ fontWeight: 800, color: titleColor, textAlign: "center", lineHeight: 1.3 }}>
                {titleText}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center", lineHeight: 1.3 }}>
                {subText}
              </Typography>
              {isNotFoundAction && (
                <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 700, mt: 0.5, fontSize: "0.75rem" }}>
                  Создаю заявку на ООБ
                </Typography>
              )}
            </Box>
          </Box>
        );
      })()}
      {showCelebrate && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: 1,
            bgcolor: "rgba(232, 245, 233, 0.92)",
            backdropFilter: "blur(3px)",
            border: "1px solid rgba(46,125,50,0.18)",
          }}
        >
          {/* ring centered */}
          <Box
            sx={{
              position: "absolute",
              width: 90,
              height: 90,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "2px solid rgba(46,125,50,0.22)",
              animation: `${celebrateRing} 0.85s ease-out forwards`,
            }}
          />
          {/* central pop emoji like Telegram reaction */}
          <Box
            sx={{
              fontSize: "44px",
              lineHeight: 1,
              filter: "drop-shadow(0 3px 10px rgba(46,125,50,0.30))",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
            }}
          >
            🎉
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              color: "#1b5e20",
              fontSize: "0.95rem",
              lineHeight: 1.2,
              mt: 1,
              textAlign: "center",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
              animationDelay: "0.08s",
            }}
          >
            Поздравляю! Отличная работа!
          </Typography>
          <Typography
            sx={{
              color: "#2e7d32",
              fontWeight: 600,
              fontSize: "0.82rem",
              mt: 0.25,
              textAlign: "center",
              opacity: 0.9,
            }}
          >
            ЕО найдена — так держать!
          </Typography>
          {/* floating mini emojis - centered cluster */}
          {["✨", "🌟", "✅", "🎈"].map((em, i) => (
            <Box
              key={i}
              sx={{
                position: "absolute",
                fontSize: i % 2 === 0 ? "18px" : "14px",
                left: `${18 + i * 18}%`,
                top: "50%",
                animation: `${celebrateFloat} 1.2s ease-out ${0.15 + i * 0.09}s forwards`,
                opacity: 0,
              }}
            >
              {em}
            </Box>
          ))}
        </Box>
      )}
      {showSherlock && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 6,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: 1,
            bgcolor: "rgba(255, 235, 238, 0.92)",
            backdropFilter: "blur(3px)",
            border: "1px solid rgba(198,40,40,0.18)",
          }}
        >
          {/* ring centered - reddish */}
          <Box
            sx={{
              position: "absolute",
              width: 90,
              height: 90,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "2px solid rgba(198,40,40,0.22)",
              animation: `${celebrateRing} 0.85s ease-out forwards`,
            }}
          />
          {/* central Sherlock icon like Telegram reaction */}
          <Box
            sx={{
              fontSize: "44px",
              lineHeight: 1,
              filter: "drop-shadow(0 3px 10px rgba(198,40,40,0.30))",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
            }}
          >
            🕵️
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              color: "#b71c1c",
              fontSize: "0.95rem",
              lineHeight: 1.2,
              mt: 1,
              textAlign: "center",
              animation: `${celebratePop} 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
              animationDelay: "0.08s",
            }}
          >
            ЕО не найдена
          </Typography>
          <Typography
            sx={{
              color: "#c62828",
              fontWeight: 600,
              fontSize: "0.82rem",
              mt: 0.25,
              textAlign: "center",
              opacity: 0.9,
            }}
          >
            Создаю запрос на ООБ...
          </Typography>
          {/* floating mini emojis - detective theme centered cluster */}
          {["🔍", "📋", "❓", "🗂️"].map((em, i) => (
            <Box
              key={i}
              sx={{
                position: "absolute",
                fontSize: i % 2 === 0 ? "18px" : "14px",
                left: `${18 + i * 18}%`,
                top: "50%",
                animation: `${celebrateFloat} 1.2s ease-out ${0.15 + i * 0.09}s forwards`,
                opacity: 0,
              }}
            >
              {em}
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: "#171c8f", fontSize: "0.82rem", lineHeight: 1.3, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={headerTitle}>
          {headerTitle}
        </Typography>
        {(() => {
          if (isCompleted) {
            const solve = formatSolveTime(task);
            return (
              <Chip
                label={solve.label}
                size="small"
                color="default"
                variant="filled"
                sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24, flexShrink: 0, bgcolor: "#ECEFF1", color: "#37474F", border: "1px solid #CFD8DC" }}
                title={solve.title}
              />
            );
          }
          return (
            <Chip
              label={dueInfo.label}
              size="small"
              color={dueInfo.color === "default" ? "default" : dueInfo.color}
              variant={dueInfo.overdue ? "filled" : "outlined"}
              sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24, flexShrink: 0, display: dueInfo.overdue ? { xs: "none", sm: "inline-flex" } : "inline-flex" }}
              title={formatDueDateFull(task.DueDate)}
            />
          );
        })()}
      </Box>

      <Box>
        <Typography
          variant="body1"
          sx={{
            fontWeight: 600,
            color: "#0F123D",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            mb: 0.75,
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={task.Body}
        >
          {task.Body || task.Title || "Без текста"}
        </Typography>
        {/* Получатель скрыт — в заголовке уже ТК и ЕО, ниже только Body, как просил пользователь */}
      </Box>

      {isCompleted ? (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ mb: 1.5, p: 1.25, borderRadius: 2, bgcolor: "rgba(46,125,50,0.08)", border: "1px solid rgba(46,125,50,0.18)", display: "flex", alignItems: "center", gap: 1.25 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(46,125,50,0.14)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <CheckCircleIcon sx={{ color: "#2e7d32", fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: "#1b5e20", fontSize: "0.95rem", lineHeight: 1.2 }}>Задача выполнена</Typography>
              <Typography variant="caption" sx={{ color: "#2e7d32", fontSize: "0.78rem", lineHeight: 1.3, display: "block", mt: 0.15, wordBreak: "break-word" }}>
                Исполнитель: {task.EditorTitle || task.Editor || task.AssignedTo || "—"} • {task.Modified ? new Date(task.Modified).toLocaleString("ru-RU") : "—"}{task.ResultSearchTHU ? ` • ${task.ResultSearchTHU}` : ""}{task.Location1 ? ` • ${task.Location1}` : ""}
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {(() => {
              const r = String(task.ResultSearchTHU || "").trim().toLowerCase();
              const isFound = r === "найден" || r === "найдена";
              const isNotFound = r === "не найдена" || r === "не найден" || r === "не найдено";
              const col = isFound ? "success" : isNotFound ? "error" : task.ResultSearchTHU ? "success" : "default";
              return (
                <Chip
                  label={`Результат: ${task.ResultSearchTHU || "—"}`}
                  color={col}
                  size="small"
                  variant={isFound || isNotFound ? "filled" : "outlined"}
                  sx={{
                    fontWeight: 700,
                    ...(isFound ? { bgcolor: "#2e7d32", color: "#fff", "& .MuiChip-label": { color: "#fff" } } : {}),
                    ...(isNotFound ? { bgcolor: "#c62828", color: "#fff", "& .MuiChip-label": { color: "#fff" } } : {}),
                  }}
                />
              );
            })()}
            {task.Location1 && <Chip label={`Где найдено: ${task.Location1}`} size="small" variant="outlined" />}
            {task.AdditionalActionsRequired && (
              <Chip
                label={`Доп. действия: ${task.AdditionalActionsRequired}`}
                size="small"
                variant="outlined"
                color={task.AdditionalActionsRequired === "Да" ? "info" : "default"}
              />
            )}
            {Array.isArray(task.AdditionalActions) && task.AdditionalActions.length > 0 && task.AdditionalActions.map((a) => (
              <Chip key={a} label={a} size="small" variant="filled" sx={{ bgcolor: "#E3F2FD", color: "#0D47A1", border: "1px solid #90CAF9", fontWeight: 600 }} />
            ))}
          </Stack>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Статус: {task.Status || "Завершена"} • Изменено: {task.Modified ? new Date(task.Modified).toLocaleString("ru-RU") : "—"}
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
              #{task.Id}
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          {(() => {
            const status = task.Status || "";
            const notStarted = isNotStartedStatus(status);
            const inProgress = isInProgressStatus(status);
            const isMine = currentUserId && task.AssignedToId && Number(task.AssignedToId) === Number(currentUserId);
            const editorTitle = task.EditorTitle || task.raw?.Editor?.Title || task.Editor || "";
            const editorId = task.EditorId || task.raw?.Editor?.Id || null;
            const currentTitleNorm = String(currentUserTitle || "").trim().toLowerCase();
            const editorNorm = String(editorTitle || "").trim().toLowerCase();
            const isEditorMine = (!!editorId && !!currentUserId && Number(editorId) === Number(currentUserId)) || (!!currentTitleNorm && !!editorNorm && currentTitleNorm === editorNorm);
            // Show "Взять в работу" only for Не начата
            if (notStarted && !isCompleted) {
              return (
                <>
                  <Box sx={{ mt: 1.5 }}>
                    <Button
                      variant="contained"
                      size="large"
                      disabled={isUpdating}
                      onClick={() => onTakeInWork?.(task)}
                      sx={{
                        borderRadius: 1.5,
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
                      {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : "Взять в работу"}
                    </Button>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                      #{task.Id}
                    </Typography>
                  </Box>
                </>
              );
            }
            if (inProgress && !isCompleted) {
              // If in progress but not mine (other user took), show info instead of buttons
              // Check if task is assigned to someone else: if AssignedToId exists and not mine and group task, we still show buttons for taker, but for others we show "В работе у ..."
              // For group tasks, AssignedTo is group name, Editor is actual taker — use Editor if available
              const taker = task.EditorTitle || task.AssignedTo || task.Editor || "";
              const showAsMine = true; // for MVP show buttons to everyone who sees InProgress; server ETag will still protect, but we try to differentiate
              // If we can determine it's not mine (group task with Editor different), show locked message
              // For now, if we have isMine flag false and taker exists, show locked for non-taker? But without currentUserTitle we can't know.
              // So we show buttons with hint; the take logic already protects.
              // To implement proper "В работе у X" we need currentUserTitle; fallback: show buttons anyway
              // Let's show buttons, but also show hint who took if not mine
              const isLockedForMe = !isMine && !isEditorMine && taker && taker !== "—";
              if (isLockedForMe) {
                return (
                  <>
                    <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1, bgcolor: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.3)" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: "#8d6e00" }}>
                        В работе у {taker}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Задача уже взята другим пользователем. Возьмите другую задачу.
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || taker || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                  </>
                );
              }
              // Mine or unknown — inline UX без диалогов
              if ((displayedChoices || choices).length === 0) {
                return (
                  <>
                    <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
                      Нет доступных результатов (поле ResultSearchTHU пустое или не найдено).
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                  </>
                );
              }
              // Determine found / notFound choices — через конфиг + fallback на legacy строки, без хардкода конкретных значений
              // Для открытой задачи используем displayedChoices (свежие по ContentType)
              const choicesForButtons = displayedChoices || choices;
              const foundChoice = (() => {
                // 1) по конфигу: requiresLocation / AdditionalActions
                let c = choicesForButtons.find((ch) => {
                  const cfg = getResultUiConfig(ch);
                  return cfg.requiresLocation || cfg.requiresAdditionalActions;
                });
                if (c) return c;
                // 2) legacy: ищем "найден/найдена"
                c = choicesForButtons.find((ch) => {
                  const n = String(ch).trim().toLowerCase();
                  return n === "найден" || n === "найдена";
                });
                if (c) return c;
                // 3) fallback: только если среди choices есть legacy-паттерн, иначе не считаем none как found
                // Для новых типов задач без legacy — foundChoice = null, чтобы не навязывать спец-экран
                const hasLegacy = choicesForButtons.some((ch) => {
                  const n = String(ch).trim().toLowerCase();
                  return n.includes("найден") || n.includes("не найден");
                });
                if (hasLegacy && choicesForButtons.length > 0) return choicesForButtons[0];
                return null;
              })();
              const notFoundChoice = (() => {
                let c = choicesForButtons.find((ch) => getResultUiConfig(ch).confirm);
                if (c) return c;
                c = choicesForButtons.find((ch) => {
                  const n = String(ch).trim().toLowerCase();
                  return n === "не найдена" || n === "не найден" || n === "не найдено";
                });
                if (c) return c;
                const hasLegacy = choicesForButtons.some((ch) => {
                  const n = String(ch).trim().toLowerCase();
                  return n.includes("найден") || n.includes("не найден");
                });
                if (hasLegacy && choicesForButtons.length > 1) return choicesForButtons[1] || null;
                return null;
              })();

              // Confirm mode for Не найдена — как Взять в работу, но в красной гамме
              if (confirmNotFoundMode) {
                return (
                  <>
                    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, bgcolor: "rgba(255, 243, 224, 0.7)", border: "1px solid rgba(229,57,53,0.18)", display: "flex", gap: 1.25, alignItems: "flex-start" }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: "rgba(229,57,53,0.12)", display: "grid", placeItems: "center", flexShrink: 0, mt: 0.25 }}>
                        <SearchOffIcon sx={{ color: "#c62828", fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: "#b71c1c", fontSize: "0.95rem", lineHeight: 1.2 }}>
                          ЕО не найдена
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.78rem", lineHeight: 1.3, display: "block", mt: 0.25 }}>
                          Подтвердите. Задача закроется, отменить нельзя.
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ mt: 1.25 }}>
                      <Button
                        variant="contained"
                        color="error"
                        disabled={isUpdating}
                        onClick={() => {
                          setShowSherlock(true);
                          setTimeout(() => {
                            setConfirmNotFoundMode(false);
                            // ЕО не найдена → доп. действия не применяются: пусто / []
                            if (onComplete) onComplete(task, notFoundChoice, undefined, "", []);
                            else onResultClick(task, notFoundChoice);
                          }, 1600);
                        }}
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 800,
                          textTransform: "none",
                          width: "100%",
                          height: 48,
                          fontSize: "1rem",
                          backgroundImage: "linear-gradient(180deg, #ef5350 0%, #c62828 100%)",
                          color: "#fff",
                          "&:hover": { backgroundImage: "linear-gradient(180deg, #e57373 0%, #b71c1c 100%)" },
                          "&.Mui-disabled": { backgroundImage: "linear-gradient(180deg, #ef9a9a 0%, #ef5350 100%)", color: "#fff", opacity: 1 },
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : "ЕО не найдена"}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => setConfirmNotFoundMode(false)}
                        disabled={isUpdating}
                        sx={{ width: "100%", mt: 0.5, borderRadius: 1.5, fontWeight: 700, textTransform: "none", color: "text.secondary", height: 36 }}
                      >
                        Отмена
                      </Button>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                  </>
                );
              }

              // Input mode для Найдена — максимально лаконично, без лишних букв
              if (foundInputMode) {
                const toggleAdditionalAction = (val) => {
                  const v = String(val).trim();
                  if (!v) return;
                  setAdditionalActions((prev) => {
                    if (prev.includes(v)) return prev.filter((x) => x !== v);
                    return [...prev, v];
                  });
                  if (additionalError) setAdditionalError("");
                };
                const handleAddCustomAction = () => {
                  const v = customActionInput.trim();
                  if (!v) return;
                  if (additionalActions.includes(v)) {
                    setAdditionalError("Это действие уже добавлено");
                    return;
                  }
                  setAdditionalActions((prev) => [...prev, v]);
                  setCustomActionInput("");
                  setAdditionalError("");
                };
                const validateAdditional = () => {
                  setAdditionalError("");
                  return true;
                };
                return (
                  <>
                    <Box sx={{ mt: 1.25 }}>
                      <TextField
                        value={foundLocation}
                        onChange={(e) => setFoundLocation(e.target.value)}
                        placeholder="Где найдена? (необязательно)"
                        size="small"
                        fullWidth
                        disabled={isUpdating}
                        autoFocus
                        sx={{
                          mb: 1,
                          "& .MuiOutlinedInput-root": { borderRadius: 1.5, bgcolor: "#fff", fontSize: "0.95rem" },
                          "& .MuiInputBase-input::placeholder": { opacity: 0.7 },
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            const loc = foundLocation.trim() ? foundLocation.trim() : undefined;
                            if (!validateAdditional()) return;
                            const acts = additionalActions;
                            setShowCelebrate(true);
                            setTimeout(() => {
                              if (onComplete) onComplete(task, foundChoice, loc, additionalRequired, acts);
                              else onResultClick(task, foundChoice);
                            }, 1600);
                          }
                        }}
                      />
                      <Box sx={{ width: '100%', mb: 1.5 }}>
                          <Box
                            sx={{
                              position: 'relative',
                              width: '100%',
                              borderRadius: '28px',
                              backgroundColor: '#F1F3F4',
                              overflow: 'visible',
                              p: '3px',
                              '&:has(.Mui-expanded)': { borderRadius: '28px 28px 0 0' },
                            }}
                          >
                            <Autocomplete
                              multiple
                              freeSolo
                              disableCloseOnSelect
                              options={ADDITIONAL_ACTIONS_STANDARD}
                              value={additionalActions}
                              onChange={(event, newValue) => {
                                const cleaned = newValue.map((v) => String(v).trim()).filter(Boolean);
                                const uniq = [...new Set(cleaned)];
                                setAdditionalActions(uniq);
                                if (additionalError) setAdditionalError("");
                                if (customActionInput) setCustomActionInput("");
                              }}
                              renderTags={(value, getTagProps) =>
                                value.map((option, index) => {
                                  const { key, ...tagProps } = getTagProps({ index });
                                  const isStandard = ADDITIONAL_ACTIONS_STANDARD.includes(option);
                                  return (
                                    <Chip
                                      key={option}
                                      label={option}
                                      size="small"
                                      {...tagProps}
                                      sx={{
                                        bgcolor: isStandard ? "#E3F2FD" : "#E8F5E9",
                                        color: isStandard ? "#0D47A1" : "#1b5e20",
                                        border: isStandard ? "1px solid #90CAF9" : "1px solid #A5D6A7",
                                        fontWeight: 600,
                                      }}
                                    />
                                  );
                                })
                              }
                              renderOption={(props, option) => {
                                const { key, ...rest } = props;
                                return (
                                  <li key={key} {...rest} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px' }}>
                                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, color: '#202124', lineHeight: 1.3, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{option}</Typography>
                                  </li>
                                );
                              }}
                              sx={{
                                width: '100%',
                                '& .MuiOutlinedInput-root': {
                                  minHeight: 56,
                                  borderRadius: '24px',
                                  backgroundColor: '#fff',
                                  paddingRight: '12px !important',
                                  '& fieldset': {
                                    borderColor: 'rgba(0,0,0,0.10)',
                                    borderWidth: '1px',
                                  },
                                  '&:hover fieldset': {
                                    borderColor: 'rgba(0,0,0,0.14)',
                                  },
                                  '&.Mui-focused fieldset': {
                                    borderColor: 'rgba(0,0,0,0.14)',
                                    borderWidth: '1px',
                                  },
                                  '&.Mui-focused fieldset legend': {
                                    color: '#5f6368',
                                  },
                                },
                                '& .MuiInputLabel-root': {
                                  color: '#5f6368',
                                  fontSize: '0.95rem',
                                  fontWeight: 500,
                                  '&.Mui-focused': { color: '#5f6368' },
                                  backgroundColor: '#fff',
                                  padding: '0 6px',
                                  borderRadius: '4px',
                                },
                                '&.Mui-expanded .MuiOutlinedInput-root': {
                                  borderRadius: '24px',
                                },
                              }}
                              slotProps={{
                                popper: {
                                  sx: {
                                    marginTop: '-1px !important',
                                  },
                                },
                              }}
                              slots={{
                                paper: (paperProps) => (
                                  <Paper
                                    {...paperProps}
                                    elevation={0}
                                    sx={{
                                      borderRadius: '0 0 28px 28px',
                                      backgroundColor: '#F1F3F4',
                                      overflow: 'hidden',
                                      padding: '3px',
                                      border: '1px solid rgba(0,0,0,0.10)',
                                      borderTop: 'none',
                                      '& .MuiAutocomplete-listbox': {
                                        backgroundColor: '#fff',
                                        borderRadius: '24px',
                                        padding: 0,
                                        overflow: 'hidden',
                                      },
                                      '& .MuiAutocomplete-option': {
                                        borderRadius: 0,
                                        margin: 0,
                                        padding: '10px 16px !important',
                                        backgroundColor: '#fff',
                                        '&[aria-selected="true"]': { backgroundColor: '#F1F3F4' },
                                        '&.Mui-focused': { backgroundColor: '#fafafa' },
                                      },
                                    }}
                                  />
                                ),
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Дополнительные действия"
                                  placeholder={additionalActions.length === 0 ? "Выберите из списка или введите своё" : "Добавить ещё..."}
                                  size="small"
                                  InputLabelProps={{ shrink: true, ...params.InputLabelProps }}
                                />
                              )}
                            />
                          </Box>
                          {additionalError && (
                            <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 0.75 }}>{additionalError}</Typography>
                          )}
                          {additionalActions.length > 0 && !additionalError && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>Выбрано: {additionalActions.length} — {additionalActions.join(", ")}</Typography>
                          )}
                        </Box>
                      {additionalError && additionalActions.length === 0 && (
                        <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mb: 1 }}>{additionalError}</Typography>
                      )}
                      <Button
                        variant="contained"
                        color="success"
                        disabled={isUpdating}
                        onClick={() => {
                          const loc = foundLocation.trim() ? foundLocation.trim() : undefined;
                          if (!validateAdditional()) return;
                          const acts = additionalActions;
                          const req = additionalActions.length > 0 ? "Да" : "Нет";
                          setShowCelebrate(true);
                          setTimeout(() => {
                            if (onComplete) onComplete(task, foundChoice, loc, req, acts);
                            else onResultClick(task, foundChoice);
                          }, 1600);
                        }}
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 800,
                          textTransform: "none",
                          width: "100%",
                          height: 48,
                          fontSize: "1rem",
                          backgroundImage: "linear-gradient(180deg, #43a047 0%, #2e7d32 100%)",
                          color: "#fff",
                          "&:hover": { backgroundImage: "linear-gradient(180deg, #66bb6a 0%, #388e3c 100%)" },
                          "&.Mui-disabled": { backgroundImage: "linear-gradient(180deg, #a5d6a7 0%, #66bb6a 100%)", color: "#fff", opacity: 1 },
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : `Сохранить — ${foundChoice}`}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => {
                          setFoundInputMode(false);
                          setFoundLocation("");
                          setAdditionalActions([]);
                          setCustomActionInput("");
                          setAdditionalError("");
                        }}
                        disabled={isUpdating}
                        sx={{ width: "100%", mt: 0.5, borderRadius: 1.5, fontWeight: 700, textTransform: "none", color: "text.secondary", height: 32 }}
                      >
                        Отмена
                      </Button>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                        #{task.Id}
                      </Typography>
                    </Box>
                  </>
                );
              }

              // Default: show two buttons 50%
              return (
                <>
                  <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {notFoundChoice && (() => {
                      const cfg = getResultUiConfig(notFoundChoice);
                      return (
                      <Button
                        variant={cfg.variant}
                        color={cfg.color}
                        size="large"
                        disabled={isUpdating}
                        onClick={() => setConfirmNotFoundMode(true)}
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 800,
                          textTransform: "none",
                          flex: "1 1 48%",
                          minWidth: "48%",
                          height: 48,
                          fontSize: "1rem",
                          ...(cfg.gradient ? { backgroundImage: cfg.gradient, color: "#fff", borderColor: cfg.color === "error" ? "#e53935" : "transparent" } : {}),
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : (cfg.label || notFoundChoice)}
                      </Button>
                      );
                    })()}
                    {foundChoice && (() => {
                      const cfg = getResultUiConfig(foundChoice);
                      return (
                      <Button
                        variant={cfg.variant}
                        color={cfg.color}
                        size="large"
                        disabled={isUpdating}
                        onClick={() => setFoundInputMode(true)}
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 800,
                          textTransform: "none",
                          flex: "1 1 48%",
                          minWidth: "48%",
                          height: 48,
                          fontSize: "1rem",
                          ...(cfg.gradient ? { backgroundImage: cfg.gradient, color: "#fff", borderColor: "transparent" } : { color: "#fff" }),
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : (cfg.label || foundChoice)}
                      </Button>
                      );
                    })()}
                    {/* Render any extra choices — через RESULT_UI_CONFIG, _default теперь зелёная */}
                    {(displayedChoices || choices).filter((c) => c !== foundChoice && c !== notFoundChoice).map((choice) => {
                      const cfg = getResultUiConfig(choice);
                      const isContained = cfg.variant === "contained";
                      return (
                      <Button
                        key={choice}
                        variant={cfg.variant}
                        color={cfg.color}
                        size="large"
                        disabled={isUpdating}
                        onClick={() => onResultClick(task, choice)}
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 800,
                          textTransform: "none",
                          flex: "1 1 48%",
                          minWidth: "48%",
                          height: 48,
                          fontSize: "1rem",
                          ...(isContained && cfg.gradient ? { backgroundImage: cfg.gradient, color: "#fff", borderColor: "transparent", "&:hover": { backgroundImage: cfg.gradient, filter: "brightness(0.92)" } } : {}),
                          ...(!isContained ? { borderWidth: 1.5 } : {}),
                        }}
                      >
                        {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: isContained ? "#fff" : "inherit" }} /> : (cfg.label || choice)}
                      </Button>
                      );
                    })}
                    ))}
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                      #{task.Id}
                    </Typography>
                  </Box>
                </>
              );
            }
            // Fallback for other statuses (e.g., unknown) — treat as not started
            return (
              <>
                <Box sx={{ mt: 1.5 }}>
                  <Button
                    variant="contained"
                    size="large"
                    disabled={isUpdating}
                    onClick={() => onTakeInWork?.(task)}
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 800,
                      textTransform: "none",
                      width: "100%",
                      height: 48,
                      fontSize: "1rem",
                      backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)",
                      color: "#fff",
                      "&:hover": { backgroundImage: "linear-gradient(180deg, #8D95FF 0%, #6B7CFF 100%)" },
                    }}
                  >
                    {isUpdating ? <CircularProgress size={22} thickness={4} sx={{ color: "#fff" }} /> : "Взять в работу"}
                  </Button>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Исполнитель: {task.AssignedTo || "—"} • Статус: {task.Status || "—"}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)", fontSize: "0.65rem", fontWeight: 500, whiteSpace: "nowrap", ml: 1 }}>
                    #{task.Id}
                  </Typography>
                </Box>
              </>
            );
          })()}
        </>
      )}
      {!isCompleted && dueInfo.overdue && (
        <Box sx={{ display: { xs: "flex", sm: "none" }, mt: 1.5, pt: 1, borderTop: "1px solid rgba(0,0,0,0.06)", justifyContent: "flex-start", alignItems: "center", gap: 1 }}>
          <Chip label={dueInfo.label} size="small" color={dueInfo.color === "default" ? "default" : dueInfo.color} variant="filled" sx={{ fontWeight: 700, fontSize: "0.7rem", height: 24 }} title={formatDueDateFull(task.DueDate)} />
        </Box>
      )}
    </Paper>
  );
});

// isCompletedStatus / isNotStartedStatus / isInProgressStatus — все импортированы из "./tasks/status".

// keyframes для celebrate-анимаций (используются TaskCard выше). Должны быть
// на module-scope — keyframes-вызов из @emotion/react кэширует результат
// и стабилен между рендерами, поэтому достаточно одного объявления.
const celebratePop = keyframes`
  0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
  15% { transform: scale(1.25) rotate(5deg); opacity: 1; }
  30% { transform: scale(1) rotate(0deg); opacity: 1; }
  80% { transform: scale(1) translateY(0); opacity: 1; }
  100% { transform: scale(0.9) translateY(-12px); opacity: 0; }
`;
const celebrateFloat = keyframes`
  0% { transform: translateY(0) scale(0.6) rotate(0deg); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(-90px) scale(1.1) rotate(12deg); opacity: 0; }
`;
const celebrateRing = keyframes`
  0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
`;

export default function TasksView({ userProfile: propUserProfile, onBack, onCountChange, initialElementId, initialElementAction, onClearElementHash, isLocalRcActive, localRcValue, localRcOffice, onClearLocalRc }) {
  const { notify } = useNotifications();
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [isTabPending, startTabTransition] = useTransition();
  const [isDataPending, startDataTransition] = useTransition();
  const lastFocusLoadRef = React.useRef(Date.now());
  const lastHashFocusRef = React.useRef(Date.now());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set()); // SCNumber -> expanded
  const virtualParentRef = React.useRef(null); // для виртуализации списка
  const [currentUserId, setCurrentUserId] = useState(null);
  const [userOfficeDept, setUserOfficeDept] = useState({ office: "", department: "" });
  const [distribution, setDistribution] = useState(null); // DcEmail item
  const [taskFieldNames, setTaskFieldNames] = useState([]);
  const [recipientField, setRecipientField] = useState(null);
  const [scNumberField, setScNumberField] = useState(null);
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [choices, setChoices] = useState([]);
  const [statusChoices, setStatusChoices] = useState([]);
  const [completedStatusValue, setCompletedStatusValue] = useState(null);
  const [inProgressStatusValue, setInProgressStatusValue] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [currentUserTitle, setCurrentUserTitle] = useState("");
  // Динамическое поле результата: по TypeDisplayName "Результирующий выбор" + ContentType, с кэшем
  const [resultFieldsMeta, setResultFieldsMeta] = useState([]);
  const [ctResultMap, setCtResultMap] = useState(() => new Map());
  const [additionalRequiredIsBoolean, setAdditionalRequiredIsBoolean] = useState(null); // null=unknown, true=Boolean, false=Choice
  const queryClient = useQueryClient();
  const tasksQueryEnabled = !!currentUserId && !fieldsLoading;
  // Динамические поля результата — собираем InternalName для выборки
  const resultFieldInternalNames = (resultFieldsMeta || []).map((f) => f.internalName).filter(Boolean);
  const {
    data: tasksData,
    isLoading: isTasksLoading,
    isFetching: isTasksFetching,
    error: tasksQueryError,
    refetch: refetchTasks,
    dataUpdatedAt: tasksDataUpdatedAt,
  } = useQuery({
    queryKey: ['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')],
    queryFn: () => fetchTasks({ currentUserId, distribution, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames }),
    enabled: tasksQueryEnabled,
    staleTime: 30_000,
    gcTime: 5*60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false, // ручной throttle ниже
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    structuralSharing: true,
  });

  // enrich уже внутри useTasksQuery не используется здесь — делаем локально для совместимости,
  // но основной fetch через useQuery; enrich патчит кэш диффом
  useEffect(() => {
    const data = tasksData;
    if (!data || data.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { recipientMap, scNumberMap, thuMap } = await enrichTasksWithRelated(data, { concurrency: 5 });
        if (cancelled) return;
        if (recipientMap.size===0 && scNumberMap.size===0 && thuMap.size===0) return;
        queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => {
          if (!Array.isArray(prev) || prev.length===0) return prev;
          let changed=false;
          const next = prev.map((p)=>{
            const newRec = recipientMap.get(p.Id);
            const newSc = scNumberMap.get(p.Id);
            const newThu = thuMap.get(p.Id);
            if (newRec===undefined && newSc===undefined && newThu===undefined) return p;
            if (newRec!==undefined && p.Recipient!==newRec) {} else if (newSc!==undefined && p.SCNumber!==newSc) {} else if (newThu!==undefined && p.THU!==newThu && p.raw?.THU!==newThu) {} else return p;
            changed=true;
            const upd={...p, raw:{...p.raw}};
            if (newRec!==undefined) upd.Recipient=newRec;
            if (newSc!==undefined) { upd.SCNumber=newSc; upd.TKNumber=newSc; }
            if (newThu!==undefined) { upd.THU=newThu; upd.raw.THU=newThu; }
            return upd;
          });
          return changed? next : prev;
        });
        const newTKs = new Set([...scNumberMap.values()].map((v)=> extractTKNumber(v)!=="Без ТК"? extractTKNumber(v): extractTKNumberFromTask({SCNumber:v})));
        if (newTKs.size>0) {
          setExpandedGroups((prev)=>{
            const next=new Set(prev); let ch=false;
            newTKs.forEach((tk)=>{ if(!next.has(tk) && tk!=="Без ТК"){ next.add(tk); ch=true; }});
            return ch? next: prev;
          });
        }
      } catch {}
    })();
    return ()=>{ cancelled=true; };
  }, [tasksDataUpdatedAt, queryClient, currentUserId, distribution, taskFieldNames, recipientField, scNumberField]);

  const tasks = tasksData ?? [];
  const loading = isTasksLoading && tasks.length===0;
  const isBackgroundFetching = isTasksFetching && !isTasksLoading;
  const error = tasksQueryError ? "Не удалось загрузить задачи." : "";
  const [tab, setTab] = useState(0); // 0 = active, 1 = completed

  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [confirmNotFoundOpen, setConfirmNotFoundOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [pendingResult, setPendingResult] = useState("");
  const [locationComment, setLocationComment] = useState("");
  // Доп. действия для диалога Найдена (legacy путь через handleResultClick)
  const [pendingAdditionalActions, setPendingAdditionalActions] = useState(["Отправить ЕО в OTM"]);
  const pendingAdditionalRequired = pendingAdditionalActions.length > 0 ? "Да" : "Нет";
  const [fieldDefaultActions, setFieldDefaultActions] = useState(() => {
    const sync = getCachedAdditionalActionsDefaultSync();
    return sync !== null ? sync : null;
  });
  useEffect(() => {
    let cancelled = false;
    fetchAdditionalActionsDefault(apiClient).then((vals) => {
      if (!cancelled) setFieldDefaultActions(vals);
    }).catch(() => {
      if (!cancelled) setFieldDefaultActions([]);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (fieldDefaultActions && fieldDefaultActions.length && pendingAdditionalActions.length === 0) {
      // если диалог ещё не открывался и дефолт пришёл позже — подставим (не перезатираем уже выбранное)
    }
  }, [fieldDefaultActions]);
  const [pendingCustomAction, setPendingCustomAction] = useState("");
  const [pendingAdditionalError, setPendingAdditionalError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingAction, setUpdatingAction] = useState(null); // take | found | notFound

  // hash-роут элемента ProblemsPallet: #tasks/id=10
  const [elementIdParam, setElementIdParam] = useState(() => initialElementId ? String(initialElementId) : null);
  const [elementActionParam, setElementActionParam] = useState(() => initialElementAction || null);
  const [elementDialogOpen, setElementDialogOpen] = useState(false);
  const [elementLoading, setElementLoading] = useState(false);
  const [elementTaskSearching, setElementTaskSearching] = useState(false);
  const [isHashTaskRefreshing, setIsHashTaskRefreshing] = useState(false);
  const [elementData, setElementData] = useState(null);
  const [elementTaskMatch, setElementTaskMatch] = useState(null);
  const [elementError, setElementError] = useState("");
  const [elementNotFound, setElementNotFound] = useState(false);
  const [autoTabAppliedForElement, setAutoTabAppliedForElement] = useState(false);

  // PROBLEMS_LIST_TITLE и fetchProblemsPalletItem импортированы из "./tasks/problemsPallet".
  // Map-индекс по задачам — O(1) lookup вместо O(n) JSON.stringify на каждом полле.
  // Перестраивается только когда меняется tasks (useMemo ниже).
  const taskIndex = useMemo(() => buildTaskIndex(tasks), [tasks]);
  const findTaskByElementId = (allTasks, elementId) => {
    // Сигнатура сохранена для обратной совместимости, но используем индекс
    // (allTasks игнорируется — индекс берётся из текущего tasks).
    return findInIndex(taskIndex, elementId);
  };
  // fetchProblemsPalletItem импортирован из "./tasks/problemsPallet".



  // fields loading flag - no discovery, use GUID directly

  // get current user + Office/Department via GetMyProperties for DcEmail distribution
  useEffect(() => {
    apiClient
      .get("/web/currentuser", { headers: { Accept: "application/json;odata=verbose" } })
      .then((r) => {
        setCurrentUserId(r?.data?.d?.Id || null);
        if (r?.data?.d?.Title) setCurrentUserTitle(r.data.d.Title);
      })
      .catch(() => setCurrentUserId(null));
    // Fetch Office/Department for distribution filtering (group assignment)
    (async () => {
      try {
        if (propUserProfile && (propUserProfile.userOffice || propUserProfile.userDepartment)) {
          const office = propUserProfile.userOffice || "";
          const dept = propUserProfile.userDepartment || "";
          if (office || dept) {
            setUserOfficeDept({ office, department: dept });
          }
        } else {
          const resp = await apiClient.get("/SP.UserProfiles.PeopleManager/GetMyProperties", { headers: { Accept: "application/json;odata=verbose" } });
          const props = resp?.data?.d?.UserProfileProperties?.results || [];
          const find = (k) => props.find((p) => p.Key === k)?.Value || "";
          const office = find("Office") || "";
          const dept = find("Department") || "";
          if (office || dept) setUserOfficeDept({ office, department: dept });
        }
      } catch {}
    })();
    // Fetch task field names to know if OffDepKey/Distribution exists
    getTaskFieldNames().then(setTaskFieldNames).catch(() => {});
    detectRecipientField().then(setRecipientField).catch(() => {});
    detectSCNumberField().then(setScNumberField).catch(() => {});
  }, [propUserProfile]);

  // Синхронизация hash elementId/action из App.jsx
  useEffect(() => {
    if (initialElementId) setElementIdParam(String(initialElementId));
    else setElementIdParam(null);
  }, [initialElementId]);
  useEffect(() => {
    setElementActionParam(initialElementAction || null);
  }, [initialElementAction]);

  // Resolve DcEmail distribution when Office/Department known
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userOfficeDept.office && !userOfficeDept.department) return;
      const dist = await resolveDistributionViaDcEmail(userOfficeDept.office, userOfficeDept.department);
      if (!cancelled) setDistribution(dist);
    })();
    return () => { cancelled = true; };
  }, [userOfficeDept.office, userOfficeDept.department]);

  // fetch entity type & field choices via GUID
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFieldsLoading(true);
      try {
        const { data } = await apiClient.get(
          `${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        if (!cancelled) setEntityType(data?.d?.ListItemEntityTypeFullName || null);
      } catch {
        if (!cancelled) setEntityType(null);
      }
      try {
        const { data } = await apiClient.get(
          `${TASKS_LIST_API}/fields?$filter=InternalName eq 'ResultSearchTHU'`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const field = data?.d?.results?.[0];
        if (!cancelled) {
          if (field?.Choices?.results) setChoices(field.Choices.results);
          else if (Array.isArray(field?.Choices)) setChoices(field.Choices);
          else setChoices([]);
        }
      } catch {
        if (!cancelled) setChoices([]);
      }
      // status choices
      try {
        const { data } = await apiClient.get(
          `${TASKS_LIST_API}/fields?$filter=InternalName eq 'Status'`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const field = data?.d?.results?.[0];
        let arr = [];
        if (field?.Choices?.results) arr = field.Choices.results;
        else if (Array.isArray(field?.Choices)) arr = field.Choices;
        if (!cancelled) {
          setStatusChoices(arr);
          // find completed value - prioritize "заверш"/"completed" over "выполн" to avoid "В процессе выполнения"
          let found = arr.find((v) => String(v).toLowerCase().includes("заверш"));
          if (!found) found = arr.find((v) => String(v).toLowerCase().includes("completed"));
          if (!found) {
            found = arr.find((v) => {
              const s = String(v).toLowerCase();
              return s.includes("выполн") && !s.includes("в процессе");
            });
          }
          if (found) setCompletedStatusValue(found);
          else if (arr.length > 0) setCompletedStatusValue(arr[arr.length - 1]);
          else setCompletedStatusValue("Завершена");
          // in-progress
          let inProg = arr.find((v) => String(v).toLowerCase().includes("в процессе"));
          if (!inProg) inProg = arr.find((v) => String(v).toLowerCase().includes("in progress"));
          if (!inProg) inProg = arr.find((v) => String(v).toLowerCase().includes("в работе"));
          if (inProg) setInProgressStatusValue(inProg);
          else setInProgressStatusValue("В процессе выполнения");
        }
      } catch {
        if (!cancelled) {
          setStatusChoices([]);
          setCompletedStatusValue("Завершена");
          setInProgressStatusValue("В процессе выполнения");
        }
      }
      // определить тип поля AdditionalActionsRequired — Choice (Нет/Да) или Boolean (Yes/No)
      try {
        const { data } = await apiClient.get(
          `${TASKS_LIST_API}/fields?$filter=InternalName eq 'AdditionalActionsRequired'`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const field = data?.d?.results?.[0];
        if (!cancelled && field) {
          const typeStr = String(field.TypeAsString || field.TypeDisplayName || "").toLowerCase();
          const isBool = typeStr.includes("boolean") || typeStr.includes("yes/no") || typeStr === "boolean" || typeStr === "yesno";
          setAdditionalRequiredIsBoolean(isBool);
        } else if (!cancelled) {
          setAdditionalRequiredIsBoolean(false);
        }
      } catch {
        if (!cancelled) setAdditionalRequiredIsBoolean(false);
      } finally {
        if (!cancelled) setFieldsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Динамическое поле результата по TypeDisplayName / ContentType (кэш 5 мин, для открытой задачи — forceRefresh)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const metas = await fetchResultFieldsMeta(apiClient);
        if (cancelled) return;
        setResultFieldsMeta(metas);
        try {
          const map = await fetchContentTypeResultMap(apiClient);
          if (!cancelled) setCtResultMap(map);
        } catch {}
        if (metas.length > 0 && metas[0].choices && metas[0].choices.length > 0) {
          setChoices((prev) => (prev && prev.length > 0 ? prev : metas[0].choices));
        }
      } catch (e) {
        console.warn("[resultField] fetch failed", e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Для открытой задачи — всегда свежие choices по ContentType
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    const hasOpen = tasks.some((tk) => isInProgressStatus(tk.Status) && !isCompletedStatus(tk.Status, tk.PercentComplete));
    if (!hasOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const metas = await fetchResultFieldsMeta(apiClient, { forceRefresh: true });
        if (cancelled) return;
        setResultFieldsMeta(metas);
        const map = await fetchContentTypeResultMap(apiClient, { forceRefresh: true });
        if (cancelled) return;
        setCtResultMap(map);
        if (metas.length > 0 && metas[0].choices?.length) {
          const fresh = metas[0].choices;
          setChoices((prev) => {
            if (fresh.length !== prev.length || fresh.some((v,i)=> v!==prev[i])) return fresh;
            return prev;
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [tasks]);

  const loadTasks = useCallback(async (opts={})=>{
    // совместимость: все старые вызовы loadTasks({silent:true}) теперь — invalidate + refetch через TanStack
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    invalidate("/items");
    const res = await refetchTasks();
    return res.data;
  }, [queryClient, refetchTasks]);

  // onCountChange + expandedGroups — теперь через эффект от tasks (раньше было внутри loadTasks)
  useEffect(() => {
    if (!tasksData) return;
    if (onCountChange) {
      const activeCount = tasks.filter((t)=> !isCompletedStatus(t.Status, t.PercentComplete)).length;
      onCountChange(activeCount);
    }
    const newGroups = new Set(tasks.map((m)=> extractTKNumberFromTask(m)));
    setExpandedGroups((prev)=>{
      if (prev.size===0) return newGroups;
      let changed=false;
      const next=new Set(prev);
      newGroups.forEach((g)=>{ if(!prev.has(g)){ next.add(g); changed=true; }});
      return changed? next: prev;
    });
  }, [tasksData, tasks]);

  // initial load — handled by TanStack Query (tasksQueryEnabled); loadTasks is now invalidate+refetch

  // (poll перенесён ниже, после isHashMode — чтобы в hash-режиме не скрывать карточку)

  // mapRawTask, fetchFullTask, searchTaskByRelatedItem импортированы из ./tasks/* —
  // см. mapRawTask (./tasks/mapping), fetchFullTask + searchTaskByRelatedItem (./tasks/hashSearch).

  // Hash элемент: найти связанную задачу и показать диалог (улучшенный глобальный поиск)
  useEffect(() => {
    if (!elementIdParam) {
      setElementDialogOpen(false);
      setElementData(null);
      setElementTaskMatch(null);
      setElementError("");
      setElementNotFound(false);
      setAutoTabAppliedForElement(false);
      setElementLoading(false);
      setElementTaskSearching(false);
      setIsHashTaskRefreshing(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      HASH_LOG("hash run triggered", {elementIdParam, tasksLen: tasks.length, elementTaskMatch: elementTaskMatch?.Id, elementLoading, elementTaskSearching, distribution: distribution? getGroupIdsFromDistribution(distribution): null, currentUserId});
      // avoid reload loop: if already have result, don't re-trigger on every tasks poll
      if (elementTaskMatch && !elementLoading && !elementTaskSearching) {
        if (tasks.length > 0) {
          const stillMatched = findTaskByElementId(tasks, elementIdParam);
          if (stillMatched && stillMatched.Id === elementTaskMatch.Id) { HASH_LOG("guard: same task still matched, skip"); return; }
          // if still matched is null but we already have a global match, keep it (global search already done)
          if (elementTaskMatch && !stillMatched) { HASH_LOG("guard: keep global match, skip"); return; }
        } else {
          HASH_LOG("guard: tasks empty but have match, skip");
          return;
        }
      }
      if (elementLoading || elementTaskSearching) { HASH_LOG("guard: already loading/searching, skip"); return; }
      // dedup: if already searched and not found, don't spam
      if (elementNotFound || elementError) {
        // but check if tasks now contain it (maybe tasks loaded later)
        if (tasks.length > 0) {
          const localCheck = findTaskByElementId(tasks, elementIdParam);
          if (!localCheck) { HASH_LOG("guard: already notFound/error, no local task, skip re-search"); return; }
          HASH_LOG("guard: notFound but local now found, will retry");
        } else {
          HASH_LOG("guard: already notFound/error, skip");
          return;
        }
      }
      const isThu = /^\d{17,18}$/.test(String(elementIdParam).trim());
      HASH_LOG("hash run params", {isThu, elementIdParam, tasksLen: tasks.length});
      let matched = null;
      if (tasks.length > 0) {
        matched = findTaskByElementId(tasks, elementIdParam);
        HASH_LOG("local findTaskByElementId", matched? `found #${matched.Id}` : "not found in local tasks");
      } else {
        HASH_LOG("local tasks empty, skip local search");
      }
      // если не нашли среди фильтрованных — пробуем глобальный поиск (без AssignedTo)
      let elementDataLocal = null;
      let globalMatched = null;
      // сначала грузим элемент (если не THU) чтобы получить THU для поиска по THU
      if (!isThu) {
        HASH_LOG("fetchProblemsPalletItem will start, set loading true");
        setElementLoading(true);
        setElementError("");
        setElementNotFound(false);
        try {
          const d = await fetchProblemsPalletItem(elementIdParam);
          if (!cancelled) {
            elementDataLocal = d;
            setElementData(d);
          }
        } catch (e) {
          const st = e?.response?.status;
          if (!cancelled) {
            if (st === 404) {
              setElementNotFound(true);
              setElementError(`Элемент ProblemsPallet #${elementIdParam} не найден`);
            } else {
              setElementError(e?.response?.data?.error?.message?.value || e?.message || "Не удалось загрузить элемент ProblemsPallet");
            }
          }
        } finally {
          // всегда сбрасываем лоадер, даже если эффект отменён — иначе зависнет
          if (matched) {
            setElementLoading(false);
          } else {
            setElementTaskSearching(true);
            setElementLoading(false);
          }
          HASH_LOG("finally after fetchProblemsPalletItem", {cancelled, matched: matched? matched.Id: null, loading: false, searching: true});
        }
        if (cancelled) { HASH_LOG("cancelled after fetch, abort"); setElementTaskSearching(false); return; }
        HASH_LOG("after fetch elementDataLocal", elementDataLocal, "matched before search", matched? matched.Id: null);
        // если локально не нашли — ищем заново по RelatedItems.ItemId (простой OData + CAML фолбэк)
        if (!matched && !cancelled) {
          HASH_LOG("local not found, will searchTaskByRelatedItem");
          try {
            const found = await searchTaskByRelatedItem(elementIdParam);
            HASH_LOG("searchTaskByRelatedItem result", found? `found #${found.Id} Title:${found.Title}` : "null");
            if (found && !cancelled) matched = found;
          } catch (e) {
            HASH_WARN("searchTaskByRelatedItem failed", e?.message, e);
          } finally {
            if (!cancelled) setElementTaskSearching(false);
          }
        } else {
          HASH_LOG("skip searchTaskByRelatedItem, matched already", matched? matched.Id: "null");
        }
        if (!cancelled) {
          HASH_LOG("final setElementTaskMatch", matched? `found #${matched.Id}`: "null", "elementData", elementDataLocal? elementDataLocal.Id: null);
          setElementTaskMatch(matched || null);
          if (!matched) {
            HASH_WARN("final: no task found for", elementIdParam, "tasks len", tasks.length, "elementDataLocal", elementDataLocal);
            setElementNotFound(true);
            if (!elementError) setElementError(`Связанная задача для элемента #${elementIdParam} не найдена (RelatedItems.ItemId)`);
          }
          if (matched && !autoTabAppliedForElement) {
            const isComp = isCompletedStatus(matched.Status, matched.PercentComplete);
            const targetTab = isComp ? 1 : 0;
            if (tab !== targetTab) {
              startTabTransition(() => setTab(targetTab));
            }
            setAutoTabAppliedForElement(true);
          }
        }
      } else {
        HASH_LOG("THU branch", elementIdParam);
        // THU — если локально не нашли, ищем по RelatedItems/THU
        if (!matched && !cancelled) {
          HASH_LOG("THU local not found, search");
          if (!cancelled) setElementTaskSearching(true);
          try {
            const found = await searchTaskByRelatedItem(elementIdParam);
            HASH_LOG("THU search result", found? found.Id: null);
            if (found && !cancelled) matched = found;
          } catch (e) { HASH_WARN("THU search failed", e); } finally {
            if (!cancelled) setElementTaskSearching(false);
          }
        }
        if (!cancelled) {
          HASH_LOG("THU final", matched? matched.Id: null);
          setElementData(null);
          setElementLoading(false);
          setElementTaskMatch(matched || null);
          if (matched && !autoTabAppliedForElement) {
            const isComp = isCompletedStatus(matched.Status, matched.PercentComplete);
            const targetTab = isComp ? 1 : 0;
            if (tab !== targetTab) startTabTransition(() => setTab(targetTab));
            setAutoTabAppliedForElement(true);
          }
          if (!matched) {
            setElementError(`Задача для ЕО ${elementIdParam} не найдена среди ваших задач`);
          }
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [elementIdParam, distribution, currentUserId]); // tasks убран намеренно — ищем via CAML/OData, иначе storm cancellations
  // авто-таб отдельно
  useEffect(() => {
    if (elementTaskMatch && !autoTabAppliedForElement) {
      const isComp = isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete);
      const targetTab = isComp ? 1 : 0;
      if (tab !== targetTab) startTabTransition(() => setTab(targetTab));
      // eslint-disable-next-line
    }
  }, [elementTaskMatch, autoTabAppliedForElement, tab]);

  // лог hash param change
  useEffect(() => { HASH_LOG("hash params changed", {elementIdParam, elementActionParam, tasksLen: tasks.length, loading: elementLoading, searching: elementTaskSearching}); }, [elementIdParam, elementActionParam]);

  useEffect(() => {
    HASH_LOG("autoTab reset for", elementIdParam);
    setAutoTabAppliedForElement(false);
  }, [elementIdParam]);

  const activeCount = useMemo(() => tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);

  const filteredTasks = useMemo(() => {
    if (tab === 0) return tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete));
    return tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete));
  }, [tasks, tab]);

  // Хелпер для получения свежих choices по ContentType для конкретной задачи
  const getTaskChoices = useCallback((taskObj) => {
    const meta = getResultFieldForTask(taskObj, ctResultMap, resultFieldsMeta);
    if (meta?.choices && meta.choices.length > 0) return meta.choices;
    return choices;
  }, [ctResultMap, resultFieldsMeta, choices]);
  const getTaskFieldMeta = useCallback((taskObj) => {
    return getResultFieldForTask(taskObj, ctResultMap, resultFieldsMeta) || { internalName: "ResultSearchTHU", choices };
  }, [ctResultMap, resultFieldsMeta, choices]);

  const groupedTasks = useMemo(() => {
    if (!groupingEnabled) {
      // группировка выключена — один виртуальный группа "Все"
      return filteredTasks.length ? [["Все", filteredTasks]] : [];
    }
    const map = new Map();
    for (const task of filteredTasks) {
      const sc = extractTKNumberFromTask(task);
      if (!map.has(sc)) map.set(sc, []);
      map.get(sc).push(task);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Без ТК") return 1;
      if (b[0] === "Без ТК") return -1;
      if (a[0] === "Все") return -1;
      if (b[0] === "Все") return 1;
      return a[0].localeCompare(b[0], "ru");
    });
  }, [filteredTasks, groupingEnabled]);

  // Виртуализация для плоского списка (grouping off) — рендерим только видимые карточки
  // Порог 50 — при меньшем списке виртуализация не нужна и только мешает (пустое место после удаления)
  // Виртуализация временно отключена — давала пропуск на размер карточки между элементами
  // (оценка 360/380 + absolute translateY + measureElement оставляли гэп на высоту карточки)
  // Список теперь рендерится обычным Stack без виртуализации; при необходимости включим с корректной высотой
  const useVirtual = false;
  const flatVirtualizer = useVirtualizer({
    count: 0,
    getScrollElement: () => virtualParentRef.current,
    estimateSize: () => 360,
    overscan: 6,
    measureElement: (el) => el?.getBoundingClientRect()?.height ?? 360,
  });

  const toggleGroup = useCallback((sc) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sc)) next.delete(sc);
      else next.add(sc);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(groupedTasks.map(([sc]) => sc)));
  }, [groupedTasks]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);



  const handleTakeInWork = useCallback(async (task) => {
    setUpdatingId(task.Id);
    setUpdatingAction("take");
    try {
      // 1. fresh fetch with ETag
      let etag = "*";
      let freshStatus = "";
      let freshEditor = "";
      let freshEditorId = null;
      let freshModified = "";
      try {
        const resp = await apiClient.get(
          `${TASKS_LIST_API}/items(${task.Id})?$select=Id,Status,PercentComplete,Modified,Editor/Id,Editor/Title&$expand=Editor`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const d = resp?.data?.d;
        freshStatus = d?.Status || "";
        freshEditor = d?.Editor?.Title || "";
        freshEditorId = d?.Editor?.Id || null;
        freshModified = d?.Modified || "";
        etag = d?.__metadata?.etag || resp?.headers?.etag || resp?.headers?.ETag || resp?.headers?.["etag"] || "*";
        // if already not "Не начата" -> show warning
        if (!isNotStartedStatus(freshStatus)) {
          if (isCompletedStatus(freshStatus, d?.PercentComplete)) {
            notify(`Задача #${task.Id} уже завершена пользователем ${freshEditor || "—"} (${freshStatus}). Возьмите другую задачу.`, { severity: "warning" });
          } else if (isInProgressStatus(freshStatus)) {
            notify(`Задача #${task.Id} уже в работе у ${freshEditor || "другого пользователя"} (${freshStatus}). Возьмите другую задачу.`, { severity: "warning" });
          } else {
            notify(`Задача #${task.Id} уже обрабатывается: ${freshStatus} у ${freshEditor || "—"}. Возьмите другую задачу.`, { severity: "warning" });
          }
          const _freshOpt = { Status: freshStatus, Modified: freshModified, EditorTitle: freshEditor, Editor: freshEditor, EditorId: freshEditorId };
          queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => Array.isArray(prev) ? prev.map((t) => t.Id === task.Id ? { ...t, ..._freshOpt } : t) : prev);
          setElementTaskMatch((prev) => prev && prev.Id === task.Id ? { ...prev, ..._freshOpt } : prev);
          await loadTasks();
          return;
        }
      } catch (e) {
        // if fetch fails, continue - MERGE with * will try
        console.warn("take check fetch failed", e?.response?.status);
      }

      // 2. try to take: set to InProgress
      let et = entityType;
      if (!et) {
        try {
          const { data } = await apiClient.get(`${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`, { headers: { Accept: "application/json;odata=verbose" } });
          et = data?.d?.ListItemEntityTypeFullName;
        } catch {}
      }
      if (!et) et = "SP.Data.ListListItem";
      const targetInProgress = inProgressStatusValue || "В процессе выполнения";
      const payload = {
        __metadata: { type: et },
        Status: targetInProgress,
      };
      const headers = {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
        "IF-MATCH": etag,
        "X-HTTP-Method": "MERGE",
      };
      try {
        await apiClient.post(`${TASKS_LIST_API}/items(${task.Id})`, payload, { headers });
      } catch (e) {
        const code = e?.response?.status;
        if (code === 412) {
          // race lost
          try {
            const check = await apiClient.get(`${TASKS_LIST_API}/items(${task.Id})?$select=Status,Editor/Id,Editor/Title&$expand=Editor`, { headers: { Accept: "application/json;odata=verbose" } });
            const s = check?.data?.d?.Status || "";
            const ed = check?.data?.d?.Editor?.Title || "другим пользователем";
            notify(`Задача #${task.Id} уже взята пользователем ${ed} (${s}). Возьмите другую задачу.`, { severity: "warning" });
            const edId = check?.data?.d?.Editor?.Id || null;
            queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => Array.isArray(prev) ? prev.map((t) => t.Id === task.Id ? { ...t, Status: s, EditorTitle: ed, Editor: ed, EditorId: edId } : t) : prev);
          } catch {}
          await loadTasks();
          return;
        }
        // other error: try with * as fallback for missing etag
        if (etag !== "*") {
          try {
            await apiClient.post(`${TASKS_LIST_API}/items(${task.Id})`, payload, { headers: { ...headers, "IF-MATCH": "*" } });
          } catch (e2) {
            throw e2;
          }
        } else {
          throw e;
        }
      }
      notify(`Задача #${task.Id} взята в работу`, { severity: "success" });
      // optimistic local update + hash card — через TanStack setQueryData
      const _takeOpt = { Status: targetInProgress, Modified: new Date().toISOString(), EditorTitle: currentUserTitle || "Вы", Editor: currentUserTitle || "Вы", EditorId: currentUserId };
      queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => Array.isArray(prev) ? prev.map((t) => t.Id === task.Id ? { ...t, ..._takeOpt } : t) : prev);
      setElementTaskMatch((prev) => prev && prev.Id === task.Id ? { ...prev, ..._takeOpt } : prev);
      // Инвалидируем кэш списка и самой задачи — TanStack + sp/cache
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      invalidate("/items");
      await loadTasks({ silent: true });
    } catch (err) {
      const msg = err?.response?.data?.error?.message?.value || err?.message || "Ошибка";
      notify(`Не удалось взять задачу #${task.Id}: ${msg}`, { severity: "error" });
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  }, [entityType, inProgressStatusValue, currentUserId, currentUserTitle, notify, loadTasks]);

  const completeTask = useCallback(async (task, resultValue, locationValue, additionalRequired, additionalActions) => {
    const prevTaskSnapshot = { ...task };
    setUpdatingId(task.Id);
    const _norm = String(resultValue || "").trim().toLowerCase();
    const _isNotFound = _norm === "не найдена" || _norm === "не найден" || _norm === "не найдено";
    const _isFound = _norm === "найден" || _norm === "найдена";
    setUpdatingAction(_isNotFound ? "notFound" : _isFound ? "found" : null);
    // Валидация доп. действий по ТЗ: Найдена+Да требует хотя бы одно действие
    if (_isFound) {
      const reqNorm = String(additionalRequired || "Нет").trim();
      const acts = Array.isArray(additionalActions) ? additionalActions.filter(Boolean).map((v)=> String(v).trim()).filter(Boolean) : [];
      if (reqNorm === "Да" && acts.length === 0) {
        notify("Выберите хотя бы одно дополнительное действие или выберите \"Нет\"", { severity: "warning" });
        setUpdatingId(null);
        setUpdatingAction(null);
        return;
      }
      // Нормализуем аргументы для дальнейшего использования
      additionalRequired = reqNorm;
      additionalActions = reqNorm === "Да" ? acts : [];
    } else if (_isNotFound) {
      // ЕО не найдена → доп. действия не применяются: пусто / []
      additionalRequired = "";
      additionalActions = [];
    } else {
      // Другой результат (на будущее) — сохраняем как есть или очищаем
      additionalRequired = additionalRequired ? String(additionalRequired).trim() : (task.AdditionalActionsRequired || "");
      additionalActions = Array.isArray(additionalActions) ? additionalActions : (task.AdditionalActions || []);
    }
    // optimistic: сразу показываем карточку как завершённую, без ожидания сервера
    let _targetStatusOpt = completedStatusValue || "Завершена";
    if (_targetStatusOpt && String(_targetStatusOpt).toLowerCase().includes("в процессе")) _targetStatusOpt = "Завершена";
    // Динамическое поле результата по ContentType
    const _fieldMetaForTask = getResultFieldForTask(task, ctResultMap, resultFieldsMeta) || { internalName: "ResultSearchTHU" };
    const _resultFieldName = _fieldMetaForTask.internalName || "ResultSearchTHU";
    const _optimistic = {
      [_resultFieldName]: resultValue,
      ResultSearchTHU: resultValue,
      Location1: locationValue !== undefined && locationValue !== null ? locationValue : task.Location1,
      AdditionalActionsRequired: _isNotFound ? "" : (_isFound ? (additionalRequired || "Нет") : (task.AdditionalActionsRequired || "")),
      AdditionalActions: _isNotFound ? [] : (_isFound ? (additionalRequired === "Да" ? (additionalActions || []) : []) : (task.AdditionalActions || [])),
      Status: _targetStatusOpt,
      PercentComplete: 1,
      Modified: new Date().toISOString(),
    };
    queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ..._optimistic } : t)) : prev);
    setElementTaskMatch((prev) => (prev && prev.Id === task.Id ? { ...prev, ..._optimistic } : prev));
    try {
      // === Concurrency guard: re-fetch current state from server ===
      let serverEtag = "*";
      try {
        const resp = await apiClient.get(
          `${TASKS_LIST_API}/items(${task.Id})?$select=Id,Status,PercentComplete,${_resultFieldName},ResultSearchTHU,Location1,AdditionalActionsRequired,AdditionalActions,Modified,ContentTypeId`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const server = resp?.data?.d;
        // Extract ETag from __metadata or response headers (axios lowercases headers)
        serverEtag = server?.__metadata?.etag || resp?.headers?.etag || resp?.headers?.ETag || resp?.headers?.["etag"] || "*";
        if (server && isCompletedStatus(server.Status, server.PercentComplete)) {
          notify(`Задача #${task.Id} уже выполнена другим пользователем: ${server.ResultSearchTHU || server.Status}`, { severity: "warning" });
          // Sync local state to server truth — через TanStack
          // Синхронизация с сервером — учитываем динамическое поле
          const _srvFieldName = _resultFieldName;
          const _srvVal = server[_srvFieldName] ?? server.ResultSearchTHU ?? "";
          queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) =>
            Array.isArray(prev) ? prev.map((t) =>
              t.Id === task.Id
                ? { ...t, Status: server.Status, PercentComplete: server.PercentComplete, ResultSearchTHU: _srvVal, [_srvFieldName]: _srvVal, Modified: server.Modified }
                : t
            ) : prev
          );
          await loadTasks();
          return;
        }
      } catch (checkErr) {
        // If check fails (item deleted or no access), continue - MERGE will handle error
        console.warn("concurrency check failed", checkErr?.response?.status, checkErr?.message);
      }

      // ensure we have entity type via GUID
      let et = entityType;
      if (!et) {
        try {
          const { data } = await apiClient.get(
            `${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`,
            { headers: { Accept: "application/json;odata=verbose" } }
          );
          et = data?.d?.ListItemEntityTypeFullName;
        } catch {}
      }
      if (!et) et = "SP.Data.ListListItem";

      const payload = {
        __metadata: { type: et },
        [_resultFieldName]: resultValue,
      };
      if (locationValue !== undefined && locationValue !== null) {
        payload.Location1 = locationValue;
      } else if (pendingResult && String(pendingResult).toLowerCase().includes("найден") && locationValue === undefined) {
        // if skipped, not sending Location1 (leave as is)
      }
      // Дополнительные действия (AdditionalActionsRequired + AdditionalActions Multi-Choice)
      // AdditionalActionsRequired может быть Choice (Нет/Да) или Boolean (у пользователя булевое)
      const toSPRequired = (reqStr) => {
        if (additionalRequiredIsBoolean === true) {
          if (reqStr === "Да") return true;
          if (reqStr === "Нет") return false;
          if (reqStr === "") return false;
          return false;
        } else if (additionalRequiredIsBoolean === false) {
          return reqStr;
        } else {
          // неизвестно — пробуем Boolean (фактический деплой булевое), fallback ниже обработает mismatch
          if (reqStr === "Да") return true;
          if (reqStr === "Нет") return false;
          if (reqStr === "") return false;
          return reqStr;
        }
      };
      if (_isNotFound) {
        // ЕО не найдена → пусто / [] (для Boolean — false)
        const val = additionalRequiredIsBoolean === true ? false : (additionalRequiredIsBoolean === false ? null : false);
        payload.AdditionalActionsRequired = val;
        payload.AdditionalActions = { __metadata: { type: "Collection(Edm.String)" }, results: [] };
      } else if (_isFound) {
        const reqToSave = additionalRequired || "Нет";
        const actsToSave = reqToSave === "Да" ? (additionalActions || []) : [];
        payload.AdditionalActionsRequired = toSPRequired(reqToSave);
        payload.AdditionalActions = { __metadata: { type: "Collection(Edm.String)" }, results: actsToSave };
      } else {
        // Для прочих результатов не трогаем доп. поля (обратная совместимость)
      }

      // Determine if result is "Не найдена" - workflow for this outcome may expect no Status change (it sets status itself)
      const normalizedResult = String(resultValue).trim().toLowerCase();
      const isNotFoundResult = normalizedResult === "не найдена" || normalizedResult === "не найден" || normalizedResult === "не найдено";
      // try to set status to completed - but for "Не найдена" try without Status first to avoid workflow validation error on list e2c2953a...
      let payloadWithStatus = { ...payload };
      let targetStatus = completedStatusValue || "Завершена";
      // If discovery mistakenly still gives "В процессе выполнения", force to "Завершена"
      if (targetStatus && String(targetStatus).toLowerCase().includes("в процессе")) {
        targetStatus = "Завершена";
      }
      // For "Не найдена", prefer payload without Status/PercentComplete first - workflow may handle status transition
      // We will try two strategies and let fallback logic handle
      let tryWithoutStatusFirst = isNotFoundResult;
      if (!tryWithoutStatusFirst) {
        payloadWithStatus.Status = targetStatus;
        payloadWithStatus.PercentComplete = 1;
      }

      const headers = {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
        "IF-MATCH": serverEtag,
        "X-HTTP-Method": "MERGE",
      };

      const postUpdate = async (body, etagOverride) => {
        const h = etagOverride ? { ...headers, "IF-MATCH": etagOverride } : headers;
        return apiClient.post(`${TASKS_LIST_API}/items(${task.Id})`, body, { headers: h });
      };

      // For NotFound, first try without Status to see if workflow succeeds, then fall back to with Status
      if (tryWithoutStatusFirst) {
        try {
          await postUpdate(payload);
          // if success without Status, still try to set Status afterwards if needed - but don't fail workflow
          // Optionally update Status in second call if task still not completed
          try {
            const check = await apiClient.get(`${TASKS_LIST_API}/items(${task.Id})?$select=Status,PercentComplete`, { headers: { Accept: "application/json;odata=verbose" } });
            const curStatus = check?.data?.d?.Status;
            const curPc = check?.data?.d?.PercentComplete;
            if (!isCompletedStatus(curStatus, curPc)) {
              // Task still not marked completed, try to set Status now with "*"
              await postUpdate({ __metadata: { type: et }, Status: targetStatus, PercentComplete: 1 }, "*");
            }
          } catch {}
          // success path for NotFound without Status
        } catch (eNoStatus) {
          // If payload without Status fails (e.g., 412 or field error), fall back to with Status
          console.warn("NotFound without Status failed, trying with Status", eNoStatus?.response?.data);
          payloadWithStatus.Status = targetStatus;
          payloadWithStatus.PercentComplete = 1;
          try {
            await postUpdate(payloadWithStatus);
          } catch (e) {
            const statusCode = e?.response?.status;
            if (statusCode === 412) {
              notify(`Задача #${task.Id} уже изменена другим пользователем. Обновите список.`, { severity: "warning" });
              await loadTasks();
              throw e;
            }
            const msg = String(e?.response?.data?.error?.message?.value || e?.response?.data || e?.message || "").toLowerCase();
            // Type mismatch: пользовательское поле AdditionalActionsRequired булевое, а мы отправили строку (или наоборот)
            if (msg.includes("edm.boolean") || (msg.includes("boolean") && msg.includes("additional"))) {
              console.warn("AdditionalActionsRequired type mismatch (expected Boolean, got String), retry with Boolean", msg);
              try {
                const flip = { ...payload };
                // Конвертируем в Boolean
                if (_isFound) {
                  flip.AdditionalActionsRequired = (additionalRequired || "Нет") === "Да" ? true : false;
                } else if (_isNotFound) {
                  flip.AdditionalActionsRequired = false;
                }
                const flipWithStatus = { ...flip, Status: targetStatus, PercentComplete: 1 };
                // Пробуем с Boolean
                await postUpdate(_isNotFound ? flip : flipWithStatus, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                invalidate("/items");
                setTimeout(() => loadTasks({ silent: true }), 600);
                return;
              } catch (eFlip) {
                const m2 = String(eFlip?.response?.data?.error?.message?.value || eFlip?.message || "").toLowerCase();
                console.warn("Flip to Boolean also failed", m2);
              }
            }
            if (msg.includes("edm.string") || (msg.includes("choice") && msg.includes("additional")) || msg.includes("edm.choice")) {
              console.warn("AdditionalActionsRequired type mismatch (expected String, got Boolean), retry with String", msg);
              try {
                const flip = { ...payload };
                if (_isFound) {
                  flip.AdditionalActionsRequired = additionalRequired || "Нет";
                } else if (_isNotFound) {
                  flip.AdditionalActionsRequired = null;
                }
                const flipWithStatus = { ...flip, Status: targetStatus, PercentComplete: 1 };
                await postUpdate(_isFound ? flipWithStatus : flip, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                invalidate("/items");
                setTimeout(() => loadTasks({ silent: true }), 600);
                return;
              } catch (eFlip2) {
                console.warn("Flip to String also failed", String(eFlip2?.message||"").toLowerCase());
              }
            }
            // Type mismatch: пользовательское поле AdditionalActionsRequired булевое, а мы отправили строку (или наоборот)
            if (msg.includes("edm.boolean") || (msg.includes("boolean") && msg.includes("additional"))) {
              console.warn("AdditionalActionsRequired type mismatch (expected Boolean, got String), retry with Boolean", msg);
              try {
                const flip = { ...payload };
                // Конвертируем в Boolean
                if (_isFound) {
                  flip.AdditionalActionsRequired = (additionalRequired || "Нет") === "Да" ? true : false;
                } else if (_isNotFound) {
                  flip.AdditionalActionsRequired = false;
                }
                const flipWithStatus = { ...flip, Status: targetStatus, PercentComplete: 1 };
                // Пробуем с Boolean
                await postUpdate(_isNotFound ? flip : flipWithStatus, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                invalidate("/items");
                setTimeout(() => loadTasks({ silent: true }), 600);
                return;
              } catch (eFlip) {
                const m2 = String(eFlip?.response?.data?.error?.message?.value || eFlip?.message || "").toLowerCase();
                console.warn("Flip to Boolean also failed", m2);
              }
            }
            if (msg.includes("edm.string") || (msg.includes("choice") && msg.includes("additional")) || msg.includes("edm.choice")) {
              console.warn("AdditionalActionsRequired type mismatch (expected String, got Boolean), retry with String", msg);
              try {
                const flip = { ...payload };
                if (_isFound) {
                  flip.AdditionalActionsRequired = additionalRequired || "Нет";
                } else if (_isNotFound) {
                  flip.AdditionalActionsRequired = null;
                }
                const flipWithStatus = { ...flip, Status: targetStatus, PercentComplete: 1 };
                await postUpdate(_isFound ? flipWithStatus : flip, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                invalidate("/items");
                setTimeout(() => loadTasks({ silent: true }), 600);
                return;
              } catch (eFlip2) {
                console.warn("Flip to String also failed", String(eFlip2?.message||"").toLowerCase());
              }
            }
            if (msg.includes("additionalactions")) {
              console.warn("AdditionalActions field missing, retry without it", msg);
              try {
                const clean = { ...payload };
                delete clean.AdditionalActionsRequired;
                delete clean.AdditionalActions;
                const cleanWithStatus = { ...clean, Status: targetStatus, PercentComplete: 1 };
                await postUpdate(cleanWithStatus, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                invalidate("/items");
                setTimeout(() => loadTasks({ silent: true }), 600);
                return;
              } catch (eClean) {
                try {
                  const clean2 = { ...payload };
                  delete clean2.AdditionalActionsRequired;
                  delete clean2.AdditionalActions;
                  await postUpdate(clean2, "*");
                  notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                  invalidate("/items");
                  setTimeout(() => loadTasks({ silent: true }), 600);
                  return;
                } catch {}
              }
            }
            const isFieldError = msg.includes("status") || msg.includes("состояние") || msg.includes("percent") || msg.includes("percentcomplete");
            if (isFieldError) {
              try {
                const onlyStatus = { ...payload, Status: targetStatus };
                await postUpdate(onlyStatus, "*");
              } catch (e2) {
                if (e2?.response?.status === 412) {
                  notify(`Конфликт изменения задачи #${task.Id} — уже выполнена другим пользователем.`, { severity: "warning" });
                  await loadTasks();
                  throw e2;
                }
                try {
                  const onlyPercent = { ...payload, PercentComplete: 1 };
                  await postUpdate(onlyPercent, "*");
                } catch (e3) {
                  if (e3?.response?.status === 412) {
                    notify(`Конфликт изменения задачи #${task.Id}.`, { severity: "warning" });
                    await loadTasks();
                    throw e3;
                  }
                  await postUpdate(payload, "*");
                }
              }
            } else {
              const altStatus = targetStatus === "Завершена" ? "Completed" : "Завершена";
              try {
                const altPayload = { ...payload, Status: altStatus, PercentComplete: 1 };
                await postUpdate(altPayload, "*");
              } catch (altErr) {
                if (altErr?.response?.status === 412) {
                  notify(`Задача #${task.Id} уже изменена другим пользователем.`, { severity: "warning" });
                  await loadTasks();
                  throw altErr;
                }
                await postUpdate(payload, "*");
              }
            }
          }
        }
      } else {
        try {
          await postUpdate(payloadWithStatus);
        } catch (e) {
          const statusCode = e?.response?.status;
          if (statusCode === 412) {
            notify(`Задача #${task.Id} уже изменена другим пользователем. Обновите список.`, { severity: "warning" });
            await loadTasks();
            throw e;
          }
          const msg = String(e?.response?.data?.error?.message?.value || e?.response?.data || e?.message || "").toLowerCase();
          if (msg.includes("additionalactions")) {
            console.warn("AdditionalActions field missing, retry without it", msg);
            try {
              const clean = { ...payload };
              delete clean.AdditionalActionsRequired;
              delete clean.AdditionalActions;
              const cleanWithStatus = { ...clean, Status: targetStatus, PercentComplete: 1 };
              await postUpdate(cleanWithStatus, "*");
              notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
              invalidate("/items");
              setTimeout(() => loadTasks({ silent: true }), 600);
              return;
            } catch (eClean) {
              try {
                const clean2 = { ...payload };
                delete clean2.AdditionalActionsRequired;
                delete clean2.AdditionalActions;
                await postUpdate(clean2, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                invalidate("/items");
                setTimeout(() => loadTasks({ silent: true }), 600);
                return;
              } catch {}
            }
          }
          const isFieldError = msg.includes("status") || msg.includes("состояние") || msg.includes("percent") || msg.includes("percentcomplete");
          if (isFieldError) {
            try {
              const onlyStatus = { ...payload, Status: targetStatus };
              await postUpdate(onlyStatus, "*");
            } catch (e2) {
              if (e2?.response?.status === 412) {
                notify(`Конфликт изменения задачи #${task.Id} — уже выполнена другим пользователем.`, { severity: "warning" });
                await loadTasks();
                throw e2;
              }
              try {
                const onlyPercent = { ...payload, PercentComplete: 1 };
                await postUpdate(onlyPercent, "*");
              } catch (e3) {
                if (e3?.response?.status === 412) {
                  notify(`Конфликт изменения задачи #${task.Id}.`, { severity: "warning" });
                  await loadTasks();
                  throw e3;
                }
                await postUpdate(payload, "*");
              }
            }
          } else {
            const altStatus = targetStatus === "Завершена" ? "Completed" : "Завершена";
            try {
              const altPayload = { ...payload, Status: altStatus, PercentComplete: 1 };
              await postUpdate(altPayload, "*");
            } catch (altErr) {
              if (altErr?.response?.status === 412) {
                notify(`Задача #${task.Id} уже изменена другим пользователем.`, { severity: "warning" });
                await loadTasks();
                throw altErr;
              }
              await postUpdate(payload, "*");
            }
          }
        }
      }

      notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
      // already optimistically updated — invalidate TanStack + sp/cache
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      invalidate("/items");
      setTimeout(() => loadTasks({ silent: true }), 600);
    } catch (e) {
      console.error("complete task error", e);
      const msg = e?.response?.data?.error?.message?.value || e?.message || "Ошибка обновления задачи";
      notify(msg, { severity: "error" });
      // rollback optimistic (включая доп. действия) — через TanStack
      queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ResultSearchTHU: prevTaskSnapshot.ResultSearchTHU, Location1: prevTaskSnapshot.Location1, AdditionalActionsRequired: prevTaskSnapshot.AdditionalActionsRequired, AdditionalActions: prevTaskSnapshot.AdditionalActions, Status: prevTaskSnapshot.Status, PercentComplete: prevTaskSnapshot.PercentComplete, Modified: prevTaskSnapshot.Modified } : t)) : prev);
      setElementTaskMatch((prev) => (prev && prev.Id === task.Id ? { ...prev, ResultSearchTHU: prevTaskSnapshot.ResultSearchTHU, Location1: prevTaskSnapshot.Location1, AdditionalActionsRequired: prevTaskSnapshot.AdditionalActionsRequired, AdditionalActions: prevTaskSnapshot.AdditionalActions, Status: prevTaskSnapshot.Status, PercentComplete: prevTaskSnapshot.PercentComplete, Modified: prevTaskSnapshot.Modified } : prev));
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
      setLocationDialogOpen(false);
      setConfirmNotFoundOpen(false);
      setPendingTask(null);
    }
  }, [entityType, completedStatusValue, additionalRequiredIsBoolean, currentUserId, currentUserTitle, notify, loadTasks, pendingResult]);

  const handleResultClick = useCallback((task, resultValue) => {
    const normalized = String(resultValue).trim().toLowerCase();
    const isFoundExact = normalized === "найден" || normalized === "найдена";
    const isNotFoundExact = normalized === "не найдена" || normalized === "не найден" || normalized === "не найдено";
    if (isFoundExact) {
      setPendingTask(task);
      setPendingResult(resultValue);
      setLocationComment("");
      {
        const defPending = fieldDefaultActions !== null ? [...fieldDefaultActions] : (getCachedAdditionalActionsDefaultSync() !== null ? [...getCachedAdditionalActionsDefaultSync()] : ["Отправить ЕО в OTM"]);
        setPendingAdditionalActions(Array.isArray(task.AdditionalActions) && task.AdditionalActions.length ? [...task.AdditionalActions] : defPending);
      }
      setPendingCustomAction("");
      setPendingAdditionalError("");
      setLocationDialogOpen(true);
    } else if (isNotFoundExact) {
      setPendingTask(task);
      setPendingResult(resultValue);
      setConfirmNotFoundOpen(true);
    } else {
      // Прочие результаты — без доп. действий
      completeTask(task, resultValue, undefined, "", []);
    }
  }, [fieldDefaultActions, completeTask]);

  const handleLocationSubmit = (skip) => {
    if (!pendingTask) return;
    setPendingAdditionalError("");
    const comment = locationComment.trim();
    const actsToSave = pendingAdditionalActions;
    const reqToSave = pendingAdditionalActions.length > 0 ? "Да" : "Нет";
    if (skip) {
      // даже при пропуске локации сохраняем выбранные доп. действия
      completeTask(pendingTask, pendingResult, undefined, reqToSave, actsToSave);
    } else {
      completeTask(pendingTask, pendingResult, comment || undefined, reqToSave, actsToSave);
    }
  };

  const isHashMode = !!elementIdParam;

  // в hash-режиме — фоновое обновление только найденной задачи (без скрытия карточки, маленький лоадер в углу)
  // хуки до раннего return, иначе нарушение Rules of Hooks — с троттлингом focus 30с и диффом против мигания
  useEffect(() => {
    if (!isHashMode || !elementTaskMatch) return;
    let cancelled = false;
    const refreshHashTask = async () => {
      if (cancelled) return;
      setIsHashTaskRefreshing(true);
      try {
        // __noCache: polling в hash-режиме — всегда хотим свежие данные.
        const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,AdditionalActionsRequired,AdditionalActions,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,RelatedItems,WorkflowItemId&$expand=AssignedTo,Editor`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
        const raw = data?.d;
        if (!raw || cancelled) return;
        const mapped = mapRawTask(raw, { recipientField, scNumberField });
        setElementTaskMatch((prev) => {
          if (prev && prev.Modified === mapped.Modified && prev.Status === mapped.Status && prev.ResultSearchTHU === mapped.ResultSearchTHU && String(prev.PercentComplete) === String(mapped.PercentComplete) && prev.Location1 === mapped.Location1) return prev;
          return mapped;
        });
        queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => {
          if (!Array.isArray(prev)) return prev;
          const ex = prev.find((t) => t.Id === mapped.Id);
          if (ex && ex.Modified === mapped.Modified && ex.Status === mapped.Status && ex.ResultSearchTHU === mapped.ResultSearchTHU && String(ex.PercentComplete) === String(mapped.PercentComplete) && ex.Location1 === mapped.Location1) return prev;
          return prev.map((t) => t.Id === mapped.Id ? mapped : t);
        });
      } catch (e) {
        const msg = String(e?.response?.data?.error?.message?.value || e?.message || "").toLowerCase();
        if (msg.includes("additionalactions")) {
          try {
            const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,RelatedItems,WorkflowItemId&$expand=AssignedTo,Editor`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
            const raw = data?.d;
            if (!raw || cancelled) return;
            const mapped = mapRawTask(raw, { recipientField, scNumberField });
            setElementTaskMatch((prev) => {
              if (prev && prev.Modified === mapped.Modified && prev.Status === mapped.Status && prev.ResultSearchTHU === mapped.ResultSearchTHU && String(prev.PercentComplete) === String(mapped.PercentComplete)) return prev;
              return mapped;
            });
            queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames||[]).join(','), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(',')], (prev) => {
              if (!Array.isArray(prev)) return prev;
              const ex = prev.find((t) => t.Id === mapped.Id);
              if (ex && ex.Modified === mapped.Modified && ex.Status === mapped.Status && ex.ResultSearchTHU === mapped.ResultSearchTHU && String(ex.PercentComplete) === String(mapped.PercentComplete)) return prev;
              return prev.map((t) => t.Id === mapped.Id ? mapped : t);
            });
          } catch {}
        }
      } finally {
        if (!cancelled) setIsHashTaskRefreshing(false);
      }
    };
    // Адаптивный polling: пауза на скрытой вкладке + backoff при ошибках.
    const stop = createAdaptivePolling({
      fn: refreshHashTask,
      intervalMs: 60_000,
      maxBackoffMs: 5 * 60_000,
      pauseWhenHidden: true,
      onError: (e) => console.warn("[polling] refreshHashTask error, backing off:", e?.response?.status || e?.message),
    });
    const onFocus = () => {
      const now = Date.now();
      if (now - lastHashFocusRef.current < 30000) return;
      lastHashFocusRef.current = now;
      refreshHashTask();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener("focus", onFocus);
    };
  }, [isHashMode, elementTaskMatch?.Id]);

  // Poll удален — TanStack Query refetchInterval 60s уже в useQuery.
  // Оставлен только focus-throttle 30s: инвалидация TanStack кэша при возврате в окно
  useEffect(() => {
    if (!currentUserId) return;
    if (isHashMode) return;
    const onFocus2 = () => {
      const now = Date.now();
      if (now - lastFocusLoadRef.current < 30000) return;
      lastFocusLoadRef.current = now;
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    };
    window.addEventListener("focus", onFocus2);
    return () => window.removeEventListener("focus", onFocus2);
  }, [currentUserId, isHashMode, queryClient]);

  if (fieldsLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh", p: 3 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2, color: "text.secondary" }}>Загрузка задач...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, pt: { xs: 0.5, sm: 0.5 }, pb: { xs: 1, sm: 2 }, maxWidth: 720, width: { xs: "100%", sm: "calc(100vw - 32px)" }, minWidth: { xs: 0, sm: 280 }, mx: "auto", boxSizing: "border-box", display: "flex", flexDirection: "column", height: "calc(100vh - 8px)", minHeight: "calc(100vh - 8px)", maxHeight: "calc(100vh - 8px)", "@supports (height:100dvh)": { height: "calc(100dvh - 8px)", minHeight: "calc(100dvh - 8px)", maxHeight: "calc(100dvh - 8px)" }, overflowX: 'hidden', overflowY: 'hidden' }}>
      {isLocalRcActive && localRcValue && (
        <Box sx={{ mb: 1, p: 1.25, borderRadius: 2, bgcolor: "rgba(255,193,7,0.12)", border: "1px solid rgba(255,193,7,0.30)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: "#8d6e00", display:"flex", alignItems:"center", gap:1, minWidth:0, overflow:"hidden" }}>
            <Box component="span" sx={{ width:8, height:8, borderRadius:"50%", bgcolor:"#f9a825", flexShrink:0 }} />
            <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>Локальный РЦ: {localRcValue} <span style={{ fontWeight:400, color:"rgba(0,0,0,0.55)" }}>(для {localRcOffice})</span></span>
          </Typography>
          <Button size="small" variant="text" onClick={onClearLocalRc} sx={{ fontWeight:700, textTransform:"none", color:"#8d6e00", flexShrink:0, whiteSpace:"nowrap" }}>Сбросить</Button>
        </Box>
      )}
      <Box sx={{ position: "relative", zIndex: 10, bgcolor: "#ffffff", backdropFilter: "none", transform: "translateZ(0)", willChange: "transform", mx: 0, px: { xs: 1, sm: 2 }, pt: 1, pb: 1, mb: 1, borderRadius: '28px', border: "1px solid rgba(23,28,143,0.12)", boxShadow: "0 2px 8px rgba(23,28,143,0.06)", overflow: 'visible', boxSizing: 'border-box', flexShrink: 0, contain: "layout paint" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, mt: 0, pl: { xs: 6, sm: 6 } }}>
          <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 800, color: "#171c8f" }}>
            <AssignmentIcon /> {isHashMode ? `Элемент #${elementIdParam}` : "Задачи"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {isHashMode && (
              <Button size="small" variant="outlined" onClick={() => onClearElementHash?.()} sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: "none" }}>
                ← К списку
              </Button>
            )}
            <Tooltip title="Обновить">
              <IconButton onClick={loadTasks} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        {!isHashMode && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <Paper sx={{ borderRadius: '28px', overflow: "hidden", mb: 1.5, height: 56, minHeight: 56, maxHeight: 56, display: "flex", alignItems: "stretch", width: "100%", minWidth: 0, flexShrink: 0, alignSelf: "stretch", boxSizing: "border-box", flex: "0 0 auto", boxShadow: "0 2px 8px rgba(23,28,143,0.06)" }}>
              <Tabs
                value={tab}
                onChange={(_, v) => startTabTransition(() => setTab(v))}
                variant="fullWidth"
                textColor="primary"
                indicatorColor="primary"
                sx={{
                  height: 56,
                  minHeight: 56,
                  maxHeight: 56,
                  width: "100%",
                  minWidth: 0,
                  flex: 1,
                  "& .MuiTabs-flexContainer": { height: 56, minHeight: 56, alignItems: "stretch", width: "100%", display: "flex", flexWrap: "nowrap" },
                  "& .MuiTabs-scroller": { height: 56, width: "100%", minWidth: 0, flex: "1 1 auto", overflow: "hidden !important" },
                  "& .MuiTab-root": { fontWeight: 700, textTransform: "none", minHeight: 56, height: 56, maxHeight: 56, flex: "1 1 0", minWidth: 0, maxWidth: "50%", width: "50%", fontSize: "0.92rem", px: 1 },
                  "& .MuiTab-iconWrapper": { marginRight: 1 },
                  "& .MuiTabs-indicator": { height: 3 },
                }}
              >
                <Tab
                  icon={<HourglassEmptyIcon />}
                  iconPosition="start"
                  label={`Активные (${activeCount})`}
                  sx={{ opacity: isTabPending && tab !== 0 ? 0.6 : 1, flex: 1, minWidth: 0 }}
                />
                <Tab
                  icon={<CheckCircleOutlineIcon />}
                  iconPosition="start"
                  label={`Завершенные (${completedCount})`}
                  sx={{ opacity: isTabPending && tab !== 1 ? 0.6 : 1, flex: 1, minWidth: 0 }}
                />
              </Tabs>
            </Paper>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, minHeight: 32, height: 32, width: "100%", flexShrink: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>Группировка по ТК</Typography>
                <Box
                  onClick={() => setGroupingEnabled((v) => !v)}
                  sx={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    bgcolor: groupingEnabled ? "#171c8f" : "rgba(0,0,0,0.2)",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 150ms",
                    flexShrink: 0,
                  }}
                >
                  <Box sx={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    bgcolor: "white",
                    position: "absolute",
                    top: 3,
                    left: groupingEnabled ? 23 : 3,
                    transition: "left 150ms",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }} />
                </Box>
              </Box>
              {/* глобальные кнопки убраны — красивые аккордеоны */}
            </Box>
          </Box>
        )}
      </Box>
      {isHashMode ? (
        <Box sx={{ minHeight: 320, display: "block" }}>
          {(elementLoading || elementTaskSearching) ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 6, gap: 1.5 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">Загружаю элемент #{elementIdParam}...</Typography>
              <Typography variant="caption" color="text.secondary">Ищу связанную задачу...</Typography>
            </Box>
          ) : elementTaskMatch ? (
            <Box sx={{ position: "relative" }}>
              <TaskCard fieldDefaultActions={fieldDefaultActions}
                task={elementTaskMatch}
                isCompleted={isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete)}
                isOverdue={elementTaskMatch.DueDate ? new Date(elementTaskMatch.DueDate).getTime() < Date.now() : false}
                choices={choices}
                              resultFieldsMeta={resultFieldsMeta}
                              ctResultMap={ctResultMap}
                updatingId={updatingId}
                updatingAction={updatingAction}
                onResultClick={handleResultClick}
                onTakeInWork={handleTakeInWork}
                onComplete={completeTask}
                currentUserId={currentUserId}
                currentUserTitle={currentUserTitle}
                initialAction={elementActionParam}
              />
              {isHashTaskRefreshing && (
                <Box sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.9)", borderRadius: "50%", p: 0.5, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", display: "grid", placeItems: "center" }}>
                  <CircularProgress size={18} thickness={4} sx={{ color: "#171c8f" }} />
                </Box>
              )}
            </Box>
          ) : (
            <Paper sx={{ p: 3, borderRadius: 2, textAlign: "center", border: "1px solid rgba(255,193,7,0.25)", bgcolor: "rgba(255,193,7,0.06)" }}>
              <Typography sx={{ fontWeight: 700, color: "#8d6e00" }}>
                {elementError ? elementError : `Элемент #${elementIdParam} не найден`}
              </Typography>
              {elementData && (
                <Box sx={{ mt: 1.5, p: 1.5, bgcolor: "#fff", borderRadius: 1, border: "1px solid rgba(23,28,143,0.12)", textAlign: "left" }}>
                  <Typography variant="body2"><b>Id:</b> {elementData.Id} • THU: {elementData.THU || "—"}</Typography>
                  {elementData.Title && <Typography variant="body2"><b>Title:</b> {elementData.Title}</Typography>}
                  {elementData.Problems?.results && <Typography variant="body2"><b>Проблемы:</b> {elementData.Problems.results.join(", ")}</Typography>}
                </Box>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Задача для элемента #{elementIdParam} не найдена. Если она уже выполнена другим сотрудником — откройте вкладку «Завершённые» или найдите её в диалоге элемента.
              </Typography>
              <Button size="small" variant="outlined" sx={{ mt: 1.5, borderRadius: 1.5 }} onClick={() => onClearElementHash?.()}>
                К списку задач
              </Button>
            </Paper>
          )}
        </Box>
      ) : (
      <>


      <Box ref={virtualParentRef} sx={{ 
        flex: 1,
        minHeight: 0,
        overflowY: "auto", 
        overflowX: "hidden",
        pr: 0.5,
        mr: -0.5,
        pb: 2,
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(23,28,143,0.45) rgba(23,28,143,0.08)",
        "&::-webkit-scrollbar": { width: "10px", height: "10px" },
        "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(23,28,143,0.45)", borderRadius: "5px", border: "2px solid rgba(255,255,255,0.9)", minHeight: "40px" },
        "&::-webkit-scrollbar-track": { bgcolor: "rgba(23,28,143,0.08)", borderRadius: "5px", border: "1px solid rgba(23,28,143,0.04)" },
        "&::-webkit-scrollbar-thumb:hover": { bgcolor: "rgba(23,28,143,0.6)" },
      }}>
      {loading && tasks.length === 0 ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6, minHeight: 240 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2, color: "text.secondary" }}>Загрузка задач...</Typography>
        </Box>
      ) : error ? (
        <Paper sx={{ p: 3, borderRadius: 3, bgcolor: "rgba(229,57,53,0.06)", border: "1px solid rgba(229,57,53,0.2)" }}>
          <Typography color="error" sx={{ fontWeight: 700 }}>
            {error}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Проверьте, что список содержит поля AssignedTo, Body, ResultSearchTHU, Location1.
          </Typography>
          <Button sx={{ mt: 2 }} variant="outlined" onClick={loadTasks}>
            Повторить
          </Button>
        </Paper>
      ) : filteredTasks.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", minHeight: 120, display: "grid", placeItems: "center", width: "100%" }}>
          <Box>
            <Typography sx={{ color: "text.secondary", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>
              {tab === 0 ? "Нет активных задач" : "Нет завершенных задач"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.8rem", lineHeight: 1.2, display: "block", mt: 0.5 }}>
              {tab === 0 ? "Все задачи выполнены или не назначены на вас." : "Завершенные задачи появятся здесь."}
            </Typography>
          </Box>
        </Box>
      ) : (
        <Box sx={{ minHeight: 320, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", display: "block", opacity: isTabPending ? 0.7 : 1, transition: "opacity 120ms", flexShrink: 0 }}>
          <Stack spacing={1.5} sx={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
            {groupedTasks.map(([sc, groupTasks]) => {
              const overdueInGroup = groupTasks.filter((t) => { const d = new Date(t.DueDate); return t.DueDate && !isNaN(d) && d.getTime() < Date.now() && !isCompletedStatus(t.Status, t.PercentComplete); }).length;
              const hideHeader = groupingEnabled === false && sc === "Все";
              if (hideHeader) {
                if (useVirtual) {
                  const vItems = flatVirtualizer.getVirtualItems();
                  return (
                    <Box key={sc} sx={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", position: "relative" }}>
                      <Box sx={{ height: `${flatVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
                        {vItems.map((virtualItem) => {
                          const task = filteredTasks[virtualItem.index];
                          if (!task) return null;
                          const isCompleted = isCompletedStatus(task.Status, task.PercentComplete);
                          const isOverdue = task.DueDate ? new Date(task.DueDate).getTime() < Date.now() : false;
                          return (
                            <Box
                              key={virtualItem.key}
                              data-index={virtualItem.index}
                              ref={flatVirtualizer.measureElement}
                              sx={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualItem.start}px)`,
                                pb: 1.5,
                                boxSizing: "border-box",
                              }}
                            >
                              <TaskCard fieldDefaultActions={fieldDefaultActions}
                                task={task}
                                isCompleted={isCompleted}
                                isOverdue={isOverdue}
                                choices={choices}
                              resultFieldsMeta={resultFieldsMeta}
                              ctResultMap={ctResultMap}
                                updatingId={updatingId}
                                updatingAction={updatingAction}
                                onResultClick={handleResultClick}
                                onTakeInWork={handleTakeInWork}
                                onComplete={completeTask}
                                currentUserId={currentUserId}
                                currentUserTitle={currentUserTitle}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  );
                }
                return (
                  <Stack key={sc} spacing={1.5} sx={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
                    {groupTasks.map((task) => {
                      const isCompleted = isCompletedStatus(task.Status, task.PercentComplete);
                      const isOverdue = task.DueDate ? new Date(task.DueDate).getTime() < Date.now() : false;
                      return (
                        <TaskCard fieldDefaultActions={fieldDefaultActions}
                          key={task.Id}
                          task={task}
                          isCompleted={isCompleted}
                          isOverdue={isOverdue}
                          choices={choices}
                              resultFieldsMeta={resultFieldsMeta}
                              ctResultMap={ctResultMap}
                          updatingId={updatingId}
                          updatingAction={updatingAction}
                          onResultClick={handleResultClick}
                          onTakeInWork={handleTakeInWork}
                          onComplete={completeTask}
                          currentUserId={currentUserId}
                          currentUserTitle={currentUserTitle}
                        />
                      );
                    })}
                  </Stack>
                );
              }
              const isExpanded = expandedGroups.has(sc);
              return (
                <Accordion
                  key={sc}
                  expanded={isExpanded}
                  onChange={() => toggleGroup(sc)}
                  disableGutters
                  square={false}
                  elevation={0}
                  TransitionProps={{ timeout: 0 }}
                  slotProps={{ transition: { timeout: 0 } }}
                  sx={{
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    borderRadius: 1,
                    border: "1px solid rgba(23,28,143,0.12)",
                    background: "#fff",
                    overflow: "hidden",
                    "&:before": { display: "none" },
                    "&.Mui-expanded": { margin: "8px 0 0 0", borderRadius: 1 },
                    "&:first-of-type": { borderRadius: 1 },
                    "&:last-of-type": { borderRadius: 1 },
                    boxShadow: isExpanded ? "0 4px 16px rgba(23,28,143,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
                    transition: "box-shadow 150ms",
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ color: "#171c8f", fontSize: 22 }} />}
                    sx={{
                      minHeight: 56,
                      height: 56,
                      px: 1.5,
                      bgcolor: isExpanded ? "rgba(23,28,143,0.08)" : "rgba(23,28,143,0.04)",
                      borderRadius: isExpanded ? "4px 4px 0 0" : "4px",
                      "&:hover": { bgcolor: "rgba(23,28,143,0.09)" },
                      "& .MuiAccordionSummary-content": { margin: 0, alignItems: "center", gap: 1.25, minWidth: 0 },
                      "& .MuiAccordionSummary-expandIconWrapper": { color: "#171c8f", transition: "transform 150ms" },
                      transition: "background-color 150ms, border-radius 0ms",
                    }}
                  >
                    <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: "rgba(23,28,143,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <FolderIcon sx={{ color: "#171c8f", fontSize: 20 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: "#171c8f", fontSize: "0.95rem", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {sc}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                        {groupTasks.length} {groupTasks.length === 1 ? "задача" : groupTasks.length < 5 ? "задачи" : "задач"} {overdueInGroup > 0 ? `• ${overdueInGroup} просрочено` : ""}
                      </Typography>
                    </Box>
                    {overdueInGroup > 0 && <Chip label={`${overdueInGroup} просрочено`} size="small" color="error" sx={{ fontWeight: 700, height: 22, fontSize: "0.7rem", flexShrink: 0 }} />}
                    <Chip label={`${groupTasks.length}`} size="small" sx={{ fontWeight: 800, bgcolor: "#171c8f", color: "white", height: 22, minWidth: 28, flexShrink: 0 }} />
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1.5, pt: 1, bgcolor: "#fafaff", borderRadius: "0 0 4px 4px" }}>
                    <Stack spacing={1.5} sx={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
                      {groupTasks.map((task) => {
                        const isCompleted = isCompletedStatus(task.Status, task.PercentComplete);
                        const isOverdue = task.DueDate ? new Date(task.DueDate).getTime() < Date.now() : false;
                        return (
                          <TaskCard fieldDefaultActions={fieldDefaultActions}
                          key={task.Id}
                          task={task}
                          isCompleted={isCompleted}
                          isOverdue={isOverdue}
                          choices={choices}
                              resultFieldsMeta={resultFieldsMeta}
                              ctResultMap={ctResultMap}
                          updatingId={updatingId}
                          updatingAction={updatingAction}
                          onResultClick={handleResultClick}
                          onTakeInWork={handleTakeInWork}
                          onComplete={completeTask}
                          currentUserId={currentUserId}
                          currentUserTitle={currentUserTitle}
                        />
                        );
                      })}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
          {(loading || isBackgroundFetching) && tasks.length > 0 && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2, gap: 1, alignItems: "center" }}><CircularProgress size={20} /><Typography variant="caption" color="text.secondary">Обновление...</Typography></Box>
          )}
        </Box>
      )}
      </Box>

      </>
      )}
      {/* Диалог ввода комментария для "Найден" */}
      <Dialog
        open={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Где найдена ЕО?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Укажите местоположение, где была найдена ЕО для задачи #{pendingTask?.Id}. Вы можете пропустить этот шаг.
          </DialogContentText>
          <TextField
            autoFocus
            label="Местоположение (Location1)"
            placeholder="Например: Зона отгрузки, ряд 5, ячейка 12"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            value={locationComment}
            onChange={(e) => setLocationComment(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: 2 },
            }}
          />
          <Box sx={{ width: '100%', mt: 2 }}>
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  borderRadius: '28px',
                  backgroundColor: '#F1F3F4',
                  overflow: 'visible',
                  p: '3px',
                  '&:has(.Mui-expanded)': { borderRadius: '28px 28px 0 0' },
                }}
              >
                <Autocomplete
                  multiple
                  freeSolo
                  disableCloseOnSelect
                  options={ADDITIONAL_ACTIONS_STANDARD}
                  value={pendingAdditionalActions}
                  onChange={(event, newValue) => {
                    const cleaned = newValue.map((v) => String(v).trim()).filter(Boolean);
                    const uniq = [...new Set(cleaned)];
                    setPendingAdditionalActions(uniq);
                    if (pendingAdditionalError) setPendingAdditionalError("");
                    if (pendingCustomAction) setPendingCustomAction("");
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const { key, ...tagProps } = getTagProps({ index });
                      const isStandard = ADDITIONAL_ACTIONS_STANDARD.includes(option);
                      return (
                        <Chip
                          key={option}
                          label={option}
                          size="small"
                          {...tagProps}
                          sx={{
                            bgcolor: isStandard ? "#E3F2FD" : "#E8F5E9",
                            color: isStandard ? "#0D47A1" : "#1b5e20",
                            border: isStandard ? "1px solid #90CAF9" : "1px solid #A5D6A7",
                            fontWeight: 600,
                          }}
                        />
                      );
                    })
                  }
                  renderOption={(props, option) => {
                    const { key, ...rest } = props;
                    return (
                      <li key={key} {...rest} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px' }}>
                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, color: '#202124', lineHeight: 1.3, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{option}</Typography>
                      </li>
                    );
                  }}
                  sx={{
                    width: '100%',
                    '& .MuiOutlinedInput-root': {
                      minHeight: 56,
                      borderRadius: '24px',
                      backgroundColor: '#fff',
                      paddingRight: '12px !important',
                      '& fieldset': {
                        borderColor: 'rgba(0,0,0,0.10)',
                        borderWidth: '1px',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(0,0,0,0.14)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'rgba(0,0,0,0.14)',
                        borderWidth: '1px',
                      },
                      '&.Mui-focused fieldset legend': {
                        color: '#5f6368',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#5f6368',
                      fontSize: '0.95rem',
                      fontWeight: 500,
                      '&.Mui-focused': { color: '#5f6368' },
                      backgroundColor: '#fff',
                      padding: '0 6px',
                      borderRadius: '4px',
                    },
                    '&.Mui-expanded .MuiOutlinedInput-root': {
                      borderRadius: '24px',
                    },
                  }}
                  slotProps={{
                    popper: {
                      sx: {
                        marginTop: '-1px !important',
                      },
                    },
                  }}
                  slots={{
                    paper: (paperProps) => (
                      <Paper
                        {...paperProps}
                        elevation={0}
                        sx={{
                          borderRadius: '0 0 28px 28px',
                          backgroundColor: '#F1F3F4',
                          overflow: 'hidden',
                          padding: '3px',
                          border: '1px solid rgba(0,0,0,0.10)',
                          borderTop: 'none',
                          '& .MuiAutocomplete-listbox': {
                            backgroundColor: '#fff',
                            borderRadius: '24px',
                            padding: 0,
                            overflow: 'hidden',
                          },
                          '& .MuiAutocomplete-option': {
                            borderRadius: 0,
                            margin: 0,
                            padding: '10px 16px !important',
                            backgroundColor: '#fff',
                            '&[aria-selected="true"]': { backgroundColor: '#F1F3F4' },
                            '&.Mui-focused': { backgroundColor: '#fafafa' },
                          },
                        }}
                      />
                    ),
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Дополнительные действия"
                      placeholder={pendingAdditionalActions.length === 0 ? "Выберите из списка или введите своё" : "Добавить ещё..."}
                      size="small"
                      InputLabelProps={{ shrink: true, ...params.InputLabelProps }}
                    />
                  )}
                />
              </Box>
              {pendingAdditionalError && (
                <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 0.75 }}>{pendingAdditionalError}</Typography>
              )}
              {pendingAdditionalActions.length > 0 && !pendingAdditionalError && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>Выбрано: {pendingAdditionalActions.length}</Typography>
              )}
            </Box>
          {pendingAdditionalError && pendingAdditionalActions.length === 0 && (
            <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 1 }}>{pendingAdditionalError}</Typography>
          )}
          {pendingTask?.Body && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(23,28,143,0.06)", borderRadius: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "#171c8f" }}>
                Текст задачи:
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.5 }}>
                {pendingTask.Body}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => handleLocationSubmit(true)} color="inherit" sx={{ borderRadius: 2, fontWeight: 700 }} disabled={updatingId === pendingTask?.Id}>
            Пропустить
          </Button>
          <Button
            onClick={() => handleLocationSubmit(false)}
            variant="contained"
            sx={{
              borderRadius: 2,
              fontWeight: 700,
              backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)",
            }}
            disabled={updatingId === pendingTask?.Id}
          >
            {updatingId === pendingTask?.Id ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Отправить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог для хеш-роута элемента ProblemsPallet (#tasks/id=10) */}
      <Dialog
        open={elementDialogOpen}
        onClose={() => {
          setElementDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, maxHeight: "85vh" } }}
      >
        <DialogTitle sx={{ fontWeight: 800, pr: 6, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <AssignmentIcon sx={{ color: "#171c8f" }} />
          {elementData ? `ЕО ${elementData.THU || elementData.Title || ""} • #${elementData.Id}` : elementIdParam ? ( /^\d{17,18}$/.test(String(elementIdParam)) ? `ЕО ${elementIdParam}` : `Элемент #${elementIdParam}`) : "Элемент"}
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={() => setElementDialogOpen(false)} sx={{ ml: 1 }}><Typography sx={{ fontSize: 18, lineHeight: 1 }}>✕</Typography></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2, bgcolor: "#fafaff" }}>
          {(elementLoading || elementTaskSearching) ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 4, gap: 1.5 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">Загружаю элемент ProblemsPallet #{elementIdParam}...</Typography>
            </Box>
          ) : elementError && !elementTaskMatch && !elementData ? (
            <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: "rgba(229,57,53,0.06)", border: "1px solid rgba(229,57,53,0.18)", textAlign: "center" }}>
              <Typography sx={{ fontWeight: 700, color: "#b71c1c" }}>{elementError}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>Проверьте Id в ссылке (например, .../#tasks/id=10). Id берётся из ProblemsPallet, не из задач.</Typography>
              <Button variant="outlined" size="small" sx={{ mt: 1.5, borderRadius: 1.5 }} onClick={() => setElementDialogOpen(false)}>Закрыть</Button>
            </Box>
          ) : (
            <>
              {elementData && (
                <Paper elevation={0} sx={{ p: 1.5, borderRadius: 1.5, border: "1px solid rgba(23,28,143,0.12)", mb: 1.5, bgcolor: "#fff" }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: "#171c8f", display: "block", mb: 0.5 }}>Элемент ProblemsPallet</Typography>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ wordBreak: "break-word" }}><b>Id:</b> {elementData.Id} <span style={{ color: "rgba(0,0,0,0.35)", fontSize: "0.8em" }}>• THU: {elementData.THU || "—"} • DC_THU: {elementData.DC_THU || "—"}</span></Typography>
                    {elementData.Title && <Typography variant="body2" sx={{ wordBreak: "break-word" }}><b>Title:</b> {elementData.Title}</Typography>}
                    {elementData.Location1 && <Typography variant="body2"><b>Локация:</b> {elementData.Location1}</Typography>}
                    {elementData.Problems?.results && elementData.Problems.results.length > 0 && <Typography variant="body2"><b>Проблемы:</b> {elementData.Problems.results.join(", ")}</Typography>}
                    {elementData.Status && <Typography variant="body2"><b>Статус элемента:</b> {elementData.Status}</Typography>}
                    <Typography variant="caption" color="text.secondary">Создан: {elementData.Created ? new Date(elementData.Created).toLocaleString("ru-RU") : "—"} • Изменён: {elementData.Modified ? new Date(elementData.Modified).toLocaleString("ru-RU") : "—"}</Typography>
                    {elementData.Author?.Title && <Typography variant="caption" color="text.secondary">Автор: {elementData.Author.Title}</Typography>}
                  </Stack>
                  <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
                    Ссылка: <span style={{ wordBreak: "break-all" }}>{window.location.href}</span>
                  </Typography>
                </Paper>
              )}
              {elementError && elementData && (
                <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>{elementError}</Typography>
              )}
              {elementTaskMatch ? (
                <>
                  {isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete) ? (
                    <Box sx={{ mb: 1.5, p: 1.5, borderRadius: 1.5, bgcolor: "rgba(46,125,50,0.08)", border: "1px solid rgba(46,125,50,0.18)", display: "flex", gap: 1.25, alignItems: "center" }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(46,125,50,0.14)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <CheckCircleIcon sx={{ color: "#2e7d32", fontSize: 22 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: "#1b5e20", fontSize: "0.95rem", lineHeight: 1.2 }}>Задача выполнена</Typography>
                        <Typography variant="caption" sx={{ color: "#2e7d32", fontSize: "0.78rem", lineHeight: 1.3, display: "block", mt: 0.15, wordBreak: "break-word" }}>
                          Исполнитель: {elementTaskMatch.EditorTitle || elementTaskMatch.Editor || elementTaskMatch.AssignedTo || "—"} • {elementTaskMatch.Modified ? new Date(elementTaskMatch.Modified).toLocaleString("ru-RU") : "—"}{elementTaskMatch.ResultSearchTHU ? ` • ${elementTaskMatch.ResultSearchTHU}` : ""}
                        </Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#171c8f", mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                      <CheckCircleIcon sx={{ color: "#2e7d32", fontSize: 18 }} /> Связанная задача найдена
                    </Typography>
                  )}
                  <TaskCard fieldDefaultActions={fieldDefaultActions}
                    task={elementTaskMatch}
                    isCompleted={isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete)}
                    isOverdue={elementTaskMatch.DueDate ? new Date(elementTaskMatch.DueDate).getTime() < Date.now() : false}
                    choices={choices}
                              resultFieldsMeta={resultFieldsMeta}
                              ctResultMap={ctResultMap}
                    updatingId={updatingId}
                    updatingAction={updatingAction}
                    onResultClick={handleResultClick}
                    onTakeInWork={handleTakeInWork}
                    onComplete={completeTask}
                    currentUserId={currentUserId}
                    currentUserTitle={currentUserTitle}
                    initialAction={elementActionParam}
                  />
                  {elementActionParam && (
                    <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: elementActionParam === "found" ? "rgba(46,125,50,0.08)" : "rgba(229,57,53,0.08)", border: elementActionParam === "found" ? "1px solid rgba(46,125,50,0.18)" : "1px solid rgba(229,57,53,0.18)" }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: elementActionParam === "found" ? "#2e7d32" : "#c62828" }}>
                        URL action={elementActionParam} — следующий этап: подтверждение {elementActionParam === "found" ? "«Найдена»" : "«Не найдена»"} (пока нажмите кнопку в карточке).
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: "rgba(255,193,7,0.08)", border: "1px solid rgba(255,193,7,0.25)", textAlign: "center" }}>
                  <Typography sx={{ fontWeight: 700, color: "#8d6e00" }}>Задача для элемента #{elementIdParam} не найдена</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {elementData ? "Для этого элемента пока нет активной задачи. Возможно, она ещё не создана или уже выполнена другим сотрудником — проверьте вкладку «Завершённые»." : "Не удалось загрузить элемент. Проверьте ссылку и попробуйте ещё раз."}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    {elementData ? "Если вы открываете задачу по ссылке, а её уже закрыл другой пользователь — вы увидите карточку «Задача выполнена» выше. Иначе — задача появится после запуска workflow." : "Id берётся из ProblemsPallet. Для ЕО по THU (17-18 цифр) поиск идёт по THU."}
                  </Typography>
                  {elementError && <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>{elementError}</Typography>}
                  {elementActionParam && (
                    <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>action={elementActionParam} — второй этап (утверждение без задачи) пока требует наличия задачи.</Typography>
                  )}
                  <Button size="small" variant="outlined" sx={{ mt: 1.5, borderRadius: 1.5 }} onClick={() => { loadTasks({ silent: true });}}>Повторить поиск</Button>
                </Box>
              )}
              <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} onClick={() => { setElementDialogOpen(false); }}>
                  Закрыть
                </Button>
                {onClearElementHash && (
                  <Button size="small" variant="text" sx={{ borderRadius: 1.5, fontWeight: 700 }} onClick={() => { setElementDialogOpen(false); onClearElementHash?.(); }}>
                    Сбросить hash
                  </Button>
                )}
                {elementTaskMatch && (
                  <Button size="small" variant="contained" sx={{ borderRadius: 1.5, fontWeight: 800, ml: "auto", backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)" }} onClick={() => { setElementDialogOpen(false); try { const el = document.getElementById('task-' + elementTaskMatch.Id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {} }}>
                    Показать в списке
                  </Button>
                )}
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Подтверждение для "Не найдена" */}
      <Dialog
        open={confirmNotFoundOpen}
        onClose={() => setConfirmNotFoundOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Подтверждение</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите завершить задачу #{pendingTask?.Id} как «{pendingResult}»?
            Это действие нельзя отменить.
          </DialogContentText>
          {pendingTask?.Body && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(229,57,53,0.06)", borderRadius: 2, border: "1px solid rgba(229,57,53,0.15)" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "#b71c1c" }}>
                Текст задачи:
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.5 }}>
                {pendingTask.Body}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setConfirmNotFoundOpen(false)} color="inherit" sx={{ borderRadius: 2, fontWeight: 700 }} disabled={updatingId === pendingTask?.Id}>
            Отмена
          </Button>
          <Button
            onClick={() => {
              const task = pendingTask;
              const result = pendingResult;
              setConfirmNotFoundOpen(false);
              if (task) completeTask(task, result, undefined, "", []);
            }}
            variant="contained"
            color="error"
            sx={{ borderRadius: 2, fontWeight: 800, backgroundImage: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)" }}
            disabled={updatingId === pendingTask?.Id}
          >
            {updatingId === pendingTask?.Id ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Подтвердить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
