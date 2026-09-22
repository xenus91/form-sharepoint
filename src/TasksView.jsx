/* eslint-disable react/prop-types, no-empty, no-useless-catch */
import React, { useEffect, useState, useCallback, useMemo, useTransition } from "react";
// DBG helper
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return false; }catch(_e){ void _e; return false; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch{} };

import apiClient, { invalidate } from "./api";
import { buildTaskIndex, findInIndex } from "./utils/taskIndex";
import { createAdaptivePolling } from "./utils/polling";
import { mapRawTask } from "./tasks/mapping";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTasksQuery } from "./tasks/useTasksQuery";
import { fetchResultFieldsMeta, fetchContentTypeResultMap, getResultFieldForTask, getResultChoicesForTask } from "./tasks/resultField";
import { getResultUiConfig } from "./tasks/resultConfig";
import { HASH_LOG, HASH_WARN } from "./tasks/log";
import { searchTaskByRelatedItem } from "./tasks/hashSearch";
import { fetchProblemsPalletItem } from "./tasks/problemsPallet";
import {
  getGroupIdsFromDistribution,
  resolveDistributionViaDcEmail,
  getTasksListFieldsOverview,
} from "./tasks/distribution";
import { TASKS_LIST_API, ADDITIONAL_ACTIONS_STANDARD, fetchAdditionalActionsDefault, getCachedAdditionalActionsDefaultSync, HASH_POLL_SELECT, HASH_POLL_EXPAND } from "./tasks/config";
import { resolveTaskResultDefinition } from "./services/taskResultDefinitions";
import { useTaskConfiguration } from "./features/tasks/hooks/useTaskConfiguration";
import { useCurrentUser } from "./features/tasks/hooks/useCurrentUser";
import { useDistribution } from "./features/tasks/hooks/useDistribution";
import { useTasksMetadata } from "./features/tasks/hooks/useTasksMetadata";
// import { useTasksFiltering } from "./features/tasks/hooks/useTasksFiltering";
import TasksHeader from "./features/tasks/components/TasksHeader";
import TasksTabs from "./features/tasks/components/TasksTabs";
import TasksGroupingToggle from "./features/tasks/components/TasksGroupingToggle";
import TasksHashContent from "./features/tasks/components/TasksHashContent";
import TaskLocationDialog from "./features/tasks/components/TaskLocationDialog";
import TaskConfirmNotFoundDialog from "./features/tasks/components/TaskConfirmNotFoundDialog";
import TaskElementDialog from "./features/tasks/components/TaskElementDialog";
import { useHashElement } from "./features/tasks/hooks/useHashElement";
import { useTaskMutations } from "./features/tasks/hooks/useTaskMutations"; // PR1 следующий шаг
import AdditionalActionsField from "./features/tasks/components/AdditionalActionsField";
import TaskCard from "./features/tasks/components/TaskCard";
import TaskList from "./features/tasks/components/TaskList";
import {
  formatDueLeft,
  formatDueDateFull,
  formatSolveTime,
  extractTKNumberFromTask,
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
  Autocomplete,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import { keyframes } from "@emotion/react";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
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

// isCompletedStatus / isNotStartedStatus / isInProgressStatus — все импортированы из "./tasks/status".

// keyframes для celebrate-анимаций (используются TaskCard выше). Должны быть
// на module-scope — keyframes-вызов из @emotion/react кэширует результат
// и стабилен между рендерами, поэтому достаточно одного объявления.

// eslint-disable-next-line no-unused-vars
export default function TasksView({ userProfile: propUserProfile, currentUserId: propCurrentUserId, onBack: _onBack, onCountChange, initialElementId, initialElementAction, onClearElementHash, isLocalRcActive, localRcValue, localRcOffice, onClearLocalRc }) {
  const { notify } = useNotifications();
  // fieldsLoading + taskConfiguration теперь внутри useTasksMetadata (PR1)
  const [isTabPending, startTabTransition] = useTransition();
  const [_isDataPending, _startDataTransition] = useTransition(); // eslint-disable-line no-unused-vars
  const lastFocusLoadRef = React.useRef(Date.now());
  const lastHashFocusRef = React.useRef(Date.now());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set()); // SCNumber -> expanded
  const virtualParentRef = React.useRef(null); // для виртуализации списка
  // PR1: hooks extraction — currentUser + distribution + metadata (fieldsLoading etc.)
  const {
    currentUserId, setCurrentUserId,
    currentUserTitle, setCurrentUserTitle,
    userOfficeDept, setUserOfficeDept,
    taskFieldNames, setTaskFieldNames,
    recipientField, setRecipientField,
    scNumberField, setScNumberField,
  } = useCurrentUser({ propUserProfile, propCurrentUserId });
  const { distribution, setDistribution } = useDistribution(userOfficeDept);
  const {
    fieldsLoading, setFieldsLoading,
    taskConfiguration,
    choices, setChoices,
    statusChoices, setStatusChoices,
    completedStatusValue, setCompletedStatusValue,
    inProgressStatusValue, setInProgressStatusValue,
    entityType, setEntityType,
    resultFieldsMeta, setResultFieldsMeta,
    ctResultMap, setCtResultMap,
    additionalRequiredIsBoolean, setAdditionalRequiredIsBoolean,
    fieldDefaultActions, setFieldDefaultActions,
  } = useTasksMetadata();
  const [groupingEnabled, setGroupingEnabled] = useState(false);
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
  } = useTasksQuery({
    currentUserId,
    distribution,
    taskFieldNames,
    recipientField,
    scNumberField,
    resultFieldInternalNames,
    enabled: tasksQueryEnabled,
  });

  // enrich теперь внутри useTasksQuery (батч), здесь только expandedGroups для новых ТК
  useEffect(() => {
    const data = tasksData;
    if (!data || data.length === 0) return;
    // expandedGroups уже обновляется в onCountChange эффекте, но для быстрого раскрытия новых ТК — добавим лёгкий дифф
    // (enrich батч уже внутри хука, не дублируем сетевые запросы)
  }, [tasksDataUpdatedAt]);

  const tasks = tasksData ?? [];
  // DBG: polling / loading / completion-type diagnostics
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(()=>{ if(!__DBG_ENABLED__) return; try{
    const sample = (tasks||[]).slice(0,4).map(x=>({Id:x.Id, Title:(x.Title||'').slice(0,30), Status:x.Status, CT:String(x.ContentTypeId||'').slice(-18), Recipient:x.Recipient||'∅', SC:x.SCNumber||'∅', THU:x.THU||'∅', Related:!!x.RelatedItems, ResultTHU:x.ResultSearchTHU||x.ResultValue||'∅'}));
    const comp = (tasks||[]).filter(x=>{ try{ const k=Object.keys(x.raw||{}); return k.some(kk=>kk.toLowerCase().includes('complete')) || String(x.Title||'').toLowerCase().includes('заверш'); }catch{return false;}});
    console.log("[DBG:TasksView] tasks update", { tasksLen: tasks.length, fieldsLoading, tasksQueryEnabled, isTasksLoading, isTasksFetching, tasksDataUpdatedAt, resultFieldInternalNames, sample, completionCount: comp.length, completionSample: comp.slice(0,3).map(x=>({Id:x.Id, Title:x.Title, CT:x.ContentTypeId, rawKeys:Object.keys(x.raw||{}).filter(k=>k.toLowerCase().includes('result'))})) });
  }catch(_e){ void _e; }
  }, [tasksDataUpdatedAt, tasks?.length, fieldsLoading, isTasksLoading, isTasksFetching, resultFieldInternalNames.join(',')]);

  const loading = isTasksLoading && tasks.length===0;
  const isBackgroundFetching = isTasksFetching && !isTasksLoading;
  const error = tasksQueryError ? "Не удалось загрузить задачи." : "";
  const [tab, setTab] = useState(0); // 0 = active, 1 = completed

  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [confirmNotFoundOpen, setConfirmNotFoundOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [pendingResult, setPendingResult] = useState("");
  const [locationComment, setLocationComment] = useState("");
  // Доп. действия для диалога Найдена (legacy путь через handleResultClick) — теперь Default из TaskActionDefinitions
  const [pendingAdditionalActions, setPendingAdditionalActions] = useState([]);
  // const pendingAdditionalRequired = pendingAdditionalActions.length > 0 ? "Да" : "Нет"; // eslint unused
  // fieldDefaultActions теперь внутри useTasksMetadata (PR1) — эффект перенесён в хук
  // useEffect для дефолта удалён
  const [pendingCustomAction, setPendingCustomAction] = useState("");
  const [pendingAdditionalError, setPendingAdditionalError] = useState("");
  const { updatingId, setUpdatingId, updatingAction, setUpdatingAction, handleTakeInWork, completeTask } = useTaskMutations({
    entityType,
    completedStatusValue,
    inProgressStatusValue,
    additionalRequiredIsBoolean,
    resultFieldsMeta,
    ctResultMap,
    taskConfiguration,
    fieldDefaultActions,
    currentUserId,
    currentUserTitle,
    distribution,
    taskFieldNames,
    recipientField,
    scNumberField,
    resultFieldInternalNames,
    queryClient,
    loadTasks,
    notify,
    setElementTaskMatch,
    pendingResult,
  });
  // PR2: hash-роут вынесен  // PR2: hash-роут вынесен в useHashElement (RelatedItems 1→1, CAML+OData, guards)
  const {
    elementIdParam, setElementIdParam,
    elementActionParam, setElementActionParam,
    elementDialogOpen, setElementDialogOpen,
    elementLoading, setElementLoading,
    elementTaskSearching, setElementTaskSearching,
    isHashTaskRefreshing, setIsHashTaskRefreshing,
    elementData, setElementData,
    elementTaskMatch, setElementTaskMatch,
    elementError, setElementError,
    elementNotFound, setElementNotFound,
    autoTabAppliedForElement, setAutoTabAppliedForElement,
    taskIndex, findTaskByElementId,
    isHashMode,
  } = useHashElement({ initialElementId, initialElementAction, tasks, distribution, currentUserId, tab, setTab, isTabPending, startTabTransition });
const activeCount = useMemo(() => tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete)).length, [tasks]);

  const filteredTasks = useMemo(() => {
    if (tab === 0) return tasks.filter((t) => !isCompletedStatus(t.Status, t.PercentComplete));
    return tasks.filter((t) => isCompletedStatus(t.Status, t.PercentComplete));
  }, [tasks, tab]);

  // Хелпер для получения свежих choices по ContentType для конкретной задачи
  const _getTaskChoices = useCallback((taskObj) => { // eslint-disable-line no-unused-vars
    const meta = getResultFieldForTask(taskObj, ctResultMap, resultFieldsMeta);
    if (meta?.choices && meta.choices.length > 0) return meta.choices;
    return choices;
  }, [ctResultMap, resultFieldsMeta, choices]);
  const _getTaskFieldMeta = useCallback((taskObj) => { // eslint-disable-line no-unused-vars
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

  const _expandAll = useCallback(() => { // eslint-disable-line no-unused-vars
    setExpandedGroups(new Set(groupedTasks.map(([sc]) => sc)));
  }, [groupedTasks]);

  const _collapseAll = useCallback(() => { // eslint-disable-line no-unused-vars
    setExpandedGroups(new Set());
  }, []);



  // handleTakeInWork / completeTask теперь в useTaskMutations (PR2)

  const handleResultClick = useCallback((task, resultValue) => {
    const normalized = String(resultValue).trim().toLowerCase();
    const isFoundExact = normalized === "найден" || normalized === "найдена";
    const isNotFoundExact = normalized === "не найдена" || normalized === "не найден" || normalized === "не найдено";
    if (isFoundExact) {
      setPendingTask(task);
      setPendingResult(resultValue);
      setLocationComment("");
      {
        // Приоритет: TaskActionDefinitions Default (per CT) → поле DefaultValue
        const ctIdForPending = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
        const cfgForPending = taskConfiguration.data?.ctConfigMap?.get(ctIdForPending) || taskConfiguration.data?.ctConfigMap?.get("__default");
        let defPending;
        if (cfgForPending && cfgForPending.defaultActions !== null && cfgForPending.defaultActions !== undefined) {
          defPending = [...cfgForPending.defaultActions];
        } else {
          defPending = fieldDefaultActions !== null ? [...fieldDefaultActions] : (getCachedAdditionalActionsDefaultSync() !== null ? [...getCachedAdditionalActionsDefaultSync()] : []);
        }
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
  }, [fieldDefaultActions, taskConfiguration.data, completeTask]);

  const handleLocationSubmit = (skip) => {
    if (!pendingTask) return;
    setPendingAdditionalError("");
    const comment = locationComment.trim();
    // Уважать ShowAdditionalActions из TaskResultDefinitions (Show=Нет → доп скрыты)
    const ctForSubmit = String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim();
    const defForSubmit = taskConfiguration.data?.taskResultDefinitions ? resolveTaskResultDefinition(pendingResult, ctForSubmit, taskConfiguration.data.taskResultDefinitions) : null;
    const showForSubmit = defForSubmit ? !!defForSubmit.showAdditionalActions : true;
    const actsToSaveRaw = showForSubmit ? pendingAdditionalActions : [];
    const reqToSave = showForSubmit ? (pendingAdditionalActions.length > 0 ? "Да" : "Нет") : "Нет";
    if (skip) {
      // даже при пропуске локации сохраняем выбранные доп. действия (если Show=Да)
      completeTask(pendingTask, pendingResult, undefined, reqToSave, actsToSaveRaw);
    } else {
      completeTask(pendingTask, pendingResult, comment || undefined, reqToSave, actsToSaveRaw);
    }
  };

  // isHashMode from useHashElement

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
        const _hashSelect = HASH_POLL_SELECT;
        const _hashExpand = HASH_POLL_EXPAND ? `&$expand=${HASH_POLL_EXPAND}` : "";
        // EndJob удалён — если вдруг в HASH_POLL_SELECT попадёт EndJob из кэша, фильтруем
        const _cleanHashSelect = _hashSelect.split(",").filter((f) => f.trim().toLowerCase() !== "endjob").join(",");
        // Доп. защита: если _cleanHashSelect пуст, используем минимум Id,Modified
        const _finalHashSelect = _cleanHashSelect.trim() ? _cleanHashSelect : "Id,Modified";
        let _hashData = null;
        try {
          const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=${_finalHashSelect}${_hashExpand}`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
          _hashData = data;
        } catch (eHash) {
          const _m = String(eHash?.response?.data?.error?.message?.value || eHash?.message || "").toLowerCase();
          if (_m.includes("endjob")) {
            console.warn("[hashPoll] EndJob error, retry without EndJob", _m);
            try {
              const { data: _retry } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=Id,Modified,Status,PercentComplete`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
              _hashData = _retry;
            } catch {}
          }
          if (!_hashData) throw eHash;
        }
        const data = _hashData;
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
            // fallback без AdditionalActions (короткий select)
            const _fbSelect = "Id,Status,PercentComplete,Modified,ResultSearchTHU,Location1";
            const _fbExpand = HASH_POLL_EXPAND ? `&$expand=${HASH_POLL_EXPAND}` : "";
            const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=${_fbSelect}${_fbExpand}`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
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
        <TasksHeader isHashMode={isHashMode} elementIdParam={elementIdParam} onClearElementHash={clearElementHashParam} onRefresh={loadTasks} loading={loading} />
        {!isHashMode && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <TasksTabs tab={tab} onChange={(v)=> startTabTransition(()=> setTab(v))} activeCount={activeCount} archivedCount={completedCount} completedCount={completedCount} hashMode={isHashMode} isTabPending={isTabPending} />
            <TasksGroupingToggle groupingEnabled={groupingEnabled} onToggle={setGroupingEnabled} countGroups={groupedTasks.length} isHashMode={isHashMode} tab={tab} />
          </Box>
        )}
      </Box>
      {isHashMode ? (
        <Box sx={{ minHeight: 320, display: "block" }}>
          <TasksHashContent
            elementLoading={elementLoading}
            elementTaskSearching={elementTaskSearching}
            elementTaskMatch={elementTaskMatch}
            elementData={elementData}
            elementError={elementError}
            elementIdParam={elementIdParam}
            elementActionParam={elementActionParam}
            isHashTaskRefreshing={isHashTaskRefreshing}
            taskConfiguration={taskConfiguration}
            fieldDefaultActions={fieldDefaultActions}
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
            onClearElementHash={onClearElementHash}
          />
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
      <TaskList
        tasks={tasks}
        tab={tab}
        groupedTasks={groupedTasks}
        filteredTasks={filteredTasks}
        groupingEnabled={groupingEnabled}
        expandedGroups={expandedGroups}
        toggleGroup={toggleGroup}
        useVirtual={useVirtual}
        flatVirtualizer={flatVirtualizer}
        isTabPending={isTabPending}
        loading={loading}
        error={error}
        isBackgroundFetching={isBackgroundFetching}
        taskConfig={taskConfiguration.data}
        resultFieldsMeta={resultFieldsMeta}
        ctResultMap={ctResultMap}
        choices={choices}
        fieldDefaultActions={fieldDefaultActions}
        updatingId={updatingId}
        updatingAction={updatingAction}
        onResultClick={handleResultClick}
        onTakeInWork={handleTakeInWork}
        onComplete={completeTask}
        currentUserId={currentUserId}
        currentUserTitle={currentUserTitle}
        onRetry={loadTasks}
      />
      </Box>

      </>
      )}
            <TaskLocationDialog
        open={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        pendingTask={pendingTask}
        pendingResult={pendingResult}
        locationComment={locationComment}
        setLocationComment={setLocationComment}
        pendingAdditionalActions={pendingAdditionalActions}
        setPendingAdditionalActions={setPendingAdditionalActions}
        pendingAdditionalError={pendingAdditionalError}
        setPendingAdditionalError={setPendingAdditionalError}
        pendingCustomAction={pendingCustomAction}
        setPendingCustomAction={setPendingCustomAction}
        updatingId={updatingId}
        taskConfiguration={taskConfiguration}
        onSubmit={handleLocationSubmit}
      />

            <TaskElementDialog
        open={elementDialogOpen}
        onClose={() => setElementDialogOpen(false)}
        elementData={elementData}
        elementIdParam={elementIdParam}
        elementTaskMatch={elementTaskMatch}
        elementLoading={elementLoading}
        elementTaskSearching={elementTaskSearching}
        elementError={elementError}
        elementActionParam={elementActionParam}
        taskConfiguration={taskConfiguration}
        fieldDefaultActions={fieldDefaultActions}
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
        onClearElementHash={onClearElementHash}
        onShowInList={() => { setElementDialogOpen(false); try { const el = document.getElementById('task-' + elementTaskMatch.Id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {} }}
        loadTasks={loadTasks}
      />

            <TaskConfirmNotFoundDialog
        open={confirmNotFoundOpen}
        onClose={() => setConfirmNotFoundOpen(false)}
        pendingTask={pendingTask}
        pendingResult={pendingResult}
        updatingId={updatingId}
        onConfirm={(task, result) => completeTask(task, result, undefined, "", [])}
      />
    </Box>
  );
}
