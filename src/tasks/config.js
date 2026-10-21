// src/tasks/config.js
// Константы SharePoint для задач. Раньше жили на module scope в TasksView.jsx.
// GUID взят из исходников — это список "Tasks" в SharePoint.

export const TASKS_LIST_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639";
export const TASKS_LIST_API = `/web/lists(guid'${TASKS_LIST_GUID}')`;

// RowLimit для CAML при hash-поиске. Раньше было 100 → цикл fetchFullTask по
// всем кандидатам мог делать до 101 запроса. Теперь берём топ-20 свежих
// + fetchFullTask только для лучшего кандидата.
/** GUID списка → REST-путь к списку на СВОЁМ сайте. */
export function listApiForGuid(guid = TASKS_LIST_GUID) {
  const clean = String(guid || TASKS_LIST_GUID).trim().replace(/^\{|\}$/g, "");
  return `/web/lists(guid'${clean.toLowerCase()}')`;
}

export const HASH_CAML_ROW_LIMIT = 20;

// Поля AdditionalsActionsRequired и AdditionalActions в списке Tasks удалены
// (запрос с ними падал в 400 «Поле или свойство … не существует»). Названия
// полей больше нигде не упоминаются; список значений ниже — только справочник
// для UI, к полям SharePoint отношения не имеет.
export const ADDITIONAL_ACTIONS_STANDARD = [
  "Отправить ЕО в OTM",
  "Переместить в корректную линию",
  "Перебрать",
];

// Дефолт из настроек поля SharePoint (чтобы не хардкодить). Кэшируется в sessionStorage.
let _cachedDefaultActions = null;
export async function fetchAdditionalActionsDefault() {
  // Поле AdditionalActions в списке Tasks больше не существует, поэтому его
  // DefaultValue не запрашиваем (запрос давал 400). Дефолты берутся из
  // TaskActionDefinitions — см. getDefaultsForThisTask в TaskCard.
  _cachedDefaultActions = [];
  return _cachedDefaultActions;
}
export function getCachedAdditionalActionsDefaultSync() {
  return _cachedDefaultActions;
}

// Select/expand для fetchFullTask (используется в TasksView и hashSearch). WorkflowItemId выпилен — всегда null
export const FULL_TASK_SELECT = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,RelatedItems,ContentTypeId";
export const FULL_TASK_EXPAND = "AssignedTo,Editor";

// Минимальный select для hash-polling (60с) — нужны только поля для диффа статуса, а не весь Title/Body
// Поля AdditionalsActionsRequired и AdditionalActions в списке Tasks удалены —
// запрос с ними падал в 400 «Поле или свойство … не существует».
export const HASH_POLL_SELECT = "Id,Status,PercentComplete,Modified,ResultSearchTHU,Location1";
export const HASH_POLL_EXPAND = "";

// EndJob поле удалено из списка Tasks — гарантируем, что его нет ни в одном select
export const REMOVED_FIELDS = ["EndJob"];