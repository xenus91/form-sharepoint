// src/tasks/listQuery.js
// Чистый билдер URL для REST-запроса списка задач.
// Раньше жило inline в TasksView.jsx как closure-функция buildUrl() внутри loadTasks —
// вынесено в Tier 3 (Q11) для упрощения loadTasks и переиспользования в других местах.

import { TASKS_LIST_API } from "./config";
import { getGroupIdsFromDistribution } from "./distribution";

const SELECT_BASE = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,ContentTypeId";
const SELECT_BASE_NO_DUE = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,Created,Modified,PercentComplete,Editor/Id,Editor/Title,ContentTypeId";
// eslint-disable-next-line no-unused-vars
const SELECT_ADDITIONAL = "AdditionalActionsRequired,AdditionalActions";

/**
 * @typedef {object} BuildTaskListQueryOpts
 * @property {string[]} [taskFieldNames=[]] — доступные поля в списке (OffDepKey, RelatedItems, WorkflowItemId)
 * @property {boolean} [useDueDate=true] — выбирать ли поле DueDate
 * @property {boolean} [useAdditionalActions=true] — включать ли AdditionalActions поля
 * @property {string|null} [recipientField=null] — InternalName поля Recipient (Lookup)
 * @property {string[]} [resultFieldInternalNames=[]] — InternalName полей результата (динамически по ContentType)
 * @property {object|null} [distribution=null] — DcEmail-запись (для фильтра по группе)
 * @property {number|null} [currentUserId=null] — Id текущего пользователя (fallback для фильтра)
 * @property {number} [top=100] — page size
 * @property {string} [orderBy="Created asc"]
 */

/**
 * Строит абсолютный URL (относительно API base) для получения списка задач.
 * Возвращает строку типа "/web/lists(guid'…')/items?$select=…&$expand=…&$filter=…&$orderby=Created asc&$top=100".
 *
 * Логика фильтра AssignedToId:
 *   - если есть distribution с Email.Id → фильтр по этим Id групп
 *   - иначе fallback на OffDepKey (если поле есть)
 *   - иначе AssignedToId eq currentUserId
 *
 * @param {BuildTaskListQueryOpts} [opts]
 * @returns {string}
 */
export function buildTaskListQuery(opts = {}) {
  let {
    taskFieldNames = [],
    useDueDate = true,
    useAdditionalActions = true,
    recipientField = null,
    useRecipient = null,
    distribution = null,
    currentUserId = null,
    top = 100,
    orderBy = "Created asc",
  } = opts;

  // Защита: удалённое поле EndJob фильтруем из всех входных массивов
  if (Array.isArray(taskFieldNames) && taskFieldNames.some((f) => String(f).toLowerCase() === "endjob")) {
    console.warn("[listQuery] filtered EndJob from taskFieldNames");
    taskFieldNames = taskFieldNames.filter((f) => String(f).toLowerCase() !== "endjob");
  }
  // Extra select fields (OffDepKey, Recipient expand, RelatedItems, WorkflowItemId, AdditionalActions, Result fields)
  const extraFields = [];
  // Динамические поля результата — фильтруем удалённые поля (EndJob был удалён)
  if (opts.resultFieldInternalNames && Array.isArray(opts.resultFieldInternalNames)) {
    for (const fn of opts.resultFieldInternalNames) {
      if (fn && typeof fn === "string" && fn.trim() && fn.trim().toLowerCase() !== "endjob" && !extraFields.includes(fn.trim())) {
        extraFields.push(fn.trim());
      }
    }
  }
  if (taskFieldNames.length === 0 || taskFieldNames.includes("OffDepKey")) extraFields.push("OffDepKey");
  // Recipient в Tasks отсутствует — не используем дефолт "Recipient" на первом рендере.
  // Раньше делали fallback "Recipient" при taskFieldNames.length===0, что давало 400 "Recipient не существует" и кучу ретраев.
  // Теперь Recipient берём только если он явно определён (recipientField !== null) или useRecipient === true.
  const shouldUseRecipient = useRecipient !== null ? useRecipient : !!recipientField;
  const effectiveRecipientFieldRaw = shouldUseRecipient ? (recipientField || null) : null;
  const effectiveRecipientField = effectiveRecipientFieldRaw && effectiveRecipientFieldRaw.toLowerCase() === "endjob" ? null : effectiveRecipientFieldRaw;
  if (effectiveRecipientField && shouldUseRecipient) {
    if (effectiveRecipientField.toLowerCase() === "endjob" || effectiveRecipientField.toLowerCase() === "recipient" && !shouldUseRecipient) {
      console.warn("[listQuery] blocked", effectiveRecipientField, "as recipient field");
    } else {
      extraFields.push(`${effectiveRecipientField}/Id`);
      extraFields.push(`${effectiveRecipientField}/Title`);
    }
  }
  // RelatedItems — критично для enrich (там лежит ListId/ItemId → оттуда тянем Recipient/THU), поэтому всегда берём на первом рендере
  if (taskFieldNames.length === 0 || taskFieldNames.includes("RelatedItems")) extraFields.push("RelatedItems");
  if (taskFieldNames.length === 0 || taskFieldNames.includes("WorkflowItemId")) extraFields.push("WorkflowItemId");
  // AdditionalActions поля — включаем если useAdditionalActions и поле есть в списке или ещё не загружен список полей (для первой загрузки)
  // Это безопасно для старых списков без этих полей — при 400 ошибке loadTasks сделает retry без них.
  const hasAdditionalFields = taskFieldNames.length === 0 || taskFieldNames.includes("AdditionalActions") || taskFieldNames.includes("AdditionalActionsRequired");
  if (useAdditionalActions && hasAdditionalFields) {
    // Добавляем оба поля разом, если хотя бы одно есть — сервер вернёт только существующие, но лучше проверить оба
    if (taskFieldNames.length === 0 || taskFieldNames.includes("AdditionalActionsRequired")) extraFields.push("AdditionalActionsRequired");
    if (taskFieldNames.length === 0 || taskFieldNames.includes("AdditionalActions")) extraFields.push("AdditionalActions");
    // Fallback: если taskFieldNames пустой, добавим оба — если одного нет, retry без них сработает
    if (taskFieldNames.length === 0 && !extraFields.includes("AdditionalActionsRequired")) {
      extraFields.push("AdditionalActionsRequired", "AdditionalActions");
    }
  }

  const selectFieldsBase = useDueDate ? SELECT_BASE : SELECT_BASE_NO_DUE;
  // Если useAdditionalActions false — не добавляем AdditionalActions даже если они есть в extraFields (для retry)
  let finalExtra = extraFields;
  if (!useAdditionalActions) {
    finalExtra = extraFields.filter((f) => f !== "AdditionalActionsRequired" && f !== "AdditionalActions");
  }
  const selectFields = finalExtra.length
    ? `${selectFieldsBase},${finalExtra.join(",")}`
    : selectFieldsBase;

  // Expand
  const expands = ["AssignedTo", "Editor"];
  const effectiveExpandRecipient = shouldUseRecipient ? (recipientField || null) : null;
  if (effectiveExpandRecipient && shouldUseRecipient) expands.push(effectiveExpandRecipient);

  // Filter по AssignedToId — серверный фильтр по группе + текущему юзеру (OR), чтобы персональные задачи не терялись.
  // OffDepKey в Tasks больше не используем как фолбэк — он ненадёжен (поле может быть пустым/неиндексированным и даёт 0).
  // Поэтому: если группа найдена — фильтр (group1 or group2 or currentUserId), иначе только currentUserId.
  let assignedFilter;
  if (distribution) {
    const groupIds = getGroupIdsFromDistribution(distribution);
    if (groupIds.length > 0) {
      // Включаем и группу и персональный Id, чтобы фолбэк работал даже когда группа существует но задач в ней нет
      const allIds = [...new Set([...groupIds.map(Number), currentUserId].filter((v) => v != null && !Number.isNaN(v)).map(Number))];
      if (allIds.length === 0) {
        assignedFilter = `AssignedToId eq ${currentUserId}`;
      } else if (allIds.length === 1) {
        assignedFilter = `AssignedToId eq ${allIds[0]}`;
      } else {
        assignedFilter = `(${allIds.map((id) => `AssignedToId eq ${id}`).join(" or ")})`;
      }
      // Лог для отладки фолбэка
      if (allIds.length !== groupIds.length) {
        console.log("buildTaskListQuery: group + personal OR", { groupIds, currentUserId, filter: assignedFilter });
      }
    } else {
      assignedFilter = `AssignedToId eq ${currentUserId}`;
      if (distribution.OffDepKey) {
        console.warn("DcEmail: группа не найдена для OffDepKey", distribution.OffDepKey, "— fallback к AssignedToId", currentUserId);
      }
    }
  } else {
    assignedFilter = `AssignedToId eq ${currentUserId}`;
  }
  if (!currentUserId) {
    console.warn("buildTaskListQuery: currentUserId=null, фильтр будет невалидным", assignedFilter);
  }

  return `${TASKS_LIST_API}/items` +
    `?$select=${selectFields}` +
    `&$expand=${expands.join(",")}` +
    `&$filter=${encodeURIComponent(assignedFilter)}` +
    `&$orderby=${orderBy}&$top=${top}`;
}