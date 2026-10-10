// src/features/tasks/components/TaskElementDialog.jsx
// PR2 — диалог хеш-роута ProblemsPallet (#tasks/id=10) — вынесен без смены логики
import React from "react";
import { Box, Paper, Typography, Button, Stack, CircularProgress, Dialog, DialogTitle, DialogContent, IconButton } from "@mui/material";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TaskCard from "./TaskCard";
import { isCompletedStatus } from "../../../tasks/status";
import AssignedToButtons from "./AssignedToButtons";

export default function TaskElementDialog({
  open,
  matchMode = null,
  onClose,
  elementData,
  elementIdParam,
  elementTaskMatch,
  elementLoading,
  elementTaskSearching,
  elementError,
  elementActionParam,
  taskConfiguration,
  fieldDefaultActions,
  choices,
  resultFieldsMeta,
  ctResultMap,
  updatingId,
  updatingAction,
  onResultClick,
  onTakeInWork,
  onComplete,
  currentUserId,
  currentUserTitle,
  onClearElementHash,
  onShowInList,
  loadTasks,
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "14px", maxHeight: "85vh" } }}>
      <DialogTitle sx={{ fontWeight: 800, pr: 6, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <AssignmentIcon sx={{ color: "#171c8f" }} />
        {elementData
          ? `ЕО ${elementData.THU || elementData.Title || ""} • #${elementData.Id}`
          : elementIdParam
            ? (/^\d{17,18}$/.test(String(elementIdParam)) ? `ЕО ${elementIdParam}` : matchMode === "task" ? `Задача #${elementIdParam}` : `Элемент #${elementIdParam}`)
            : "Элемент"}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}><Typography sx={{ fontSize: 18, lineHeight: 1 }}>✕</Typography></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2, bgcolor: "#fafaff" }}>
        {elementLoading || elementTaskSearching ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 4, gap: 1.5 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              {matchMode === "task" ? `Загружаю задачу #${elementIdParam}...` : `Загружаю элемент ProblemsPallet #${elementIdParam}...`}
            </Typography>
          </Box>
        ) : elementError && !elementTaskMatch && !elementData ? (
          <Box sx={{ p: 2, borderRadius: "10px", bgcolor: "rgba(229,57,53,0.06)", border: "1px solid rgba(229,57,53,0.18)", textAlign: "center" }}>
            <Typography sx={{ fontWeight: 700, color: "#b71c1c" }}>{elementError}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>Проверьте Id в ссылке (например, .../#tasks/id=10). Id берётся из ProblemsPallet, не из задач.</Typography>
            <Button variant="outlined" size="small" sx={{ mt: 1.5, borderRadius: "10px" }} onClick={onClose}>Закрыть</Button>
          </Box>
        ) : (
          <>
            {elementData && (
              <Paper elevation={0} sx={{ p: 1.5, borderRadius: "10px", border: "1px solid rgba(23,28,143,0.12)", mb: 1.5, bgcolor: "#fff" }}>
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
                <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>Ссылка: <span style={{ wordBreak: "break-all" }}>{window.location.href}</span></Typography>
              </Paper>
            )}
            {elementError && elementData && <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>{elementError}</Typography>}
            {elementTaskMatch ? (
              <>
                {isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete) ? (
                  <Box sx={{ mb: 1.5, p: 1.5, borderRadius: "10px", bgcolor: "rgba(46,125,50,0.08)", border: "1px solid rgba(46,125,50,0.18)", display: "flex", gap: 1.25, alignItems: "center" }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(46,125,50,0.14)", display: "grid", placeItems: "center", flexShrink: 0 }}><CheckCircleIcon sx={{ color: "#2e7d32", fontSize: 22 }} /></Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: "#1b5e20", fontSize: "0.95rem", lineHeight: 1.2 }}>Задача выполнена</Typography>
                      <Typography variant="caption" sx={{ color: "#2e7d32", fontSize: "0.78rem", lineHeight: 1.3, display: "block", mt: 0.15, wordBreak: "break-word" }}>Исполнитель: {elementTaskMatch.EditorTitle || elementTaskMatch.Editor || "—"} • Кому назначено: <AssignedToButtons task={elementTaskMatch} /> • {elementTaskMatch.Modified ? new Date(elementTaskMatch.Modified).toLocaleString("ru-RU") : "—"}{elementTaskMatch.ResultSearchTHU ? ` • ${elementTaskMatch.ResultSearchTHU}` : ""}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#171c8f", mb: 1, display: "flex", alignItems: "center", gap: 1 }}><CheckCircleIcon sx={{ color: "#2e7d32", fontSize: 18 }} /> Связанная задача найдена</Typography>
                )}
                <TaskCard
                  taskConfig={taskConfiguration.data}
                  fieldDefaultActions={fieldDefaultActions}
                  task={elementTaskMatch}
                  isCompleted={isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete)}
                  isOverdue={elementTaskMatch.DueDate ? new Date(elementTaskMatch.DueDate).getTime() < Date.now() : false}
                  choices={choices}
                  resultFieldsMeta={resultFieldsMeta}
                  ctResultMap={ctResultMap}
                  updatingId={updatingId}
                  updatingAction={updatingAction}
                  onResultClick={onResultClick}
                  onTakeInWork={onTakeInWork}
                  onComplete={onComplete}
                  currentUserId={currentUserId}
                  currentUserTitle={currentUserTitle}
                  initialAction={elementActionParam}
                />
                {elementActionParam && (
                  <Box sx={{ mt: 1, p: 1, borderRadius: "10px", bgcolor: elementActionParam === "found" ? "rgba(46,125,50,0.08)" : "rgba(229,57,53,0.08)", border: elementActionParam === "found" ? "1px solid rgba(46,125,50,0.18)" : "1px solid rgba(229,57,53,0.18)" }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: elementActionParam === "found" ? "#2e7d32" : "#c62828" }}>URL action={elementActionParam} — следующий этап: подтверждение {elementActionParam === "found" ? "«Найдена»" : "«Не найдена»"} (пока нажмите кнопку в карточке).</Typography>
                  </Box>
                )}
              </>
            ) : (
              <Box sx={{ p: 2, borderRadius: "10px", bgcolor: "rgba(255,193,7,0.08)", border: "1px solid rgba(255,193,7,0.25)", textAlign: "center" }}>
                <Typography sx={{ fontWeight: 700, color: "#8d6e00" }}>Задача для элемента #{elementIdParam} не найдена</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{elementData ? "Для этого элемента пока нет активной задачи. Возможно, она ещё не создана или уже выполнена другим сотрудником — проверьте вкладку «Завершённые»." : "Не удалось загрузить элемент. Проверьте ссылку и попробуйте ещё раз."}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>{elementData ? "Если вы открываете задачу по ссылке, а её уже закрыл другой пользователь — вы увидите карточку «Задача выполнена» выше. Иначе — задача появится после запуска workflow." : "Id берётся из ProblemsPallet. Для ЕО по THU (17-18 цифр) поиск идёт по THU."}</Typography>
                {elementError && <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>{elementError}</Typography>}
                {elementActionParam && <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>action={elementActionParam} — второй этап (утверждение без задачи) пока требует наличия задачи.</Typography>}
                <Button size="small" variant="outlined" sx={{ mt: 1.5, borderRadius: "10px" }} onClick={() => { loadTasks({ silent: true }); }}>Повторить поиск</Button>
              </Box>
            )}
            <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" sx={{ borderRadius: "10px", fontWeight: 700 }} onClick={onClose}>Закрыть</Button>
              {onClearElementHash && <Button size="small" variant="text" sx={{ borderRadius: "10px", fontWeight: 700 }} onClick={() => { onClose(); onClearElementHash?.(); }}>Сбросить hash</Button>}
              {elementTaskMatch && <Button size="small" variant="contained" sx={{ borderRadius: "10px", fontWeight: 800, ml: "auto", backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)" }} onClick={onShowInList}>Показать в списке</Button>}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
