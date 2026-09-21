// src/features/tasks/components/TaskList.jsx
// Phase 16 — декомпозиция TasksView: список задач с группировкой, виртуализацией и карточками
// Изолирует рендер списка (Tabs + grouped Stack) от orchestration TasksView (fetch, complete, hash)

import React from "react";
import { Box, Paper, Typography, Button, Chip, CircularProgress, Stack, Accordion, AccordionSummary, AccordionDetails } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import TaskCard from "./TaskCard";
import { isCompletedStatus } from "../../../tasks/status";
import { extractTKNumberFromTask } from "../../../tasks/formatters";

const TaskList = React.memo(function TaskList({
  // data
  tasks = [],
  tab = 0,
  groupedTasks = [],
  filteredTasks = [],
  groupingEnabled = false,
  expandedGroups = new Set(),
  toggleGroup,
  useVirtual = false,
  flatVirtualizer = null,
  isTabPending = false,
  loading = false,
  error = "",
  isBackgroundFetching = false,
  // config / callbacks
  taskConfig = null,
  resultFieldsMeta = [],
  ctResultMap = new Map(),
  choices = [],
  fieldDefaultActions = null,
  updatingId = null,
  updatingAction = null,
  onResultClick,
  onTakeInWork,
  onComplete,
  currentUserId = null,
  currentUserTitle = "",
  onRetry,
}) {
  // virtualParentRef handled by parent Box sx overflow; no internal ref needed
  // empty / loading / error уже решает родитель, но дублируем для изоляции
  if (loading && tasks.length === 0) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6, minHeight: 240 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2, color: "text.secondary" }}>Загрузка задач...</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Paper sx={{ p: 3, borderRadius: 3, bgcolor: "rgba(229,57,53,0.06)", border: "1px solid rgba(229,57,53,0.2)" }}>
        <Typography color="error" sx={{ fontWeight: 700 }}>{error}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Проверьте, что список содержит поля AssignedTo, Body, ResultSearchTHU, Location1.
        </Typography>
        <Button sx={{ mt: 2 }} variant="outlined" onClick={onRetry}>Повторить</Button>
      </Paper>
    );
  }
  if (filteredTasks.length === 0) {
    return (
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
    );
  }

  return (
    <Box sx={{ minHeight: 320, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", display: "block", opacity: isTabPending ? 0.7 : 1, transition: "opacity 120ms", flexShrink: 0 }}>
      <Stack spacing={1.5} sx={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
        {groupedTasks.map(([sc, groupTasks]) => {
          const overdueInGroup = groupTasks.filter((t) => {
            const d = new Date(t.DueDate);
            return t.DueDate && !isNaN(d) && d.getTime() < Date.now() && !isCompletedStatus(t.Status, t.PercentComplete);
          }).length;
          const hideHeader = groupingEnabled === false && sc === "Все";
          if (hideHeader) {
            if (useVirtual && flatVirtualizer) {
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
                          <TaskCard taskConfig={taskConfig} fieldDefaultActions={fieldDefaultActions}
                            task={task}
                            isCompleted={isCompleted}
                            isOverdue={isOverdue}
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
                    <TaskCard taskConfig={taskConfig} fieldDefaultActions={fieldDefaultActions}
                      key={task.Id}
                      task={task}
                      isCompleted={isCompleted}
                      isOverdue={isOverdue}
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
                      <TaskCard taskConfig={taskConfig} fieldDefaultActions={fieldDefaultActions}
                        key={task.Id}
                        task={task}
                        isCompleted={isCompleted}
                        isOverdue={isOverdue}
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
  );
});

export default TaskList;
