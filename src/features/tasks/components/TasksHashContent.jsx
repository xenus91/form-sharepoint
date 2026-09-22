// src/features/tasks/components/TasksHashContent.jsx
// PR2 — hash-контент (лоадер / карточка / notFound) вынесен из TasksView без смены логики
import React from "react";
import { Box, Paper, Typography, Button, CircularProgress } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TaskCard from "./TaskCard";
import { isCompletedStatus } from "../../../tasks/status";

export default function TasksHashContent({
  elementLoading,
  elementTaskSearching,
  elementTaskMatch,
  elementData,
  elementError,
  elementIdParam,
  elementActionParam,
  isHashTaskRefreshing,
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
}) {
  if (elementLoading || elementTaskSearching) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6, gap: 1.5 }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">Загружаю элемент #{elementIdParam}...</Typography>
        <Typography variant="caption" color="text.secondary">Ищу связанную задачу...</Typography>
      </Box>
    );
  }
  if (elementTaskMatch) {
    return (
      <Box sx={{ position: "relative" }}>
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
        {isHashTaskRefreshing && (
          <Box sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.9)", borderRadius: "50%", p: 0.5, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", display: "grid", placeItems: "center" }}>
            <CircularProgress size={18} thickness={4} sx={{ color: "#171c8f" }} />
          </Box>
        )}
      </Box>
    );
  }
  return (
    <Paper sx={{ p: 3, borderRadius: 2, textAlign: "center", border: "1px solid rgba(255,193,7,0.25)", bgcolor: "rgba(255,193,7,0.06)" }}>
      <Typography sx={{ fontWeight: 700, color: "#8d6e00" }}>{elementError ? elementError : `Элемент #${elementIdParam} не найден`}</Typography>
      {elementData && (
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: "#fff", borderRadius: 1, border: "1px solid rgba(23,28,143,0.12)", textAlign: "left" }}>
          <Typography variant="body2"><b>Id:</b> {elementData.Id} • THU: {elementData.THU || "—"}</Typography>
          {elementData.Title && <Typography variant="body2"><b>Title:</b> {elementData.Title}</Typography>}
          {elementData.Problems?.results && <Typography variant="body2"><b>Проблемы:</b> {elementData.Problems.results.join(", ")}</Typography>}
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Задача для элемента #{elementIdParam} не найдена. Если она уже выполнена другим сотрудником — откройте вкладку «Завершённые» или найдите её в диалоге элемента.</Typography>
      <Button size="small" variant="outlined" sx={{ mt: 1.5, borderRadius: 1.5 }} onClick={() => onClearElementHash?.()}>К списку задач</Button>
    </Paper>
  );
}
