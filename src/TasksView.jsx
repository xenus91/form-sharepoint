/* eslint-disable react/prop-types, no-empty, no-useless-catch */
import React, { useEffect, useState, useCallback, useMemo, useTransition } from "react";
// DBG helper
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return false; }catch(_e){ void _e; return false; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch{} };

import apiClient, { invalidate } from "./api";
import { buildTaskIndex, findInIndex } from "./utils/taskIndex";
import { decodeHtmlEntities } from "./utils/htmlEntities";
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
import { TASKS_LIST_API, fetchAdditionalActionsDefault, getCachedAdditionalActionsDefaultSync, HASH_POLL_SELECT, HASH_POLL_EXPAND, TASKS_LIST_GUID } from "./tasks/config";
import { getSourceById, getTaskSources } from "./tasks/sources";
import { uploadTaskAttachment, deleteTaskAttachment } from "./tasks/attachments";
import { fileNameFromSrc, removedImgSrcsByValues, sameFormValues } from "./features/tasks/lib/richImages";
import { resolveTaskResultDefinition } from "./services/taskResultDefinitions";
import { resolveTaskRule } from "./services/taskBehaviour";
import { resolveResultFlow } from "./features/tasks/resultFlow";
import { resolveBehaviour } from "./services/behaviourParser";
import { resolveTaskBehaviourByName, findContentTypeMeta, markDobTask } from "./services/taskBehaviour";

import { useTaskConfiguration } from "./features/tasks/hooks/useTaskConfiguration";
import { useCurrentUser } from "./features/tasks/hooks/useCurrentUser";
import { useDistribution } from "./features/tasks/hooks/useDistribution";
import { useTasksMetadata } from "./features/tasks/hooks/useTasksMetadata";
import { useTasksFiltering } from "./features/tasks/hooks/useTasksFiltering";
import { useCompletedTasks } from "./features/tasks/hooks/useCompletedTasks";
import LocalRcBanner from "./features/tasks/components/LocalRcBanner";
import { useHashPolling, useTasksFocusPolling } from "./features/tasks/hooks/useHashPolling";
import TasksHeader from "./features/tasks/components/TasksHeader";
import TasksTabs from "./features/tasks/components/TasksTabs";
import TasksGroupingToggle from "./features/tasks/components/TasksGroupingToggle";
import MyTasksToggle from "./features/tasks/components/MyTasksToggle";
import { useRelatedAttachments } from "./features/tasks/hooks/useRelatedAttachments";
import { openRelatedItem, relatedItemIdOf } from "./tasks/relatedAttachments";

import { mergeCardTasks } from "./features/tasks/lib/cardTasks";
import { openTaskForm } from "./features/tasks/lib/openTaskForm";

import { takeTaskInWork } from "./tasks/mutations/takeTaskInWork";
import TasksHashContent from "./features/tasks/components/TasksHashContent";
import TaskLocationDialog from "./features/tasks/components/TaskLocationDialog";
import ContentTypeResultDialog from "./features/tasks/components/ContentTypeResultDialog";
import { fetchTaskContentTypeMeta, isDialogRequired, isResultCheckTask, taskContentTypeId, taskContentTypeName } from "./tasks/contentTypeFields";
import { toStorageImages } from "./features/tasks/lib/attachmentUrl";
import { fieldsWithBase64, materializeRichValues } from "./features/tasks/lib/materializeRichImages";
import { isTaskTakenByCurrentUser } from "./features/tasks/lib/currentUserMatch";
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
import { isCompletedStatus, isInProgressStatus } from "./tasks/status";
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
  DialogContentText,
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
  // Сущности — общим декодером: описания приходят экранированными, порой дважды
  // («&amp;#58;»), а «&#58;» должен показываться как «:».
  let s = decodeHtmlEntities(tmp).trim();
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
export default function TasksView({ userProfile: propUserProfile, currentUserId: propCurrentUserId, onBack: _onBack, onTasksChanged, initialElementId, initialElementAction, initialElementKind = "auto", onClearElementHash, isLocalRcActive, localRcValue, localRcOffice, onClearLocalRc }) {
  const { notify } = useNotifications();
  // fieldsLoading + taskConfiguration теперь внутри useTasksMetadata (PR1)
  const [isTabPending, startTabTransition] = useTransition();
  const [_isDataPending, _startDataTransition] = useTransition(); // eslint-disable-line no-unused-vars
  const lastFocusLoadRef = React.useRef(Date.now());
  // Ссылка на обновление ленивого списка завершённых (хук создаётся ниже)
  const completedRefreshRef = React.useRef(null);
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

  // Табличное представление удалено (требование пользователя, 2026-10-16):
  // задачи показываются только карточками. Источников задач теперь один (main),
  // поэтому отдельная мульти-источниковая загрузка строк тоже не нужна —
  // карточки берут данные из useTasksQuery.

  // Служебный Set для одноразового лога дочитывания типа контента (см. ниже).
  const ctFetchLoggedRef = React.useRef(null);
  if (ctFetchLoggedRef.current === null) ctFetchLoggedRef.current = new Set();
  const __CT_FETCH_LOGGED__ = ctFetchLoggedRef.current;
  // Одна строка на задачу: без неё «открылась не та форма» невозможно отличить
  // от ошибки детекта (и не нужно включать ?dbg=1).
  const logCtDetect = useCallback((msg, payload) => {
    try {
      const key = `${msg}:${payload?.id ?? ""}`;
      if (__CT_FETCH_LOGGED__.has(key)) return;
      __CT_FETCH_LOGGED__.add(key);
      console.info(`[ct-detect] ${msg}`, payload);
    } catch (_e) { void _e; }
  }, [__CT_FETCH_LOGGED__]);

  // ⭐ Метаданные типа контента по Id задачи: у строки может не быть типа вовсе
  // (select источника без ContentTypeId) или он может быть незнакомым. Дочитываем
  // у элемента (в т.ч. ИМЯ типа) и обогащаем строку — меню действий и переходы
  // должны вести себя как для карточки ДОБ.

  // ⭐ Задача ДОБ определяется настройкой TaskBehaviour: в записи по имени типа
  // контента стоит IsDobTask = Да. Признак проставляем в саму задачу, чтобы им
  // пользовались и детекция формы (contentTypeFields), и карточки/таблица.
  // Колонка в списке задач для этого НЕ используется: её значение по умолчанию одно
  // на весь список и одинаково для всех типов контента.
  const withDobFlag = useCallback((row) => markDobTask(row, taskConfiguration?.data), [taskConfiguration?.data]);

  // ⭐ Открытие формы задачи. Если у задачи (строки таблицы/карточки) НЕТ типа
  // контента — дочитываем его у самого элемента основного списка: иначе задача
  // «Результат проверки ООБ» уходит на #tasks/<Id> обычной карточкой с кнопками,
  // а не на форму ДОБ. Это же спасает, когда select источника не содержал
  // ContentTypeId (тогда ни карточка, ни таблица тип не увидят).
  const openTaskFormResolved = useCallback(async (task, compositeId) => {
    const cid = compositeId || task?.compositeId || null;
    let t = task || null;
    const mainTask = t ? (!t.sourceId || t.sourceId === "main") : true;
    if (t && mainTask && !taskContentTypeId(t)) {
      const rawId = t.Id ?? Number(String(cid || "").split(":").pop());
      const meta = await fetchTaskContentTypeMeta(rawId).catch(() => null);
      if (meta && (meta.ctId || meta.ctName)) {
        t = {
          ...t,
          contentTypeId: meta.ctId || taskContentTypeId(t) || null,
          contentTypeName: meta.ctName || taskContentTypeName(t) || null,
          raw: { ...(t.raw || {}), ContentTypeId: meta.ctId || t.raw?.ContentTypeId },
        };
      }
      logCtDetect("открытие формы: тип контента дочитан у элемента", {
        id: rawId,
        ctId: meta?.ctId || null,
        ctName: meta?.ctName || null,
        resultCheck: isResultCheckTask(t),
      });
    }
    // Признак ДОБ (TaskBehaviour) — до выбора роута: по нему #tasks открывает
    // нашу форму DobTaskEditView вместо обычной карточки.
    t = withDobFlag(t);
    return openTaskForm(cid);
  }, [logCtDetect, withDobFlag]);

  // mergeCardTasks оставляет за собой две вещи, нужные и без внешних источников:
  // пометку sourceId="main" и сортировку «от самых старых к новым» (Created asc).
  const cardTasks = useMemo(
    () => mergeCardTasks(tasksData ?? [], []).map((t) => withDobFlag(t)),
    [tasksData, withDobFlag],
  );

  // Скрепка на карточке: сколько вложений у связанного элемента (RelatedItems →
  // ProblemsPallet). Счётчики грузятся одним батчем на страницу, а не по запросу
  // на карточку. Клик открывает этот элемент на весь viewport через ?ID=<Id>.
  //
  // ВАЖНО: в hash-режиме (#tasks/<ID>) список карточек не рендерится, поэтому
  // батч по всему списку не нужен — иначе на каждую ссылку уходил запрос с
  // $filter=Id eq … на все RelatedItems списка (выглядело как перебор соседних
  // элементов). Для открытой карточки считается отдельно ниже.
  // Объявлено ПОСЛЕ useHashElement — нужен isHashMode.
  const handleOpenRelatedAttachments = useCallback((task) => {
    const id = relatedItemIdOf(task);
    if (!id) return;
    if (!openRelatedItem(id)) {
      notify("Не удалось открыть связанный элемент.", { severity: "error" });
    }
  }, [notify]);

  // Взятие в работу задачи внешнего источника (dob): MERGE статуса на сайте-владельце;
  // SharePoint сам проставит Editor → «Исполнитель» в карточке/таблице.
  const handleTakeExternalTask = useCallback(async (task) => {
    const key = task?.compositeId || (task?.sourceId ? `${task.sourceId}:${task.Id}` : null);
    if (!key) return;
    setExternalTakingId(key);
    try {
      const res = await takeTaskInWork(key, { allSources: getTaskSources() });
      if (res.ok) {
        notify(`Задача #${task.Id} взята в работу`, { severity: "success" });
      } else if (res.reason === "already-taken") {
        // Если «взял» — сам текущий пользователь (Id на сайте источника/ФИО),
        // «возьмите другую» показывать нельзя: это его задача.
        const mine = isTaskTakenByCurrentUser(
          { sourceId: task?.sourceId, EditorId: res.editorId, EditorTitle: res.editorTitle },
          {
            currentUserId,
            currentUserTitle,
            currentUserIdBySource: { [task?.sourceId || "main"]: currentUserId },
          },
        );
        notify(
          mine
            ? `Задача #${task.Id} уже в работе у вас${res.status ? ` (${res.status})` : ""}.`
            : `Задача #${task.Id} уже в работе${res.editorTitle ? ` у ${res.editorTitle}` : ""}. Возьмите другую задачу.`,
          { severity: mine ? "info" : "warning" }
        );
      } else if (res.reason === "completed") {
        notify(`Задача #${task.Id} уже завершена.`, { severity: "warning" });
      } else {
        notify(`Не удалось взять задачу #${task.Id}: ${res.message || "ошибка"}`, { severity: "error" });
      }
      if (refetchTasks) await refetchTasks();
    } catch (e) {
      notify(`Не удалось взять задачу #${task.Id}: ${e?.message || "ошибка"}`, { severity: "error" });
    } finally {
      setExternalTakingId(null);
    }
  }, [notify, refetchTasks, currentUserId, currentUserTitle]);

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
  // Behaviour.aa текущего результата для диалога местоположения:
  // true — показывать, false — скрыть (правило есть, aa не включён),
  // undefined — правила нет вовсе (legacy: решают определения результатов).
  const [pendingShowAdditionalActions, setPendingShowAdditionalActions] = useState(undefined);
  // Значения инлайн-формы (поповер таблицы), если у результата ещё и Behaviour.c:
  // подтверждаем ПОСЛЕ формы и завершаем задачу уже с этими значениями.
  const [pendingInlineSubmit, setPendingInlineSubmit] = useState(null);
  // Диалог закрытия по типу контента (Behaviour.dlg / «Результат проверки ООБ»):
  // { task, rule, result } — форма строится по колонкам SharePoint.
  const [ctDialog, setCtDialog] = useState(null);
  // Картинки rich-текста в попап-форме задачи: грузим вложениями (их может быть
  // несколько), а удалённые из текста — удаляем из вложений (как на странице задачи).
  const [ctUploading, setCtUploading] = useState(false);
  const ctImagesRef = React.useRef({});
  // Идентификатор формы, для которой собран текущий снимок картинок (см. ниже):
  // новый элемент — новый набор картинок, снимок сбрасывается.
  const ctImagesTaskIdRef = React.useRef(null);
  // Задача внешнего источника, которая сейчас берётся в работу (compositeId).
  const [externalTakingId, setExternalTakingId] = useState(null);

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
  // ⭐ Анимация, которой управляет TasksView (ветки location/confirm/complete).
  //   Сама отрисовка живёт в карточке — сюда передаём { taskId, anim, config }.
  const [pendingAnimation, setPendingAnimation] = useState(null);
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
    matchMode,
    autoTabAppliedForElement, setAutoTabAppliedForElement,
    taskIndex, findTaskByElementId,
    isHashMode,
  } = useHashElement({ initialElementId, initialElementAction, initialElementKind, tasks, distribution, currentUserId, tab, setTab, isTabPending, startTabTransition });

  const relatedAttachments = useRelatedAttachments(isHashMode ? [] : cardTasks);

  // Карточка в диалоге #tasks/<Id> берётся отдельным запросом и может не входить
  // в cardTasks — считаем вложения связанного элемента и для неё.
  const dialogTask = elementTaskMatch || null;
  const dialogRelatedAttachments = useRelatedAttachments(dialogTask ? [dialogTask] : []);
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
    // Завершённые задачи живут в отдельном источнике — обновляем и их
    try { await completedRefreshRef.current?.(); } catch {}
    return res.data;
  }, [queryClient, refetchTasks]);

  // Данные изменились → просим пересчитать бейдж «активные задачи».
  // НЕ передаём своё число: оно считалось по загруженной (отфильтрованной)
  // выборке и при переключении интерфейсов затирало настоящий счётчик
  // (см. useActiveTasksCount — там единственный источник правды).
  useEffect(() => {
    if (!tasksData) return;
    onTasksChanged?.();
    const newGroups = new Set(tasks.map((m)=> extractTKNumberFromTask(m)));
    setExpandedGroups((prev)=>{
      if (prev.size===0) return newGroups;
      let changed=false;
      const next=new Set(prev);
      newGroups.forEach((g)=>{ if(!prev.has(g)){ next.add(g); changed=true; }});
      return changed? next: prev;
    });
  }, [tasksData, tasks, cardTasks, onTasksChanged]);

  const { updatingId, setUpdatingId, updatingAction, setUpdatingAction, handleTakeInWork, completeTask } = useTaskMutations({
    entityType,
    completedStatusValue,
    inProgressStatusValue,
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

  // Кнопка «Взять в работу» на строке таблицы: main → обычная мутация задачи,
  // внешний источник (dob) → MERGE статуса на сайте-владельце.
  const handleTakeTableRow = useCallback(
    (row) => (row?.sourceId === "main" ? handleTakeInWork(row) : handleTakeExternalTask(row)),
    [handleTakeInWork, handleTakeExternalTask]
  );

  // initial load — handled by TanStack Query (tasksQueryEnabled); loadTasks is now invalidate+refetch

  // (poll перенесён ниже, после isHashMode — чтобы в hash-режиме не скрывать карточку)

  // mapRawTask, fetchFullTask, searchTaskByRelatedItem импортированы из ./tasks/* —
  // см. mapRawTask (./tasks/mapping), fetchFullTask + searchTaskByRelatedItem (./tasks/hashSearch).

// ── Тумблер «Я исполнитель» ─────────────────────────────────────────────────
  const [onlyMine, setOnlyMine] = useState(false);
  // Фильтр имеет смысл, только когда текущий пользователь опознан: известен его
  // Id ИЛИ ФИО (Editor в задачах часто приходит только строкой — тогда сверяем
  // по ФИО).
  const meKnown = !!currentUserId || !!String(currentUserTitle || "").trim();
  // Если данные о пользователе пропадают (выход/смена пользователя) — тумблер
  // снимаем: иначе список молча опустеет и это выглядит как «задач нет».
  useEffect(() => {
    if (!meKnown && onlyMine) setOnlyMine(false);
  }, [meKnown, onlyMine]);

  // «Я исполнитель» — задача, которую я ВЕДУ: взял в работу (и ещё не закрыл)
  // или закрыл сам. Назначение в «Кому назначено» сюда НЕ входит (требование
  // 2026-10-10): на мне или на моей группе может висеть задача, по которой
  // работает кто-то другой, и наоборот. Кто взял задачу — по Id / ФИО / учётной
  // записи (см. features/tasks/lib/currentUserMatch.js).
  const isMyTask = useCallback((row) => {
    if (!row) return false;
    const status = row.Status ?? "";
    // Ни «в работе», ни «завершена» → показывать нечего (в т.ч. «Не начата»).
    if (!isInProgressStatus(status) && !isCompletedStatus(status, row.PercentComplete)) return false;
    return isTaskTakenByCurrentUser(row, { currentUserId, currentUserTitle });
  }, [currentUserId, currentUserTitle]);

// PR2: фильтрация/группировка вынесены в useTasksFiltering (без смены логики)
  const {
    groupingEnabled, setGroupingEnabled,
    expandedGroups, setExpandedGroups,
    activeCount, completedCount, myCount,
    filteredTasks, groupedTasks,
    toggleGroup,
  } = useTasksFiltering(cardTasks, tab, { onlyMine, isMyTask });

  // ⭐ Завершённые задачи — отдельный ленивый источник (RenderListDataAsStream):
  // счётчик считаем сразу, карточки грузим порциями по 20 при открытии вкладки.
  const completed = useCompletedTasks({
    currentUserId,
    distribution,
    recipientField,
    scNumberField,
    // колонка «Результирующий выбор» в таблице завершённых
    resultFieldInternalNames,
    enabled: !!currentUserId && !fieldsLoading && !isHashMode,
    autoLoad: tab === 1 && !isHashMode,
  });
  React.useEffect(() => {
    completedRefreshRef.current = completed.refresh;
  }, [completed.refresh]);
  const completedTasks = completed.items;
  // Тумблер «Я исполнитель» действует и на вкладке «Завершённые»: остаются те
  // задачи, которые закрыл я.
  const visibleCompletedTasks = React.useMemo(
    () => (onlyMine ? (completedTasks || []).filter(isMyTask) : (completedTasks || [])),
    [completedTasks, onlyMine, isMyTask],
  );
  // Счётчик может быть неизвестен (null) — тогда показываем количество уже загруженных,
  // но НИКОГДА не подставляем 0:completedCount считает завершённые внутри активной выборки,
  // а завершённые в неё не попадают (там всегда 0).
  const completedTotal =
    completed.count != null
      ? Math.max(completed.count, completed.items?.length || 0)
      : completed.items?.length || null;
  // Пока первая страница ещё не загружена (и счётчик не сказал «0») — показываем спиннер,
  // а не пустое состояние «Нет завершенных задач».
  const completedLoading =
    tab === 1 &&
    ((completed.loading && completedTasks.length === 0) ||
      (!completed.loaded && !completed.error && completed.count !== 0));
  const completedGrouped = React.useMemo(() => {
    if (!visibleCompletedTasks.length) return [];
    if (!groupingEnabled) return [["Все", visibleCompletedTasks]];
    const map = new Map();
    for (const task of visibleCompletedTasks) {
      const sc = extractTKNumberFromTask(task);
      if (!map.has(sc)) map.set(sc, []);
      map.get(sc).push(task);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Без ТК") return 1;
      if (b[0] === "Без ТК") return -1;
      return a[0].localeCompare(b[0], "ru");
    });
  }, [visibleCompletedTasks, groupingEnabled]);

  const useVirtual = false;
  const flatVirtualizer = useVirtualizer({
    count: 0,
    getScrollElement: () => virtualParentRef.current,
    estimateSize: () => 360,
    overscan: 6,
    measureElement: (el) => el?.getBoundingClientRect()?.height ?? 360,
  });

  // handleTakeInWork / completeTask теперь в useTaskMutations (PR2)

  // ⭐ Поток результата определяется ТОЛЬКО Behaviour (см. docs/feature-taskbehaviour.md).
  // Нет правил для задачи/результата — задача завершается сразу по нажатию кнопки:
  // никаких диалогов «Где найдена ЕО?» и подтверждений, никаких строковых хардкодов.
  const handleResultClick = useCallback((task, resultValue) => {
    const rule = resolveTaskRule(task, resultValue, taskConfiguration.data);
    const flow = resolveResultFlow(resultValue, rule);
    if (__DBG_ENABLED__) {
      __dlog("[TasksView:resultClick]", {
        taskId: task?.Id,
        result: resultValue,
        ct: String(task?.contentTypeId || task?.ContentTypeId || "").slice(-12),
        rule: rule ? { source: rule.source, c: rule.requiresConfirmed, loc: rule.requiresLocation, p: rule.promptFields?.length || 0 } : null,
        flow,
      });
    }

    // ⭐ Behaviour.anim: сначала проигрываем анимацию на карточке (1.6 с), затем продолжаем поток.
    const anim = rule?.animation || null;
    const runAfterAnimation = (fn) => {
      if (!anim || anim === "none") { fn(); return; }
      setPendingAnimation({ taskId: task.Id, anim, config: rule?.animationConfig || null });
      window.setTimeout(() => {
        setPendingAnimation(null);
        fn();
      }, 1600);
    };

    // ⭐ Закрытие через ДИАЛОГ по типу контента (Behaviour.dlg или сам тип контента
    // «Результат проверки ООБ»): форму строит ContentTypeResultDialog строго по
    // колонкам SharePoint, а карточка/таблица только передают выбранный результат.
    if (isDialogRequired(rule, taskContentTypeId(task), taskContentTypeName(task), task)) {
      runAfterAnimation(() => setCtDialog({ task, rule: rule || null, result: resultValue || "" }));
      return;
    }

    // 🛡 Страховка: правило требует полей/доп. действий, но форму никто не показал
    // (клик пришёл не из карточки и не из поповера таблицы). «Молча» завершать нельзя:
    // Location1 соберёт диалог местоположения, остальные поля — форма карточки.
    const _promptFields = Array.isArray(rule?.promptFields) ? rule.promptFields : [];
    const _needsForm = _promptFields.length > 0 || rule?.showAdditionalActions === true;
    const _onlyLocationField = _promptFields.length === 1
      && String(_promptFields[0]?.internalName || _promptFields[0]?.f || "").trim().toLowerCase() === "location1";

    if (flow.action === "location" || (_needsForm && _onlyLocationField)) {
      runAfterAnimation(() => {
      setPendingTask(task);
      setPendingResult(resultValue);
      // aa правила решает, показывать ли в диалоге блок доп. действий (как в карточке:
      // показываем ТОЛЬКО при aa: true; если правила нет — legacy-определения результатов)
      setPendingShowAdditionalActions(rule ? rule.showAdditionalActions === true : undefined);
      setPendingInlineSubmit(null);
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
      });
      return;
    }

    if (flow.action === "confirm") {
      runAfterAnimation(() => {
        setPendingTask(task);
        setPendingResult(resultValue);
        setConfirmNotFoundOpen(true);
      });
      return;
    }

    if (_needsForm) {
      notify(`Результат «${resultValue}» требует заполнить поля — открываю карточку задачи #${task.Id}`, { severity: "info" });
      openTaskFormResolved(task, task?.compositeId);
      return;
    }

    // complete: без доп. действий (анимация — если задана в Behaviour.anim).
    // req = null → legacy-поля AdditionalsActionsRequired/AdditionalActions не отправляем
    // (в Behaviour нет aa; поля могут отсутствовать в типе контента или быть Boolean).
    runAfterAnimation(() => completeTask(task, resultValue, {}, null, []));
  }, [fieldDefaultActions, taskConfiguration.data, completeTask, notify, openTaskFormResolved]);

  // ── Свежие варианты результата ─────────────────────────────────────────────
  // Свежие choices для main-задачи «в работе» (getResultChoicesForTask с
  // forceRefresh). Кэшируем по compositeId, чтобы не дёргать SharePoint на каждый
  // рендер; ими пользуется диалог закрытия задачи (dialogChoicesForTask).
  const [rowChoices, setRowChoices] = useState(() => ({}));
  const freshChoicesRequestedRef = React.useRef(new Set());

  const resultFieldMetaForRow = useCallback((row) => {
    if (!row) return null;
    try {
      return getResultFieldForTask(row, ctResultMap, resultFieldsMeta);
    } catch (_e) {
      return null;
    }
  }, [ctResultMap, resultFieldsMeta]);

  const isMainInProgressRow = useCallback((row) => (
    !!row
    && row.sourceId === "main"
    && isInProgressStatus(row.Status)
    && !isCompletedStatus(row.Status, row.PercentComplete)
  ), []);

  useEffect(() => {
    const targets = (cardTasks || []).filter(
      (r) => isMainInProgressRow(r) && !freshChoicesRequestedRef.current.has(r.compositeId)
    );
    if (targets.length === 0) return undefined;
    for (const row of targets) freshChoicesRequestedRef.current.add(row.compositeId);
    let cancelled = false;
    (async () => {
      const updates = {};
      await Promise.all(targets.map(async (row) => {
        try {
          const meta = resultFieldMetaForRow(row);
          const { choices: fresh, field } = await getResultChoicesForTask(apiClient, row, { forceRefresh: true });
          if (fresh && fresh.length > 0) {
            updates[row.compositeId] = {
              choices: fresh.map(String),
              internalName: field?.internalName || meta?.internalName || "ResultSearchTHU",
            };
          }
        } catch (_e) { void _e; /* останутся синхронные choices */ }
      }));
      if (cancelled) return;
      if (Object.keys(updates).length > 0) {
        setRowChoices((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [cardTasks, isMainInProgressRow, resultFieldMetaForRow]);

  // Вид кнопки результата — из Behaviour.stylingResultButton (тот же резолвер,
  // что в карточке): background/color/hover/variant.
  // Варианты результата для диалога закрытия: поле результата типа контента задачи
  // (DobSearchResult и т.п.), плюс свежие choices строки таблицы.
  const dialogChoicesForTask = useCallback((task) => {
    const fresh = rowChoices[task?.compositeId];
    if (Array.isArray(fresh?.choices) && fresh.choices.length > 0) return fresh.choices;
    try {
      const meta = getResultFieldForTask(task, ctResultMap, resultFieldsMeta);
      if (Array.isArray(meta?.choices) && meta.choices.length > 0) return meta.choices;
    } catch (_e) { void _e; }
    return Array.isArray(choices) ? choices : [];
  }, [rowChoices, ctResultMap, resultFieldsMeta, choices]);

  const dialogResultFieldName = useCallback((task) => {
    try {
      const meta = getResultFieldForTask(task, ctResultMap, resultFieldsMeta);
      return meta?.internalName || "";
    } catch (_e) { void _e; return ""; }
  }, [ctResultMap, resultFieldsMeta]);

  // Список, в котором лежит задача (main / внешний источник) — вложения кладём
  // именно в него.
  const ctListGuidOf = useCallback((task) => {
    try {
      const source = getSourceById(String(task?.sourceId || "main"));
      return source?.listGuid || TASKS_LIST_GUID;
    } catch (_e) { void _e; return TASKS_LIST_GUID; }
  }, []);

  const handleCtImageUpload = useCallback(async (file) => {
    const id = Number(ctDialog?.task?.Id);
    if (!file || !Number.isFinite(id)) return null;
    setCtUploading(true);
    try {
      return await uploadTaskAttachment(id, file, ctListGuidOf(ctDialog?.task));
    } catch (e) {
      console.error("[ct-modal] image upload failed", e?.response?.status, e?.message);
      return null;
    } finally {
      setCtUploading(false);
    }
  }, [ctDialog, ctListGuidOf]);

  const handleCtValuesChange = useCallback((next) => {
    const id = Number(ctDialog?.task?.Id);
    const snapshot = {};
    for (const [k, v] of Object.entries(next || {})) snapshot[k] = String(v ?? "");
    // Новая форма — новый набор картинок: сбрасываем снимок от ИМЕНИ задачи, а не
    // отдельным эффектом (иначе он затирал стартовые значения диалога и первое
    // удаление картинки не убирало вложение).
    const isNewTask = ctImagesTaskIdRef.current !== id;
    // Ничего не изменилось — не гоняем ререндер (и не ищем удаления).
    if (!isNewTask && sameFormValues(ctImagesRef.current || {}, snapshot)) return;
    if (isNewTask) {
      ctImagesTaskIdRef.current = id;
      ctImagesRef.current = {};
    }
    const prev = ctImagesRef.current || {};
    ctImagesRef.current = snapshot;
    if (!Number.isFinite(id)) return;
    const guid = ctListGuidOf(ctDialog?.task);
    // Значения могут быть и в сохранённом виде («/sites/…»), и в рабочем адресе
    // редактора («/dob-api/…» / origin) — сравниваем в одном («серверном») виде.
    const norm = (dict) => Object.fromEntries(
      Object.entries(dict || {}).map(([k, v]) => [k, toStorageImages(String(v ?? ""))]),
    );
    for (const src of removedImgSrcsByValues(norm(prev), norm(next))) {
      const fileName = fileNameFromSrc(src);
      if (!fileName) continue;
      deleteTaskAttachment(id, fileName, guid).catch(() => {});
    }
  }, [ctDialog, ctListGuidOf]);

  const dialogContentTypeName = useCallback((task) => {
    try {
      const ctId = taskContentTypeId(task);
      const meta = findContentTypeMeta(ctId, taskConfiguration.data?.ctMetaMap);
      return meta?.name || "";
    } catch (_e) { void _e; return ""; }
  }, [taskConfiguration.data]);

  // Отправка диалога: результат + поля типа контента, доп. действий нет (req = null).
  const handleCtDialogSubmit = useCallback(async ({ result, values }) => {
    const dialogTask = ctDialog?.task;
    if (!dialogTask) return;
    // Rich-текст: каждая оставшаяся base64-картинка (например, загрузка вложения
    // не удалась) становится вложением задачи, а в SharePoint уходит ссылка на
    // вложение серверным путём (`/sites/…`) — не base64 и не адрес `/dob-api/…`.
    const id = Number(dialogTask.Id);
    const guid = ctListGuidOf(dialogTask);
    let storedValues = Object.fromEntries(
      Object.entries(values || {}).map(([k, v]) => [k, typeof v === "string" ? toStorageImages(v) : v]),
    );
    try {
      storedValues = await materializeRichValues(storedValues, {
        upload: Number.isFinite(id) ? (file) => uploadTaskAttachment(id, file, guid) : null,
        onError: (e) => notify(`Не удалось сохранить картинку вложением: ${String(e?.message || e).slice(0, 160)}`, { severity: "warning" }),
      });
    } catch (e) {
      notify(`Картинки не удалось сохранить вложениями: ${String(e?.message || e).slice(0, 160)}`, { severity: "warning" });
    }
    // В SharePoint должна уходить ссылка на вложение, а не base64: если картинку
    // загрузить не удалось — задачу не закрываем, диалог оставляем открытым.
    const base64Left = fieldsWithBase64(storedValues);
    if (base64Left.length > 0) {
      notify(
        `Изображение не удалось сохранить вложением: ${base64Left.join(", ")}. Повторите сохранение или удалите изображение.`,
        { severity: "error" },
      );
      return;
    }
    setCtDialog(null);
    completeTask(dialogTask, result, storedValues, null, []);
  }, [ctDialog?.task, completeTask, ctListGuidOf, notify]);

  /**
   * Описание инлайн-формы результата для поповера таблицы — 1:1 с карточкой:
   * prompt-поля, доп. действия, кнопки и подписи из Behaviour.
   * Возвращает null, если результат не требует формы/подтверждения в месте
   * (тогда работает обычный поток: диалог местоположения / подтверждения / запись).
   */

  // Id текущего пользователя по внешним источникам. Внешних источников больше
  // нет (единственный источник — main), поэтому карта пустая; проп оставлен,
  // чтобы карточки внешних задач не требовали переделки TaskList.
  const siteUserIdsBySource = React.useMemo(() => ({}), []);

  /**
   * Выделение строки таблицы. Обновление состояния страницы (счётчики, подсказка
   * под таблицей) — низкоприоритетное: `startTransition` не блокирует открытие
   * поповера действий, поэтому клик по строке ощущается мгновенным.
   */

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
    // Доп. действия: приоритет у Behaviour.aa (как в диалоге и карточке);
    // определения результатов — только когда правила нет вовсе.
    const ctForSubmit = String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim();
    const defForSubmit = taskConfiguration.data?.taskResultDefinitions ? resolveTaskResultDefinition(pendingResult, ctForSubmit, taskConfiguration.data.taskResultDefinitions) : null;
    const showForSubmit = pendingShowAdditionalActions === true
      ? true
      : pendingShowAdditionalActions === false
        ? false
        : (defForSubmit ? !!defForSubmit.showAdditionalActions : true);
    const actsToSaveRaw = showForSubmit ? pendingAdditionalActions : [];
    // null = доп. действия не участвуют (Behaviour.aa не true) → legacy-поля не отправляем
    const reqToSave = showForSubmit ? (pendingAdditionalActions.length > 0 ? "Да" : "Нет") : null;
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
    <Box sx={{ p: { xs: 1, sm: 2 }, pt: { xs: 0.5, sm: 0.5 }, pb: { xs: 1, sm: 2 },
      // Карточки — узкая колонка 720 (табличного режима больше нет).
      maxWidth: 720,
      width: "100%",
      minWidth: { xs: 0, sm: 280 },
      mx: "auto",
      boxSizing: "border-box",
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 8px)", minHeight: "calc(100vh - 8px)", maxHeight: "calc(100vh - 8px)",
      "@supports (height:100dvh)": { height: "calc(100dvh - 8px)", minHeight: "calc(100dvh - 8px)", maxHeight: "calc(100dvh - 8px)" },
      overflowX: 'hidden', overflowY: 'hidden' }}>
      {isLocalRcActive && localRcValue && (
        <LocalRcBanner isLocalRcActive={isLocalRcActive} localRcValue={localRcValue} localRcOffice={localRcOffice} onClearLocalRc={onClearLocalRc} />
      )}
      <Box sx={{ position: "relative", zIndex: 10, bgcolor: "#ffffff", backdropFilter: "none", transform: "translateZ(0)", willChange: "transform", mx: 0, px: { xs: 1, sm: 2 }, pt: 1, pb: 1, mb: 1, borderRadius: '28px', border: "1px solid rgba(23,28,143,0.12)", boxShadow: "0 2px 8px rgba(23,28,143,0.06)", overflow: 'visible', boxSizing: 'border-box', flexShrink: 0, contain: "layout paint" }}>
        <TasksHeader isHashMode={isHashMode} elementIdParam={elementIdParam} onClearElementHash={onClearElementHash} onRefresh={loadTasks} loading={loading} taskConfiguration={taskConfiguration} />
        {!isHashMode && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <TasksTabs tab={tab} onChange={(v)=> startTabTransition(()=> setTab(v))} activeCount={activeCount} archivedCount={completedTotal} completedCount={completedTotal} hashMode={isHashMode} isTabPending={isTabPending} />
            </Box>
            {/* Одна строка, элементы по РАЗНЫЕ стороны: переключатель группировки
                слева, кнопка «Я исполнитель» справа (space-between). На вкладке
                «Завершённые» группировки нет — тогда кнопка остаётся одна слева. */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 1, minHeight: 32, flexWrap: "wrap" }}>
              <TasksGroupingToggle groupingEnabled={groupingEnabled} onToggle={setGroupingEnabled} countGroups={groupedTasks.length} isHashMode={isHashMode} tab={tab} />
              <MyTasksToggle enabled={onlyMine} onToggle={setOnlyMine} count={myCount} disabled={!meKnown} isHashMode={isHashMode} />
            </Box>
          </Box>
        )}
      </Box>
      {isHashMode ? (
        <Box sx={{ minHeight: 320, display: "block" }}>
          <TasksHashContent
            matchMode={matchMode}
            elementLoading={elementLoading}
            elementTaskSearching={elementTaskSearching}
            elementTaskMatch={elementTaskMatch}
            relatedAttachmentCount={dialogTask ? dialogRelatedAttachments.countOf(dialogTask) : 0}
            onOpenRelatedAttachments={handleOpenRelatedAttachments}
            elementData={elementData}
            elementError={elementError}
            elementNotFound={elementNotFound}
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
            pendingAnimation={pendingAnimation}
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
        tasks={tab === 1 ? visibleCompletedTasks : tasks}
        tab={tab}
        groupedTasks={tab === 1 ? completedGrouped : groupedTasks}
        filteredTasks={tab === 1 ? visibleCompletedTasks : filteredTasks}
        groupingEnabled={groupingEnabled}
        expandedGroups={expandedGroups}
        toggleGroup={toggleGroup}
        relatedAttachmentCountOf={relatedAttachments.countOf}
        onOpenRelatedAttachments={handleOpenRelatedAttachments}
        useVirtual={useVirtual}
        flatVirtualizer={flatVirtualizer}
        isTabPending={isTabPending}
        loading={tab === 1 ? completedLoading : loading}
        error={tab === 1 ? completed.error : error}
        errorDetail={tab === 1 ? completed.errorDetail : ""}
        isBackgroundFetching={tab === 1 ? false : isBackgroundFetching}
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
        onOpenExternalTask={(task) => openTaskFormResolved(task, task?.compositeId)}
        onTakeExternalTask={handleTakeTableRow}
        externalTakingId={externalTakingId}
        externalCurrentUserIds={siteUserIdsBySource}
      />
      {tab === 1 && !isHashMode && completedTasks.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, pt: 1, pb: 2 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {onlyMine
              // С тумблером «Я исполнитель» общий счётчик завершённых не имеет
              // смысла: показываем, сколько отобрано из уже загруженных.
              ? `Показано ${visibleCompletedTasks.length} из загруженных ${completedTasks.length}`
              : `Показано ${completedTasks.length}${completedTotal != null ? ` из ${completedTotal}` : ""}`}
          </Typography>
          {completed.hasMore ? (
            <Button
              variant="outlined"
              onClick={() => completed.loadNext()}
              disabled={completed.loading}
              startIcon={completed.loading ? <CircularProgress size={16} /> : null}
              sx={{ borderRadius: "12px", fontWeight: 700, textTransform: "none", px: 2.5 }}
            >
              {completed.loading ? "Загрузка..." : `Показать ещё ${completed.pageSize}`}
            </Button>
          ) : (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Все завершённые задачи загружены
            </Typography>
          )}
          {completed.error && (
            <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 700 }}>
              {completed.error}
            </Typography>
          )}
        </Box>
      )}
      </Box>

      </>
      )}
            <ContentTypeResultDialog
        open={Boolean(ctDialog)}
        task={ctDialog?.task || null}
        contentTypeId={taskContentTypeId(ctDialog?.task)}
        contentTypeName={ctDialog ? dialogContentTypeName(ctDialog.task) : ""}
        resultFieldInternalName={ctDialog ? dialogResultFieldName(ctDialog.task) : ""}
        resultChoices={ctDialog ? dialogChoicesForTask(ctDialog.task) : []}
        initialResult={ctDialog?.result || ""}
        confirmTexts={ctDialog?.rule?.confirmTexts || null}
        submitLabel={ctDialog?.rule?.confirmTexts?.okText || ""}
        cancelLabel={ctDialog?.rule?.confirmTexts?.cancelText || ""}
        submitting={ctDialog?.task?.Id != null && updatingId === ctDialog.task.Id}
        onUploadImage={handleCtImageUpload}
        isUploading={ctUploading}
        onValuesChange={handleCtValuesChange}
        onSubmit={handleCtDialogSubmit}
        onClose={() => setCtDialog(null)}
      />

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
        showAdditionalActions={pendingShowAdditionalActions}
        onSubmit={handleLocationSubmit}
      />

            <TaskElementDialog
        open={elementDialogOpen}
        matchMode={matchMode}
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
        relatedAttachmentCount={dialogTask ? dialogRelatedAttachments.countOf(dialogTask) : 0}
        onOpenRelatedAttachments={handleOpenRelatedAttachments}
      />

            <TaskConfirmNotFoundDialog
        open={confirmNotFoundOpen}
        onClose={() => setConfirmNotFoundOpen(false)}
        pendingTask={pendingTask}
        pendingResult={pendingResult}
        updatingId={updatingId}
        confirmTexts={confirmTextsForPending}
        onConfirm={(task, result) => {
          // p + c: значения собирает инлайн-форма (карточка/поповер), подтверждение — здесь
          const pending = pendingInlineSubmit;
          setPendingInlineSubmit(null);
          completeTask(task, result, pending?.values || {}, pending?.req ?? null, pending?.acts || []);
        }}
      />

    </Box>
  );
}
