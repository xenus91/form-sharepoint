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
import { resolveBehaviour } from "./services/behaviourParser";
import { resolveTaskBehaviourByName, findContentTypeMeta } from "./services/taskBehaviour";
import { useTaskConfiguration } from "./features/tasks/hooks/useTaskConfiguration";
import { useCurrentUser } from "./features/tasks/hooks/useCurrentUser";
import { useDistribution } from "./features/tasks/hooks/useDistribution";
import { useTasksMetadata } from "./features/tasks/hooks/useTasksMetadata";
import { useTasksFiltering } from "./features/tasks/hooks/useTasksFiltering";
import LocalRcBanner from "./features/tasks/components/LocalRcBanner";
import { useHashPolling, useTasksFocusPolling } from "./features/tasks/hooks/useHashPolling";
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
  // Для открытой задачи — свежие choices по ContentType, но не на каждый polling tasks (60с)
  // Сравниваем dataUpdatedAt и троттлим 5 мин, чтобы не дёргать 2 тяжёлых запроса каждые 60с
  const lastResultFieldsRefreshRef = React.useRef(0);
  const prevTasksDataUpdatedAtRef = React.useRef(0);
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    if (tasksDataUpdatedAt === prevTasksDataUpdatedAtRef.current) return;
    prevTasksDataUpdatedAtRef.current = tasksDataUpdatedAt;
    const hasOpen = tasks.some((tk) => isInProgressStatus(tk.Status) && !isCompletedStatus(tk.Status, tk.PercentComplete));
    if (!hasOpen) return;
    const now = Date.now();
    if (now - lastResultFieldsRefreshRef.current < 5 * 60 * 1000) return;
    const hasNewCt = tasks.some((tk) => {
      const ctId = tk.ContentTypeId || tk.raw?.ContentTypeId || tk.raw?.ContentTypeId?.StringId;
      const strId = typeof ctId === "string" ? ctId : ctId?.StringId;
      if (!strId) return false;
      return !ctResultMap.has(strId) && !ctResultMap.has("__default") && ctResultMap.size > 0;
    });
    const needForce = hasNewCt;
    lastResultFieldsRefreshRef.current = now;
    let cancelled = false;
    (async () => {
      try {
        const metas = await fetchResultFieldsMeta(apiClient, { forceRefresh: needForce });
        if (cancelled) return;
        setResultFieldsMeta(metas);
        const map = await fetchContentTypeResultMap(apiClient, { forceRefresh: needForce });
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
  }, [tasks, tasksDataUpdatedAt, ctResultMap]);

    // eslint-disable-next-line no-unused-vars
  const loadTasks = useCallback(async (_opts={})=>{
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    invalidate("/items");
    const res = await refetchTasks();
    return res.data;
  }, [queryClient, refetchTasks]);

  // onCountChange + expandedGroups — теперь через эффект от tasks (раньше было внутри loadTasks)
  useEffect(() => {
    if (!tasksData) return;
    if (onCountChange) {
      const activeCountTmp = tasks.filter((t)=> !isCompletedStatus(t.Status, t.PercentComplete)).length;
      onCountChange(activeCountTmp);
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


  // initial load — handled by TanStack Query (tasksQueryEnabled); loadTasks is now invalidate+refetch

  // (poll перенесён ниже, после isHashMode — чтобы в hash-режиме не скрывать карточку)

  // mapRawTask, fetchFullTask, searchTaskByRelatedItem импортированы из ./tasks/* —
  // см. mapRawTask (./tasks/mapping), fetchFullTask + searchTaskByRelatedItem (./tasks/hashSearch).

// PR2: фильтрация/группировка вынесены в useTasksFiltering (без смены логики)
  const {
    groupingEnabled, setGroupingEnabled,
    expandedGroups, setExpandedGroups,
    activeCount, completedCount,
    filteredTasks, groupedTasks,
    toggleGroup,
  } = useTasksFiltering(tasks, tab);
  const useVirtual = false;
  const flatVirtualizer = useVirtualizer({
    count: 0,
    getScrollElement: () => virtualParentRef.current,
    estimateSize: () => 360,
    overscan: 6,
    measureElement: (el) => el?.getBoundingClientRect()?.height ?? 360,
  });



  // handleTakeInWork / completeTask теперь в useTaskMutations (PR2)

  const handleResultClick = useCallback((task, resultValue) => {
    const normalized = String(resultValue).trim().toLowerCase();
    const isFoundExact = normalized === "найден" || normalized === "найдена";
    const isNotFoundExact = normalized === "не найдена" || normalized === "не найден" || normalized === "не найдено";
    // ⭐ NEW: routing через defs из TaskResultDefinitions (per CT × ResultValue)
    // Приоритет: SP def.requiresLocation/requiresConfirmed (если явно заданы в SP) → fallback на hardcoded resultConfig.js + legacy string match.
    const ctForRouting = String(task?.contentTypeId || task?.ContentTypeId || "").trim();
    const defForRouting = taskConfiguration.data?.taskResultDefinitions
      ? resolveTaskResultDefinition(resultValue, ctForRouting, taskConfiguration.data.taskResultDefinitions)
      : null;

    // ⭐ NEW: SP-driven routing takes priority. Если SP явно говорит «Location» или «Confirm», открываем соответствующую модалку,
    // даже если строковое значение не «найдена»/«не найдена» (например, админ настроил custom CT с произвольным ResultValue).
    // Авторитетный override: явное false в SP отключает соответствующее поведение.
    const spExplicitLocation = defForRouting && defForRouting.requiresLocation !== null;
    const spExplicitConfirm = defForRouting && defForRouting.requiresConfirmed !== null;
    if (spExplicitLocation && defForRouting.requiresLocation === true) {
      setPendingTask(task);
      setPendingResult(resultValue);
      setLocationComment("");
      {
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
      return;
    }
    if (spExplicitConfirm && defForRouting.requiresConfirmed === true) {
      setPendingTask(task);
      setPendingResult(resultValue);
      setConfirmNotFoundOpen(true);
      return;
    }
    // Если SP явно отключил RequiresLocation/RequiresConfirmed (false) — пропускаем соответствующие проверки,
    // идём прямо к completeTask ниже (с isFoundExact / isNotFoundExact как раньше).
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
      completeTask(task, resultValue, {}, "", []);
    }
  }, [fieldDefaultActions, taskConfiguration.data, completeTask]);

  // Тексты диалога подтверждения из TaskBehaviour.Behaviour (ct/cm/ok/no) для текущего pending-результата.
  const confirmTextsForPending = useMemo(() => {
    if (!pendingTask || !pendingResult) return null;
    const data = taskConfiguration?.data;
    if (!data?.taskBehaviour || !data?.ctMetaMap) return null;
    const ctId = String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || pendingTask?.raw?.ContentTypeId?.StringValue || "").trim();
    if (!ctId) return null;
    const ctMeta = findContentTypeMeta(ctId, data.ctMetaMap);
    if (!ctMeta?.name) return null;
    const tb = resolveTaskBehaviourByName(ctMeta.name, data.taskBehaviour);
    if (!tb || !tb.behaviour || !tb.behaviour.ok) return null;
    return resolveBehaviour(pendingResult, tb.behaviour.value)?.confirmTexts || null;
  }, [pendingTask, pendingResult, taskConfiguration?.data]);

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
    // ⭐ NEW: promptFieldValues — object map. В этой модалке legacy single-field = Location1.
    const promptValues = skip ? {} : { Location1: comment || undefined };
    completeTask(pendingTask, pendingResult, promptValues, reqToSave, actsToSaveRaw);
  };

  // isHashMode from useHashElement

  // PR2: polling вынесен в useHashPolling (adaptivePolling 60s, focus throttle 30s)
  useHashPolling({ isHashMode, elementTaskMatch, setElementTaskMatch, setIsHashTaskRefreshing, recipientField, scNumberField, currentUserId, distribution, taskFieldNames, resultFieldInternalNames, queryClient, lastHashFocusRef });
  useTasksFocusPolling({ currentUserId, isHashMode, queryClient, lastFocusLoadRef });

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
        <LocalRcBanner isLocalRcActive={isLocalRcActive} localRcValue={localRcValue} localRcOffice={localRcOffice} onClearLocalRc={onClearLocalRc} />
      )}
      <Box sx={{ position: "relative", zIndex: 10, bgcolor: "#ffffff", backdropFilter: "none", transform: "translateZ(0)", willChange: "transform", mx: 0, px: { xs: 1, sm: 2 }, pt: 1, pb: 1, mb: 1, borderRadius: '28px', border: "1px solid rgba(23,28,143,0.12)", boxShadow: "0 2px 8px rgba(23,28,143,0.06)", overflow: 'visible', boxSizing: 'border-box', flexShrink: 0, contain: "layout paint" }}>
        <TasksHeader isHashMode={isHashMode} elementIdParam={elementIdParam} onClearElementHash={onClearElementHash} onRefresh={loadTasks} loading={loading} taskConfiguration={taskConfiguration} />
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
        confirmTexts={confirmTextsForPending}
        onConfirm={(task, result) => completeTask(task, result, {}, "", [])}
      />
    </Box>
  );
}
