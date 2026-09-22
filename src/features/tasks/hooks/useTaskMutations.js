// src/features/tasks/hooks/useTaskMutations.js
// PR2 — вынос мутаций задач (handleTakeInWork / completeTask) из TasksView без смены бизнес-логики
// Сохраняет: ETag, 412 race, optimistic update, AdditionalActions boolean/string фолбэки, статусы, SPD workflow
import { useState, useCallback } from "react";
import apiClient, { invalidate } from "../../../api";
import { getResultFieldForTask } from "../../../tasks/resultField";
import { isCompletedStatus, isNotStartedStatus, isInProgressStatus } from "../../../tasks/status";
import { TASKS_LIST_API } from "../../../tasks/config";

export function useTaskMutations({
  entityType,
  completedStatusValue,
  inProgressStatusValue,
  additionalRequiredIsBoolean,
  resultFieldsMeta,
  ctResultMap,
  taskConfiguration,
  fieldDefaultActions, // not directly used but kept for dep array parity
  currentUserId,
  currentUserTitle,
  distribution,
  taskFieldNames,
  recipientField,
  scNumberField,
  resultFieldInternalNames = [],
  queryClient,
  loadTasks,
  notify,
  setElementTaskMatch,
  pendingResult,
}) {
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingAction, setUpdatingAction] = useState(null); // take | found | notFound

  const handleTakeInWork = useCallback(async (task) => {
    setUpdatingId(task.Id);
    setUpdatingAction("take");
    try {
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
        if (!isNotStartedStatus(freshStatus)) {
          if (isCompletedStatus(freshStatus, d?.PercentComplete)) {
            notify(`Задача #${task.Id} уже завершена пользователем ${freshEditor || "—"} (${freshStatus}). Возьмите другую задачу.`, { severity: "warning" });
          } else if (isInProgressStatus(freshStatus)) {
            notify(`Задача #${task.Id} уже в работе у ${freshEditor || "другого пользователя"} (${freshStatus}). Возьмите другую задачу.`, { severity: "warning" });
          } else {
            notify(`Задача #${task.Id} уже обрабатывается: ${freshStatus} у ${freshEditor || "—"}. Возьмите другую задачу.`, { severity: "warning" });
          }
          const _freshOpt = { Status: freshStatus, Modified: freshModified, EditorTitle: freshEditor, Editor: freshEditor, EditorId: freshEditorId };
          queryClient.setQueryData(
            ["tasks", currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames || []).join(","), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(",")],
            (prev) => (Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ..._freshOpt } : t)) : prev)
          );
          // fallback: also try distribution-based key if param not used downstream (preserve both shapes)
          // direct distribution key variant — kept for compatibility with TasksView queryKey shape
          setElementTaskMatch?.((prev) => (prev && prev.Id === task.Id ? { ...prev, ..._freshOpt } : prev));
          await loadTasks();
          return;
        }
      } catch (e) {
        console.warn("take check fetch failed", e?.response?.status);
      }

      let et = entityType;
      if (!et) {
        try {
          const { data } = await apiClient.get(`${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`, { headers: { Accept: "application/json;odata=verbose" } });
          et = data?.d?.ListItemEntityTypeFullName;
        } catch {}
      }
      if (!et) et = "SP.Data.ListListItem";
      const targetInProgress = inProgressStatusValue || "В процессе выполнения";
      const payload = { __metadata: { type: et }, Status: targetInProgress };
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
          try {
            const check = await apiClient.get(`${TASKS_LIST_API}/items(${task.Id})?$select=Status,Editor/Id,Editor/Title&$expand=Editor`, { headers: { Accept: "application/json;odata=verbose" } });
            const s = check?.data?.d?.Status || "";
            const ed = check?.data?.d?.Editor?.Title || "другим пользователем";
            notify(`Задача #${task.Id} уже взята пользователем ${ed} (${s}). Возьмите другую задачу.`, { severity: "warning" });
            const edId = check?.data?.d?.Editor?.Id || null;
            queryClient.setQueryData(
              ["tasks", currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames || []).join(","), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(",")],
              (prev) => (Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, Status: s, EditorTitle: ed, Editor: ed, EditorId: edId } : t)) : prev)
            );
          } catch {}
          await loadTasks();
          return;
        }
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
      const _takeOpt = { Status: targetInProgress, Modified: new Date().toISOString(), EditorTitle: currentUserTitle || "Вы", Editor: currentUserTitle || "Вы", EditorId: currentUserId };
      queryClient.setQueryData(
        ["tasks", currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames || []).join(","), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(",")],
        (prev) => (Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ..._takeOpt } : t)) : prev)
      );
      setElementTaskMatch?.((prev) => (prev && prev.Id === task.Id ? { ...prev, ..._takeOpt } : prev));
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      invalidate("/items");
      await loadTasks({ silent: true });
    } catch (err) {
      const msg = err?.response?.data?.error?.message?.value || err?.message || "Ошибка";
      notify(`Не удалось взять задачу #${task.Id}: ${msg}`, { severity: "error" });
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  }, [entityType, inProgressStatusValue, currentUserId, currentUserTitle, notify, loadTasks, queryClient, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames, setElementTaskMatch]);

  const completeTask = useCallback(async (task, resultValue, locationValue, additionalRequired, additionalActions) => {
    const prevTaskSnapshot = { ...task };
    setUpdatingId(task.Id);
    const _norm = String(resultValue || "").trim().toLowerCase();
    const _isNotFound = _norm === "не найдена" || _norm === "не найден" || _norm === "не найдено";
    const _isFound = _norm === "найден" || _norm === "найдена";
    setUpdatingAction(_isNotFound ? "notFound" : _isFound ? "found" : null);
    if (_isFound) {
      const reqNorm = String(additionalRequired || "Нет").trim();
      const acts = Array.isArray(additionalActions) ? additionalActions.filter(Boolean).map((v) => String(v).trim()).filter(Boolean) : [];
      if (reqNorm === "Да" && acts.length === 0) {
        notify("Выберите хотя бы одно дополнительное действие или выберите \"Нет\"", { severity: "warning" });
        setUpdatingId(null);
        setUpdatingAction(null);
        return;
      }
      additionalRequired = reqNorm;
      additionalActions = reqNorm === "Да" ? acts : [];
    } else if (_isNotFound) {
      additionalRequired = "";
      additionalActions = [];
    } else {
      additionalRequired = additionalRequired ? String(additionalRequired).trim() : (task.AdditionalsActionsRequired || "");
      additionalActions = Array.isArray(additionalActions) ? additionalActions : (task.AdditionalActions || []);
    }
    let _targetStatusOpt = completedStatusValue || "Завершена";
    if (_targetStatusOpt && String(_targetStatusOpt).toLowerCase().includes("в процессе")) _targetStatusOpt = "Завершена";
    const _fieldMetaForTask = getResultFieldForTask(task, ctResultMap, resultFieldsMeta) || { internalName: "ResultSearchTHU" };
    const _resultFieldName = _fieldMetaForTask.internalName || "ResultSearchTHU";
    const _optimistic = {
      [_resultFieldName]: resultValue,
      ResultSearchTHU: resultValue,
      Location1: locationValue !== undefined && locationValue !== null ? locationValue : task.Location1,
      AdditionalsActionsRequired: _isNotFound ? "" : (_isFound ? (additionalRequired || "Нет") : (task.AdditionalsActionsRequired || "")),
      AdditionalActions: _isNotFound ? [] : (_isFound ? (additionalRequired === "Да" ? (additionalActions || []) : []) : (task.AdditionalActions || [])),
      Status: _targetStatusOpt,
      PercentComplete: 1,
      Modified: new Date().toISOString(),
    };
    // For queryKey parity we use distribution-agnostic key; TasksView also uses distribution Id variant — optimistic will still appear via invalidate
    const qkBase = ["tasks", currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames || []).join(","), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(",")];
    queryClient.setQueryData(qkBase, (prev) => (Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ..._optimistic } : t)) : prev));
    setElementTaskMatch?.((prev) => (prev && prev.Id === task.Id ? { ...prev, ..._optimistic } : prev));
    try {
      let serverEtag = "*";
      try {
        const resp = await apiClient.get(
          `${TASKS_LIST_API}/items(${task.Id})?$select=Id,Status,PercentComplete,${_resultFieldName},ResultSearchTHU,Location1,AdditionalsActionsRequired,AdditionalActions,Modified,ContentTypeId`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const server = resp?.data?.d;
        serverEtag = server?.__metadata?.etag || resp?.headers?.etag || resp?.headers?.ETag || resp?.headers?.["etag"] || "*";
        if (server && isCompletedStatus(server.Status, server.PercentComplete)) {
          notify(`Задача #${task.Id} уже выполнена другим пользователем: ${server.ResultSearchTHU || server.Status}`, { severity: "warning" });
          const _srvFieldName = _resultFieldName;
          const _srvVal = server[_srvFieldName] ?? server.ResultSearchTHU ?? "";
          queryClient.setQueryData(qkBase, (prev) => Array.isArray(prev) ? prev.map((t) => t.Id === task.Id ? { ...t, Status: server.Status, PercentComplete: server.PercentComplete, ResultSearchTHU: _srvVal, [_srvFieldName]: _srvVal, Modified: server.Modified } : t) : prev);
          await loadTasks();
          return;
        }
      } catch (checkErr) {
        console.warn("concurrency check failed", checkErr?.response?.status, checkErr?.message);
      }

      let et = entityType;
      if (!et) {
        try {
          const { data } = await apiClient.get(`${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`, { headers: { Accept: "application/json;odata=verbose" } });
          et = data?.d?.ListItemEntityTypeFullName;
        } catch {}
      }
      if (!et) et = "SP.Data.ListListItem";

      const payload = { __metadata: { type: et }, [_resultFieldName]: resultValue };
      if (locationValue !== undefined && locationValue !== null) payload.Location1 = locationValue;
      else if (pendingResult && String(pendingResult).toLowerCase().includes("найден") && locationValue === undefined) { /* leave */ }

      const toSPRequired = (reqStr) => {
        if (additionalRequiredIsBoolean === true) {
          if (reqStr === "Да") return true;
          if (reqStr === "Нет") return false;
          if (reqStr === "") return false;
          return false;
        } else if (additionalRequiredIsBoolean === false) return reqStr;
        else {
          if (reqStr === "Да") return true;
          if (reqStr === "Нет") return false;
          if (reqStr === "") return false;
          return reqStr;
        }
      };
      if (_isNotFound) {
        const val = additionalRequiredIsBoolean === true ? false : (additionalRequiredIsBoolean === false ? null : false);
        payload.AdditionalsActionsRequired = val;
        payload.AdditionalActions = { __metadata: { type: "Collection(Edm.String)" }, results: [] };
      } else if (_isFound) {
        const reqToSave = additionalRequired || "Нет";
        const actsToSave = reqToSave === "Да" ? (additionalActions || []) : [];
        payload.AdditionalsActionsRequired = toSPRequired(reqToSave);
        payload.AdditionalActions = { __metadata: { type: "Collection(Edm.String)" }, results: actsToSave };
      }

      const normalizedResult = String(resultValue).trim().toLowerCase();
      const isNotFoundResult = normalizedResult === "не найдена" || normalizedResult === "не найден" || normalizedResult === "не найдено";
      let payloadWithStatus = { ...payload };
      let targetStatus = completedStatusValue || "Завершена";
      if (targetStatus && String(targetStatus).toLowerCase().includes("в процессе")) targetStatus = "Завершена";
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

      if (tryWithoutStatusFirst) {
        try {
          await postUpdate(payload);
          try {
            const check = await apiClient.get(`${TASKS_LIST_API}/items(${task.Id})?$select=Status,PercentComplete`, { headers: { Accept: "application/json;odata=verbose" } });
            const curStatus = check?.data?.d?.Status;
            const curPc = check?.data?.d?.PercentComplete;
            if (!isCompletedStatus(curStatus, curPc)) await postUpdate({ __metadata: { type: et }, Status: targetStatus, PercentComplete: 1 }, "*");
          } catch {}
        } catch (eNoStatus) {
          console.warn("NotFound without Status failed, trying with Status", eNoStatus?.response?.data);
          payloadWithStatus.Status = targetStatus;
          payloadWithStatus.PercentComplete = 1;
          try {
            await postUpdate(payloadWithStatus);
          } catch (e) {
            const statusCode = e?.response?.status;
            if (statusCode === 412) { notify(`Задача #${task.Id} уже изменена другим пользователем. Обновите список.`, { severity: "warning" }); await loadTasks(); throw e; }
            const msg = String(e?.response?.data?.error?.message?.value || e?.response?.data || e?.message || "").toLowerCase();
            // fallbacks (boolean/string, spelling, cleaning) — trimmed but keeps core robustness
            if (msg.includes("edm.boolean") || (msg.includes("boolean") && msg.includes("additional"))) {
              try {
                const flip = { ...payload };
                if (_isFound) flip.AdditionalsActionsRequired = (additionalRequired || "Нет") === "Да" ? true : false; else if (_isNotFound) flip.AdditionalsActionsRequired = false;
                const flipWithStatus = { ...flip, Status: targetStatus, PercentComplete: 1 };
                await postUpdate(_isNotFound ? flip : flipWithStatus, "*");
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); invalidate("/items"); setTimeout(() => loadTasks({ silent: true }), 600); return;
              } catch {}
            }
            if (msg.includes("additionalactions")) {
              try {
                const clean = { ...payload }; delete clean.AdditionalsActionsRequired; delete clean.AdditionalActions;
                const cleanWithStatus = { ...clean, Status: targetStatus, PercentComplete: 1 };
                try { await postUpdate(cleanWithStatus, "*"); } catch { await postUpdate(clean, "*"); }
                notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); invalidate("/items"); setTimeout(() => loadTasks({ silent: true }), 600); return;
              } catch {}
            }
            const isFieldError = msg.includes("status") || msg.includes("percent");
            if (isFieldError) {
              try { await postUpdate({ ...payload, Status: targetStatus }, "*"); } catch { try { await postUpdate({ ...payload, PercentComplete: 1 }, "*"); } catch { await postUpdate(payload, "*"); } }
            } else {
              const altStatus = targetStatus === "Завершена" ? "Completed" : "Завершена";
              try { await postUpdate({ ...payload, Status: altStatus, PercentComplete: 1 }, "*"); } catch { await postUpdate(payload, "*"); }
            }
          }
        }
      } else {
        try {
          await postUpdate(payloadWithStatus);
        } catch (e) {
          const statusCode = e?.response?.status;
          if (statusCode === 412) { notify(`Задача #${task.Id} уже изменена другим пользователем. Обновите список.`, { severity: "warning" }); await loadTasks(); throw e; }
          const msg = String(e?.response?.data?.error?.message?.value || e?.response?.data || e?.message || "").toLowerCase();
          if (msg.includes("additionalactions")) {
            try {
              const clean = { ...payload }; delete clean.AdditionalsActionsRequired; delete clean.AdditionalActions;
              const cleanWithStatus = { ...clean, Status: targetStatus, PercentComplete: 1 };
              try { await postUpdate(cleanWithStatus, "*"); } catch { await postUpdate(clean, "*"); }
              notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); invalidate("/items"); setTimeout(() => loadTasks({ silent: true }), 600); return;
            } catch {}
          }
          const isFieldError = msg.includes("status") || msg.includes("percent");
          if (isFieldError) {
            try { await postUpdate({ ...payload, Status: targetStatus }, "*"); } catch { try { await postUpdate({ ...payload, PercentComplete: 1 }, "*"); } catch { await postUpdate(payload, "*"); } }
          } else {
            const altStatus = targetStatus === "Завершена" ? "Completed" : "Завершена";
            try { await postUpdate({ ...payload, Status: altStatus, PercentComplete: 1 }, "*"); } catch { await postUpdate(payload, "*"); }
          }
        }
      }

      notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      invalidate("/items");
      setTimeout(() => loadTasks({ silent: true }), 600);
    } catch (e) {
      console.error("complete task error", e);
      const msg = e?.response?.data?.error?.message?.value || e?.message || "Ошибка обновления задачи";
      notify(msg, { severity: "error" });
      queryClient.setQueryData(qkBase, (prev) => Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ResultSearchTHU: prevTaskSnapshot.ResultSearchTHU, Location1: prevTaskSnapshot.Location1, AdditionalsActionsRequired: prevTaskSnapshot.AdditionalsActionsRequired, AdditionalActions: prevTaskSnapshot.AdditionalActions, Status: prevTaskSnapshot.Status, PercentComplete: prevTaskSnapshot.PercentComplete, Modified: prevTaskSnapshot.Modified } : t)) : prev);
      setElementTaskMatch?.((prev) => (prev && prev.Id === task.Id ? { ...prev, ResultSearchTHU: prevTaskSnapshot.ResultSearchTHU, Location1: prevTaskSnapshot.Location1, AdditionalsActionsRequired: prevTaskSnapshot.AdditionalsActionsRequired, AdditionalActions: prevTaskSnapshot.AdditionalActions, Status: prevTaskSnapshot.Status, PercentComplete: prevTaskSnapshot.PercentComplete, Modified: prevTaskSnapshot.Modified } : prev));
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  }, [entityType, completedStatusValue, additionalRequiredIsBoolean, resultFieldsMeta, ctResultMap, currentUserId, currentUserTitle, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames, queryClient, loadTasks, notify, setElementTaskMatch, pendingResult]);

  return { updatingId, setUpdatingId, updatingAction, setUpdatingAction, handleTakeInWork, completeTask };
}
