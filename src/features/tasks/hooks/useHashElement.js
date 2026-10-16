// src/features/tasks/hooks/useHashElement.js
// PR1 — вынос hash-роута элемента ProblemsPallet из TasksView.jsx
// Сохраняет бизнес-логику: RelatedItems 1→1, CAML + OData фолбэк, троттлинг, guards против storm cancellations
import { useState, useEffect, useMemo } from "react";
import { buildTaskIndex, findInIndex } from "../../../utils/taskIndex";
import { HASH_LOG, HASH_WARN } from "../../../tasks/log";
import { searchTaskByRelatedItem, fetchFullTask } from "../../../tasks/hashSearch";
import { resolveHashTarget, findTaskByIdInList } from "../../../tasks/hashRoute";
import { fetchProblemsPalletItem } from "../../../tasks/problemsPallet";
import { getGroupIdsFromDistribution } from "../../../tasks/distribution";
import { isCompletedStatus } from "../../../tasks/status";

export function useHashElement({ initialElementId, initialElementAction, initialElementKind = "auto", tasks, distribution, currentUserId, tab, setTab, isTabPending, startTabTransition }) {
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
  // "task" — открыта карточка задачи по её Id (#tasks/<TaskId>);
  // "element" — старый путь через элемент ProblemsPallet (RelatedItems.ItemId).
  const [matchMode, setMatchMode] = useState(null);

  const taskIndex = useMemo(() => buildTaskIndex(tasks), [tasks]);
  const findTaskByElementId = (allTasks, elementId) => findInIndex(taskIndex, elementId);

  useEffect(() => {
    if (initialElementId) setElementIdParam(String(initialElementId));
    else setElementIdParam(null);
  }, [initialElementId]);
  useEffect(() => {
    setElementActionParam(initialElementAction || null);
  }, [initialElementAction]);

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
      setMatchMode(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      HASH_LOG("hash run triggered", {elementIdParam, tasksLen: tasks.length, elementTaskMatch: elementTaskMatch?.Id, elementLoading, elementTaskSearching, distribution: distribution? getGroupIdsFromDistribution(distribution): null, currentUserId});
      if (elementTaskMatch && !elementLoading && !elementTaskSearching) {
        if (tasks.length > 0) {
          const stillMatched = findTaskByElementId(tasks, elementIdParam) || findTaskByIdInList(tasks, elementIdParam);
          if (stillMatched && stillMatched.Id === elementTaskMatch.Id) { HASH_LOG("guard: same task still matched, skip"); return; }
          if (elementTaskMatch && !stillMatched) { HASH_LOG("guard: keep global match, skip"); return; }
        } else {
          HASH_LOG("guard: tasks empty but have match, skip");
          return;
        }
      }
      if (elementLoading || elementTaskSearching) { HASH_LOG("guard: already loading/searching, skip"); return; }
      if (elementNotFound || elementError) {
        if (tasks.length > 0) {
          const localCheck = findTaskByElementId(tasks, elementIdParam) || findTaskByIdInList(tasks, elementIdParam);
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

      // #tasks/<id>: сначала пробуем открыть ЗАДАЧУ с этим Id (локально или
      // догрузив с сервера). Элемент ProblemsPallet — только фолбэк (см. hashRoute.js).
      const target = await resolveHashTarget(elementIdParam, {
        tasks,
        fetchTaskById: fetchFullTask,
        kind: initialElementKind === "element" ? "element" : "auto",
      });
      if (cancelled) { HASH_LOG("cancelled after resolveHashTarget"); return; }
      if (target.mode === "task" && target.task) {
        HASH_LOG("resolved as task by Id", target.task.Id, target.source);
        setMatchMode("task");
        setElementData(null);
        setElementLoading(false);
        setElementTaskSearching(false);
        setElementNotFound(false);
        setElementError("");
        setElementTaskMatch(target.task);
        if (!autoTabAppliedForElement) {
          const isComp = isCompletedStatus(target.task.Status, target.task.PercentComplete);
          const targetTab = isComp ? 1 : 0;
          if (tab !== targetTab) startTabTransition(() => setTab(targetTab));
          setAutoTabAppliedForElement(true);
        }
        return;
      }
      setMatchMode("element");
      if (tasks.length > 0) {
        matched = findTaskByElementId(tasks, elementIdParam);
        HASH_LOG("local findTaskByElementId", matched? `found #${matched.Id}` : "not found in local tasks");
      } else {
        HASH_LOG("local tasks empty, skip local search");
      }
      let elementDataLocal = null;
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
  }, [elementIdParam, distribution, currentUserId, initialElementKind]);

  useEffect(() => {
    if (elementTaskMatch && !autoTabAppliedForElement) {
      const isComp = isCompletedStatus(elementTaskMatch.Status, elementTaskMatch.PercentComplete);
      const targetTab = isComp ? 1 : 0;
      if (tab !== targetTab) startTabTransition(() => setTab(targetTab));
    }
  }, [elementTaskMatch, autoTabAppliedForElement, tab]);

  useEffect(() => { HASH_LOG("hash params changed", {elementIdParam, elementActionParam, tasksLen: tasks.length, loading: elementLoading, searching: elementTaskSearching}); }, [elementIdParam, elementActionParam]);

  useEffect(() => {
    HASH_LOG("autoTab reset for", elementIdParam);
    setAutoTabAppliedForElement(false);
  }, [elementIdParam]);

  const isHashMode = !!elementIdParam;

  return {
    tab, setTab, isTabPending, startTabTransition,
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
  };
}
