// src/features/tasks/hooks/useHashPolling.js
// PR2 — polling для hash-режима и фокус-инвалидация вынесены из TasksView
import { useEffect, useRef } from "react";
import apiClient from "../../../api";
import { createAdaptivePolling } from "../../../utils/polling";
import { mapRawTask } from "../../../tasks/mapping";
import { TASKS_LIST_API, HASH_POLL_SELECT, HASH_POLL_EXPAND } from "../../../tasks/config";
import { isDobTaskFlag } from "../../../tasks/contentTypeFields";

/**
 * Polling запрашивает короткий набор полей (HASH_POLL_SELECT), поэтому маппинг
 * «теряет» признаки задачи (IsDobTask, ContentTypeId, raw). Раньше объект задачи
 * в state ЗАМЕНЯЛСЯ на такой урезанный — и задача ДОБ после первого же опроса
 * переставала опознаваться (её открывало обычной формой). Здесь признаки
 * переносятся из предыдущего объекта.
 */
function mergePolledTask(prev, mapped, raw) {
  if (!prev) return mapped;
  return {
    ...mapped,
    ContentTypeId: mapped.ContentTypeId || prev.ContentTypeId || null,
    IsDobTask: isDobTaskFlag(mapped.IsDobTask) || isDobTaskFlag(prev.IsDobTask)
      || isDobTaskFlag(prev.raw?.IsDobTask) || isDobTaskFlag(raw?.IsDobTask),
    raw: { ...(prev.raw || {}), ...(raw || {}) },
  };
}

export function useHashPolling({ isHashMode, elementTaskMatch, setElementTaskMatch, setIsHashTaskRefreshing, recipientField, scNumberField, currentUserId, distribution, taskFieldNames, resultFieldInternalNames, queryClient, lastHashFocusRef }) {
  useEffect(() => {
    if (!isHashMode || !elementTaskMatch) return;
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
          const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=${_finalHashSelect}${_hashExpand}`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
          _hashData = data;
        } catch (eHash) {
          const _m = String(eHash?.response?.data?.error?.message?.value || eHash?.message || "").toLowerCase();
          if (_m.includes("endjob")) {
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
        const mapped = mergePolledTask(elementTaskMatch, mapRawTask(raw, { recipientField, scNumberField }), raw);
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
            const _fbSelect = "Id,Status,PercentComplete,Modified,ResultSearchTHU,Location1";
            const _fbExpand = HASH_POLL_EXPAND ? `&$expand=${HASH_POLL_EXPAND}` : "";
            const { data } = await apiClient.get(`${TASKS_LIST_API}/items(${elementTaskMatch.Id})?$select=${_fbSelect}${_fbExpand}`, { headers: { Accept: "application/json;odata=verbose" }, __noCache: true });
            const raw = data?.d;
            if (!raw || cancelled) return;
            const mapped = mergePolledTask(elementTaskMatch, mapRawTask(raw, { recipientField, scNumberField }), raw);
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
    const stop = createAdaptivePolling({ fn: refreshHashTask, intervalMs: 60_000, maxBackoffMs: 5 * 60_000, pauseWhenHidden: true, onError: (e) => console.warn("[polling] refreshHashTask error, backing off:", e?.response?.status || e?.message) });
    const onFocus = () => {
      const now = Date.now();
      if (now - lastHashFocusRef.current < 30000) return;
      lastHashFocusRef.current = now;
      refreshHashTask();
    };
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; stop(); window.removeEventListener("focus", onFocus); };
  }, [isHashMode, elementTaskMatch?.Id]);
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
