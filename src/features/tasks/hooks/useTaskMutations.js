// src/features/tasks/hooks/useTaskMutations.js
// PR2 — вынос мутаций задач (handleTakeInWork / completeTask) из TasksView без смены бизнес-логики
// ★ PR: completeTask теперь принимает promptFieldValues ({fieldName: value}) вместо одного locationValue (string).
//   Все callers (TasksView, TaskCard) обновлены. Legacy string → { Location1: string } для backward compat.
// Сохраняет: ETag, 412 race, optimistic update, AdditionalActions boolean/string фолбэки, статусы, SPD workflow
import { useState, useCallback } from "react";
import apiClient, { invalidate } from "../../../api";
import { getResultFieldForTask } from "../../../tasks/resultField";
import { isCompletedStatus, isNotStartedStatus, isInProgressStatus } from "../../../tasks/status";
import { TASKS_LIST_API } from "../../../tasks/config";

// Минимальное время, которое карточка проводит в состоянии «Сохранение...» (мс).
// Иначе при быстром ответе сервера оверлей мелькает и кажется, что карточка пропала мгновенно.
const MIN_OVERLAY_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Системные поля, которые НЕ должны перезаписываться из promptFieldValues.
// Защита от случайного damage при невалидной конфигурации TaskPromptFields.
const SYSTEM_FIELDS = new Set([
  "__metadata", "Id", "Status", "PercentComplete", "ContentTypeId",
  "Modified", "Created", "Editor", "EditorId", "EditorTitle",
  "AssignedTo", "Author", "RelatedItems", "Title", "Body",
  "ResultSearchTHU", "ResultSearchComplete",
]);

// Нормализация входного параметра promptFieldValues: legacy string → { Location1: string }
function normalizePromptFieldValues(arg) {
  if (arg === undefined || arg === null) return {};
  if (typeof arg === "string") return { Location1: arg };
  if (typeof arg === "object") return { ...arg };
  return {};
}

// Поля, которых нет в списке Tasks: если SharePoint вернул «свойство X не существует»,
// запоминаем это и больше не отправляем X в следующих запросах.
const missingFields = new Set();

function applyPromptFieldsToPayload(payload, promptFieldValues) {
  for (const [fieldName, value] of Object.entries(promptFieldValues || {})) {
    if (value === undefined || value === null) continue;
    if (SYSTEM_FIELDS.has(fieldName)) {
      console.warn(`[completeTask] system field '${fieldName}' blocked in promptFieldValues`);
      continue;
    }
    if (missingFields.has(fieldName)) {
      console.warn(`[completeTask] поле '${fieldName}' отсутствует в списке Tasks — пропускаю`);
      continue;
    }
    payload[fieldName] = value;
  }
}

/**
 * Достаёт имя «плохого» свойства из текста ошибки SharePoint.
 * Примеры сообщений:
 *   Свойство "AdditionalsActionsRequired" не существует в типе "SP.Data.ListListItem".
 *   A property named 'Foo' does not exist on type ...
 *   Column 'Foo' does not exist.
 */
function extractBadProperty(message) {
  const m = String(message || "");
  const patterns = [
    /(?:свойство|поле|столбец)\s+["«']?([^"»']+)["»']?\s+не\s+существует/i,
    /property\s+named\s+['"`]?([^'"`]+)['"`]?/i,
    /property\s+['"`]?([^'"`\s]+)['"`]?\s+does\s+not\s+exist/i,
    /column\s+['"`]?([^'"`]+)['"`]?\s+does\s+not\s+exist/i,
  ];
  for (const re of patterns) {
    const r = m.match(re);
    if (r && r[1]) return r[1].trim();
  }
  return "";
}

/**
 * Тип элемента списка (__metadata.type). Нужен для MERGE/POST:
 * с неверным типом SharePoint валидирует payload против «пустого» типа и
 * отвергает любые кастомные поля.
 */
async function resolveEntityType(known) {
  const accept = { headers: { Accept: "application/json;odata=verbose" } };
  if (known) return known;
  try {
    const { data } = await apiClient.get(`${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`, accept);
    if (data?.d?.ListItemEntityTypeFullName) return data.d.ListItemEntityTypeFullName;
  } catch {}
  try {
    const { data } = await apiClient.get(`${TASKS_LIST_API}/items?$top=1&$select=Id`, accept);
    const t = data?.d?.results?.[0]?.__metadata?.type;
    if (t) return t;
  } catch {}
  return "SP.Data.ListListItem";
}

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

      const et = await resolveEntityType(entityType);
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

  // Успешное завершение: держим оверлей минимум MIN_OVERLAY_MS, обновляем список и только
  // потом показываем snackbar — так карточка не «пропадает» раньше отклика сервера.
  const finishSuccess = useCallback(async (message, startedAt) => {
    const rest = MIN_OVERLAY_MS - (Date.now() - (startedAt || 0));
    if (rest > 0) await sleep(rest);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    invalidate("/items");
    if (typeof loadTasks === "function") await loadTasks({ silent: true });
    notify(message, { severity: "success" });
  }, [queryClient, invalidate, loadTasks, notify]);

  const completeTask = useCallback(async (task, resultValue, promptFieldValues, additionalRequired, additionalActions) => {
    // Backward compat: legacy string → { Location1: string }
    const normalizedPromptValues = normalizePromptFieldValues(promptFieldValues);
    const locationValue = normalizedPromptValues.Location1; // legacy contract — извлекаем для Location1-specific логики
    const prevTaskSnapshot = { ...task };
    const startedAt = Date.now();
    setUpdatingId(task.Id);
    const _norm = String(resultValue || "").trim().toLowerCase();
    const _isNotFound = _norm === "не найдена" || _norm === "не найден" || _norm === "не найдено";
    const _isFound = _norm === "найден" || _norm === "найдена";
    // Оверлей «Сохранение...» — один для любого результата (как при «Взять в работу»).
    setUpdatingAction("complete");
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
      // ⭐ NEW: spread остальных promptable-полей в optimistic state (не Location1)
      ...Object.fromEntries(Object.entries(normalizedPromptValues).filter(([k]) => k !== "Location1").map(([k, v]) => [k, v])),
      AdditionalsActionsRequired: _isNotFound ? "" : (_isFound ? (additionalRequired || "Нет") : (task.AdditionalsActionsRequired || "")),
      AdditionalActions: _isNotFound ? [] : (_isFound ? (additionalRequired === "Да" ? (additionalActions || []) : []) : (task.AdditionalActions || [])),
      // ⭐ НЕ выставляем Status/PercentComplete оптимистично: иначе задача сразу
      // отфильтровывается из вкладки «В работе» и карточка исчезает до ответа сервера,
      // из-за чего оверлей «Сохранение...» не виден. Статус применится после refresh.
      Modified: new Date().toISOString(),
    };
    // For queryKey parity we use distribution-agnostic key; TasksView also uses distribution Id variant — optimistic will still appear via invalidate
    const qkBase = ["tasks", currentUserId ?? null, distribution?.Id ?? distribution?.OffDepKey ?? null, (taskFieldNames || []).join(","), recipientField ?? null, scNumberField ?? null, resultFieldInternalNames.join(",")];
    queryClient.setQueryData(qkBase, (prev) => (Array.isArray(prev) ? prev.map((t) => (t.Id === task.Id ? { ...t, ..._optimistic } : t)) : prev));
    setElementTaskMatch?.((prev) => (prev && prev.Id === task.Id ? { ...prev, ..._optimistic } : prev));
    try {
      let serverEtag = "*";
      let itemEntityType = null;
      try {
        const resp = await apiClient.get(
          `${TASKS_LIST_API}/items(${task.Id})?$select=Id,Status,PercentComplete,${_resultFieldName},ResultSearchTHU,Location1,Modified,ContentTypeId`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const server = resp?.data?.d;
        itemEntityType = server?.__metadata?.type || null;
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

      // Тип элемента: берём из ответа по самому элементу (самый надёжный источник),
      // иначе — ListItemEntityTypeFullName списка.
      const et = await resolveEntityType(entityType || itemEntityType);

      const payload = { __metadata: { type: et }, [_resultFieldName]: resultValue };
      if (locationValue !== undefined && locationValue !== null) payload.Location1 = locationValue;
      else if (pendingResult && String(pendingResult).toLowerCase().includes("найден") && locationValue === undefined) { /* leave */ }
      // ⭐ NEW: spread остальных promptable-полей из TaskPromptFields (с фильтром системных)
      applyPromptFieldsToPayload(payload, Object.fromEntries(Object.entries(normalizedPromptValues).filter(([k]) => k !== "Location1")));

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
        // Behaviour.aa=false: не отправляем legacy AdditionalActions-поля.
        // Они могут отсутствовать в конкретном Tasks-листе и не нужны для результата «Не исправлено».
      } else if (_isFound) {
        const reqToSave = additionalRequired || "Нет";
        const actsToSave = reqToSave === "Да" ? (additionalActions || []) : [];
        // Поля доп. действий есть не во всех списках Tasks. Отправляем только существующие:
        // список полей известен (taskFieldNames) — проверяем, иначе доверяем авто-чистке payload.
        const hasListField = (name) =>
          missingFields.has(name)
            ? false
            : !Array.isArray(taskFieldNames) || taskFieldNames.length === 0
            ? true
            : taskFieldNames.some((f) => String(f).toLowerCase() === String(name).toLowerCase());
        const reqField = hasListField("AdditionalsActionsRequired")
          ? "AdditionalsActionsRequired"
          : hasListField("AdditionalActionsRequired")
            ? "AdditionalActionsRequired"
            : null;
        if (reqField) payload[reqField] = toSPRequired(reqToSave);
        if (hasListField("AdditionalActions")) {
          payload.AdditionalActions = { __metadata: { type: "Collection(Edm.String)" }, results: actsToSave };
        }
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
      // ⭐ Отправка с авто-очисткой: если SharePoint говорит «свойство X не существует» —
      // убираем X из payload и повторяем (до 6 полей за раз). Раньше такие ошибки
      // глушили весь request (например, удалённое поле AdditionalsActionsRequired).
      const postUpdateSafe = async (body, etagOverride) => {
        let current = { ...body };
        let lastErr = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            return await postUpdate(current, etagOverride);
          } catch (e) {
            lastErr = e;
            if (e?.response?.status === 412) throw e; // concurrency — обрабатывается выше
            const raw = String(e?.response?.data?.error?.message?.value || e?.message || "");
            const bad = extractBadProperty(raw);
            if (bad && Object.prototype.hasOwnProperty.call(current, bad)) {
              console.warn(`[completeTask] поле «${bad}» отсутствует в списке Tasks — отправляю без него`);
              missingFields.add(bad);
              delete current[bad];
              continue;
            }
            throw e;
          }
        }
        throw lastErr;
      };

      if (tryWithoutStatusFirst) {
        try {
          await postUpdateSafe(payload);
          try {
            const check = await apiClient.get(`${TASKS_LIST_API}/items(${task.Id})?$select=Status,PercentComplete`, { headers: { Accept: "application/json;odata=verbose" } });
            const curStatus = check?.data?.d?.Status;
            const curPc = check?.data?.d?.PercentComplete;
            if (!isCompletedStatus(curStatus, curPc)) await postUpdateSafe({ __metadata: { type: et }, Status: targetStatus, PercentComplete: 1 }, "*");
          } catch {}
        } catch (eNoStatus) {
          console.warn("NotFound without Status failed, trying with Status", eNoStatus?.response?.data);
          payloadWithStatus.Status = targetStatus;
          payloadWithStatus.PercentComplete = 1;
          try {
            await postUpdateSafe(payloadWithStatus);
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
                await postUpdateSafe(_isNotFound ? flip : flipWithStatus, "*");
                await finishSuccess(`Задача #${task.Id} завершена: ${resultValue}`, startedAt); return;
              } catch {}
            }
            if (msg.includes("additionalactions")) {
              try {
                const clean = { ...payload }; delete clean.AdditionalsActionsRequired; delete clean.AdditionalActions;
                const cleanWithStatus = { ...clean, Status: targetStatus, PercentComplete: 1 };
                try { await postUpdateSafe(cleanWithStatus, "*"); } catch { await postUpdateSafe(clean, "*"); }
                await finishSuccess(`Задача #${task.Id} завершена: ${resultValue}`, startedAt); return;
              } catch {}
            }
            const isFieldError = msg.includes("status") || msg.includes("percent");
            if (isFieldError) {
              try { await postUpdateSafe({ ...payload, Status: targetStatus }, "*"); } catch { try { await postUpdateSafe({ ...payload, PercentComplete: 1 }, "*"); } catch { await postUpdateSafe(payload, "*"); } }
            } else {
              const altStatus = targetStatus === "Завершена" ? "Completed" : "Завершена";
              try { await postUpdateSafe({ ...payload, Status: altStatus, PercentComplete: 1 }, "*"); } catch { await postUpdateSafe(payload, "*"); }
            }
          }
        }
      } else {
        try {
          await postUpdateSafe(payloadWithStatus);
        } catch (e) {
          const statusCode = e?.response?.status;
          if (statusCode === 412) { notify(`Задача #${task.Id} уже изменена другим пользователем. Обновите список.`, { severity: "warning" }); await loadTasks(); throw e; }
          const msg = String(e?.response?.data?.error?.message?.value || e?.response?.data || e?.message || "").toLowerCase();
          if (msg.includes("additionalactions")) {
            try {
              const clean = { ...payload }; delete clean.AdditionalsActionsRequired; delete clean.AdditionalActions;
              const cleanWithStatus = { ...clean, Status: targetStatus, PercentComplete: 1 };
              try { await postUpdateSafe(cleanWithStatus, "*"); } catch { await postUpdateSafe(clean, "*"); }
              await finishSuccess(`Задача #${task.Id} завершена: ${resultValue}`, startedAt); return;
            } catch {}
          }
          const isFieldError = msg.includes("status") || msg.includes("percent");
          if (isFieldError) {
            try { await postUpdateSafe({ ...payload, Status: targetStatus }, "*"); } catch { try { await postUpdateSafe({ ...payload, PercentComplete: 1 }, "*"); } catch { await postUpdateSafe(payload, "*"); } }
          } else {
            const altStatus = targetStatus === "Завершена" ? "Completed" : "Завершена";
            try { await postUpdateSafe({ ...payload, Status: altStatus, PercentComplete: 1 }, "*"); } catch { await postUpdateSafe(payload, "*"); }
          }
        }
      }

      // Карточка остаётся с оверлеем до обновления списка, и только потом показываем snackbar.
      const rest = MIN_OVERLAY_MS - (Date.now() - startedAt);
      if (rest > 0) await sleep(rest);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      invalidate("/items");
      await loadTasks({ silent: true });
      notify(`Задача #${task.Id} завершена: ${resultValue}`, { severity: "success" });
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
  }, [entityType, completedStatusValue, additionalRequiredIsBoolean, resultFieldsMeta, ctResultMap, currentUserId, currentUserTitle, taskFieldNames, recipientField, scNumberField, resultFieldInternalNames, queryClient, loadTasks, notify, setElementTaskMatch, pendingResult, finishSuccess]);

  return { updatingId, setUpdatingId, updatingAction, setUpdatingAction, handleTakeInWork, completeTask };
}
