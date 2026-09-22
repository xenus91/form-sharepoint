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
  const [fieldsLoading, setFieldsLoading] = useState(true);
  // Phase 7: isolated configuration cache (30m stale, 4h gc) — не триггерит Tasks polling
  const taskConfiguration = useTaskConfiguration({ enabled: !fieldsLoading });
  const [isTabPending, startTabTransition] = useTransition();
  const [_isDataPending, _startDataTransition] = useTransition(); // eslint-disable-line no-unused-vars
  const lastFocusLoadRef = React.useRef(Date.now());
  const lastHashFocusRef = React.useRef(Date.now());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set()); // SCNumber -> expanded
  const virtualParentRef = React.useRef(null); // для виртуализации списка
  const [currentUserId, setCurrentUserId] = useState(() => propCurrentUserId ?? null);
  const [userOfficeDept, setUserOfficeDept] = useState({ office: "", department: "" });
  const [distribution, setDistribution] = useState(null); // DcEmail item
  const [taskFieldNames, setTaskFieldNames] = useState([]);
  const [recipientField, setRecipientField] = useState(null);
  const [scNumberField, setScNumberField] = useState(null);
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [choices, setChoices] = useState([]);
  const [statusChoices, setStatusChoices] = useState([]); // eslint-disable-line no-unused-vars
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
  // Доп. действия для диалога Найдена (legacy путь через handleResultClick)
  const [pendingAdditionalActions, setPendingAdditionalActions] = useState(["Отправить ЕО в OTM"]);
  // const pendingAdditionalRequired = pendingAdditionalActions.length > 0 ? "Да" : "Нет"; // eslint unused
  const [fieldDefaultActions, setFieldDefaultActions] = useState(() => {
    const sync = getCachedAdditionalActionsDefaultSync();
    return sync !== null ? sync : null;
  });

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

  // get current user + Office/Department — дедуплицировано: если App уже передал currentUserId/userProfile, не дёргаем /web/currentuser и GetMyProperties снова
  useEffect(() => {
    if (propCurrentUserId) {
      setCurrentUserId(propCurrentUserId);
      // Title попробуем взять из пропов, иначе оставим как есть
      if (propUserProfile?.userTitle) setCurrentUserTitle(propUserProfile.userTitle);
      else if (propUserProfile?.userDisplayName) setCurrentUserTitle(propUserProfile.userDisplayName);
    } else {
      apiClient
        .get("/web/currentuser", { headers: { Accept: "application/json;odata=verbose" } })
        .then((r) => {
          setCurrentUserId(r?.data?.d?.Id || null);
          if (r?.data?.d?.Title) setCurrentUserTitle(r.data.d.Title);
        })
        .catch(() => setCurrentUserId(null));
    }
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
    // Один запрос вместо 3 параллельных на один и тот же /fields (критично для трафика)
    getTasksListFieldsOverview().then(({ fieldNames, recipientField: rf, scNumberField: scf }) => {
      setTaskFieldNames(fieldNames);
      // rf может быть null если поле Recipient удалено — не ставим дефолт "Recipient", данные берём из связанного элемента
      if (rf) setRecipientField(rf);
      else setRecipientField(null);
      if (scf) setScNumberField(scf);
    }).catch(() => {});
  }, [propUserProfile, propCurrentUserId]);

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

  // DBG: track fieldsLoading lifecycle
  React.useEffect(()=>{ if(!__DBG_ENABLED__) return; __dlog("[DBG:TasksView] fieldsLoading", fieldsLoading, "resultFieldsMeta", resultFieldsMeta.length, resultFieldInternalNames); }, [fieldsLoading, resultFieldsMeta.length]);
  // Смерженные mount-эффекты: entityType, ResultSearchTHU/Status choices, AdditionalActionsRequired тип, resultFieldsMeta — всё параллельно, один эффект
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFieldsLoading(true);
      // Параллелим независимые запросы
      const promises = [];
      // 1) entityType
      promises.push(
        apiClient.get(`${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(({ data }) => { if (!cancelled) setEntityType(data?.d?.ListItemEntityTypeFullName || null); })
          .catch(() => { if (!cancelled) setEntityType(null); })
      );
      // 2) ResultSearchTHU choices
      promises.push(
        apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'ResultSearchTHU'`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(({ data }) => {
            const field = data?.d?.results?.[0];
            if (!cancelled) {
              if (field?.Choices?.results) setChoices(field.Choices.results);
              else if (Array.isArray(field?.Choices)) setChoices(field.Choices);
              else setChoices([]);
            }
          }).catch(() => { if (!cancelled) setChoices([]); })
      );
      // 3) Status choices
      promises.push(
        apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'Status'`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(({ data }) => {
            const field = data?.d?.results?.[0];
            let arr = [];
            if (field?.Choices?.results) arr = field.Choices.results;
            else if (Array.isArray(field?.Choices)) arr = field.Choices;
            if (!cancelled) {
              setStatusChoices(arr);
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
              let inProg = arr.find((v) => String(v).toLowerCase().includes("в процессе"));
              if (!inProg) inProg = arr.find((v) => String(v).toLowerCase().includes("in progress"));
              if (!inProg) inProg = arr.find((v) => String(v).toLowerCase().includes("в работе"));
              if (inProg) setInProgressStatusValue(inProg);
              else setInProgressStatusValue("В процессе выполнения");
            }
          }).catch(() => {
            if (!cancelled) {
              setStatusChoices([]);
              setCompletedStatusValue("Завершена");
              setInProgressStatusValue("В процессе выполнения");
            }
          })
      );
      // 4) AdditionalActionsRequired тип
      promises.push(
        apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'AdditionalActionsRequired'`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(({ data }) => {
            const field = data?.d?.results?.[0];
            if (!cancelled && field) {
              const typeStr = String(field.TypeAsString || field.TypeDisplayName || "").toLowerCase();
              const isBool = typeStr.includes("boolean") || typeStr.includes("yes/no") || typeStr === "boolean" || typeStr === "yesno";
              setAdditionalRequiredIsBoolean(isBool);
            } else if (!cancelled) {
              setAdditionalRequiredIsBoolean(false);
            }
          }).catch(() => { if (!cancelled) setAdditionalRequiredIsBoolean(false); })
      );
      // 5) resultFieldsMeta + ctMap (динамическое поле результата)
      promises.push(
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
        })()
      );
      // 6) default AdditionalActions (кэшируется в sessionStorage)
      promises.push(
        fetchAdditionalActionsDefault(apiClient).then((vals) => {
          if (!cancelled) setFieldDefaultActions(vals);
        }).catch(() => { if (!cancelled) setFieldDefaultActions([]); })
      );
      await Promise.allSettled(promises);
      if (!cancelled) setFieldsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

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
    // Проверяем, есть ли новые ContentTypeId, которых нет в кэше — только тогда forceRefresh
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
      let _globalMatched = null; // eslint-disable-line no-unused-vars
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
              } catch (_eClean) { void _eClean;
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
            } catch (_eClean) { void _eClean;
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
              <span>
                <IconButton onClick={loadTasks} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </span>
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
              <TaskCard taskConfig={taskConfiguration.data} fieldDefaultActions={fieldDefaultActions}
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
          {(() => {
            const ctForDialog = String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim();
            const defForDialog = taskConfiguration.data?.taskResultDefinitions ? resolveTaskResultDefinition(pendingResult, ctForDialog, taskConfiguration.data.taskResultDefinitions) : null;
            const showForDialog = defForDialog ? !!defForDialog.showAdditionalActions : true;
            if (!showForDialog) return null;
            return (
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
                <AdditionalActionsField
                  fieldInternalName={taskConfiguration.data?.ctConfigMap?.get(String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim())?.additionalActionsField?.internalName || "AdditionalActions"}
                  required={pendingAdditionalActions.length > 0}
                  choices={(taskConfiguration.data?.ctConfigMap?.get(String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim())?.additionalActionsField?.choices || ADDITIONAL_ACTIONS_STANDARD).map(v=>typeof v==='string'?{value:v,label:v}:v)}
                  allowFillIn={taskConfiguration.data?.ctConfigMap?.get(String(pendingTask?.contentTypeId || pendingTask?.ContentTypeId || "").trim())?.additionalActionsField?.allowFillIn ?? true}
                  value={pendingAdditionalActions}
                  onChange={(next)=>{ setPendingAdditionalActions(next); if (pendingAdditionalError) setPendingAdditionalError(""); if (pendingCustomAction) setPendingCustomAction(""); }}
                  error={pendingAdditionalError}
                  disabled={updatingId === pendingTask?.Id}
                />
              </Box>
              {pendingAdditionalError && (
                <Typography variant="caption" sx={{ color: "#c62828", fontWeight: 600, display: "block", mt: 0.75 }}>{pendingAdditionalError}</Typography>
              )}
              {pendingAdditionalActions.length > 0 && !pendingAdditionalError && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>Выбрано: {pendingAdditionalActions.length}</Typography>
              )}
            </Box>
            );
          })()}
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
                  <TaskCard taskConfig={taskConfiguration.data} fieldDefaultActions={fieldDefaultActions}
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
