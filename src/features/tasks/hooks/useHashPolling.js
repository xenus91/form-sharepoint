// src/features/tasks/hooks/useHashPolling.js
// PR2 — polling для hash-режима и фокус-инвалидация вынесены из TasksView
import { useEffect } from "react";
import apiClient from "../../../api";
import { createAdaptivePolling } from "../../../utils/polling";
import { mapRawTask } from "../../../tasks/mapping";
import { TASKS_LIST_API, HASH_POLL_SELECT, HASH_POLL_EXPAND } from "../../../tasks/config";
/**
 * Polling запрашивает короткий набор полей (HASH_POLL_SELECT). Его ответ надо
 * слить с уже открытой задачей как patch: mapRawTask иначе превращает незапрошенные
 * Title/Body/AssignedTo и прочие поля в пустые значения, из-за чего карточка
 * сбрасывалась до «Без текста». ContentTypeId и raw также сохраняем.
 */
const POLLED_FIELDS = [
  ["Status", "Status"],
  ["PercentComplete", "PercentComplete"],
  ["Modified", "Modified"],
  ["ResultSearchTHU", "ResultSearchTHU"],
  ["ResultValue", "ResultSearchTHU"],
  ["Location1", "Location1"],
];

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

/**
 * HASH_POLL_SELECT intentionally omits the body/title and assignment fields.
 * Treat the poll response as a patch, not a replacement: mapRawTask fills
 * omitted fields with empty defaults, which used to erase the visible card.
 */
export function mergePolledTask(prev, mapped, raw) {
  if (!prev) return mapped;
  const next = { ...prev };
  for (const [taskField, rawField] of POLLED_FIELDS) {
    if (hasOwn(raw, rawField)) next[taskField] = mapped[taskField];
  }
  next.ContentTypeId = mapped.ContentTypeId || prev.ContentTypeId || null;
  next.isDobTask = mapped.isDobTask === true || prev.isDobTask === true;
  next.raw = { ...(prev.raw || {}), ...(raw || {}) };
  return next;
}

function hasSamePolledFields(prev, mapped, raw) {
  if (!prev) return false;
  return POLLED_FIELDS.every(([taskField, rawField]) => {
    if (!hasOwn(raw, rawField)) return true;
    if (taskField === "PercentComplete") {
      return String(prev[taskField]) === String(mapped[taskField]);
    }
    return prev[taskField] === mapped[taskField];
  });
}

export function useHashPolling({ isHashMode, elementTaskMatch, setElementTaskMatch, setIsHashTaskRefreshing, recipientField, scNumberField, currentUserId, distribution, taskFieldNames, resultFieldInternalNames, queryClient, lastHashFocusRef }) {
  const elementTaskId = elementTaskMatch?.Id;
  const taskFieldNamesKey = (taskFieldNames || []).join(",");
  const resultFieldNamesKey = (resultFieldInternalNames || []).join(",");

  useEffect(() => {
    if (!isHashMode || elementTaskId == null) return;
    let cancelled = false;
    const refreshHashTask = async () => {
      if (cancelled) return;
      setIsHashTaskRefreshing(true);
      try {
        const _hashSelect = HASH_POLL_SELECT;
        const _hashExpand = HASH_POLL_EXPAND ? `&$expand=${HASH_POLL_EXPAND}` : "";
        const _cleanHashSelect = _hashSelect.split(",").filter((f) => f.trim().toLowerCase() !== "endjob").join(",");
        const _finalHashSelect = _cleanHashSelect.trim() ? _cleanHashSelect : "Id,Modified";
        let _hashData = null;
        try {
          const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskId})?$select=${_finalHashSelect}${_hashExpand}`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
          _hashData = data;
        } catch (eHash) {
          const _m = String(eHash?.response?.data?.error?.message?.value || eHash?.message || "").toLowerCase();
          if (_m.includes("endjob")) {
            try {
              const { data: _retry } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskId})?$select=Id,Modified,Status,PercentComplete`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
              _hashData = _retry;
            } catch (retryError) {
              void retryError;
            }
          }
          if (!_hashData) throw eHash;
        }
        const data = _hashData;
        const raw = data?.d;
        if (!raw || cancelled) return;
        const mapped = mapRawTask(raw, { recipientField, scNumberField });
        setElementTaskMatch((prev) => {
          if (hasSamePolledFields(prev, mapped, raw)) return prev;
          return mergePolledTask(prev, mapped, raw);
        });
        queryClient.setQueryData(['tasks', currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, taskFieldNamesKey, recipientField ?? null, scNumberField ?? null, resultFieldNamesKey], (prev) => {
          if (!Array.isArray(prev)) return prev;
          const existing = prev.find((task) => task.Id === mapped.Id);
          if (!existing || hasSamePolledFields(existing, mapped, raw)) return prev;
          return prev.map((task) => task.Id === mapped.Id
            ? mergePolledTask(task, mapped, raw)
            : task);
        });
      } catch {
        // Поля AdditionalsActionsRequired/AdditionalActions из select убраны,
        // поэтому отдельный ретрай «без них» больше не нужен.
      } finally {
        if (!cancelled) setIsHashTaskRefreshing(false);
      }
    };
    const stop = createAdaptivePolling({ fn: refreshHashTask, intervalMs: 60_000, maxBackoffMs: 5 * 60_000, pauseWhenHidden: true, onError: (e) => console.warn("[polling] refreshHashTask error, backing off:", e?.response?.status || e?.message) });
    const onFocus = () => {
      const now = Date.now();
      if (now - lastHashFocusRef.current < 30000) return;
      lastHashFocusRef.current = now;
      refreshHashTask();
    };
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; stop(); window.removeEventListener("focus", onFocus); };
  }, [
    currentUserId,
    distribution?.Id,
    distribution?.OffDepKey,
    elementTaskId,
    isHashMode,
    lastHashFocusRef,
    queryClient,
    recipientField,
    resultFieldNamesKey,
    scNumberField,
    setElementTaskMatch,
    setIsHashTaskRefreshing,
    taskFieldNamesKey,
  ]);
}

export function useTasksFocusPolling({ currentUserId, isHashMode, queryClient, lastFocusLoadRef }) {
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
  }, [currentUserId, isHashMode, queryClient, lastFocusLoadRef]);
}
