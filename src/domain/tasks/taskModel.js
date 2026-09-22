// src/domain/tasks/taskModel.js
// Domain Task — централизованная модель, шаг 4.1 плана.
// Не меняет бизнес-данные, только нормализует SharePoint REST item → domain object.
// Preserve: relatedProblem = RelatedItems[0], result = dynamic Result field, additionalActions = single field пока.
// Future: resolver подключит metadata (resultField.js) и TaskTypeConfiguration.

import { mapRawTask } from "../../tasks/mapping";

/**
 * Нормализует raw SharePoint task в Domain Task.
 * Совместим с текущим UI: сохраняет все поля mapRawTask + добавляет aliases.
 * @param {object} raw REST item (data.d)
 * @param {object} opts { recipientField, scNumberField, fieldMeta?, ctMap? } — для будущего resolver
 * @returns {DomainTask}
 */
export function toDomainTask(raw, opts = {}) {
  const base = mapRawTask(raw, opts);

  // relatedProblem — первый элемент RelatedItems
  let relatedProblem = null;
  try {
    let rel = base.RelatedItems;
    if (typeof rel === "string") rel = JSON.parse(rel);
    if (Array.isArray(rel) && rel[0]) {
      const first = rel[0];
      const listId = String(first.ListId || first.listId || "").replace(/[{}]/g, "");
      const itemId = first.ItemId || first.itemId || first.ItemID || null;
      if (listId && itemId) relatedProblem = { listId, itemId: Number(itemId), raw: first, json: base.RelatedItems };
    }
  } catch {}

  // contentTypeName — из raw ContentType.Name если есть (для отладки, не ключ)
  let contentTypeName = null;
  try {
    if (raw.ContentType && raw.ContentType.Name) contentTypeName = raw.ContentType.Name;
    else if (raw.ContentTypeName) contentTypeName = raw.ContentTypeName;
  } catch {}

  // result — универсальное представление (пока без resolver, value = ResultSearchTHU)
  const result = {
    fieldInternalName: opts.fieldMeta?.internalName || "ResultSearchTHU",
    value: base.ResultSearchTHU || base.ResultValue || "",
    rawValue: base.raw?.[opts.fieldMeta?.internalName || "ResultSearchTHU"] ?? "",
    choices: opts.fieldMeta?.choices || null,
  };

  // additionalActions — пока одно поле AdditionalActions (случай A плана), resolver позже выберет поле по CT
  const additionalActions = {
    fieldInternalName: opts.additionalFieldMeta?.internalName || "AdditionalActions",
    value: base.AdditionalActions || [],
    required: base.AdditionalsActionsRequired || "",
    requiredField: "AdditionalsActionsRequired",
    choices: opts.additionalFieldMeta?.choices || null,
    allowFillIn: opts.additionalFieldMeta?.allowFillIn ?? true,
  };

  return {
    // legacy aliases (совместимость с TaskCard/TasksView)
    ...base,
    // domain aliases ( §9 )
    id: base.Id,
    title: base.Title,
    status: base.Status,
    assignedTo: { id: base.AssignedToId, title: base.AssignedTo },
    contentTypeId: base.ContentTypeId,
    contentTypeName,
    relatedProblem,
    result,
    additionalActions,
    // helpers
    isCompleted: undefined, // заполняется через isCompletedStatus(status,percent) вне модели
  };
}

/**
 * Batch helper — маппит массив raw → domain.
 */
export function toDomainTasks(rawArray, opts = {}) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray.map((r) => toDomainTask(r, opts));
}
