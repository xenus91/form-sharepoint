// Изменение AssignedTo для задачи из списка Tasks основного SharePoint-сайта.
// Поле обновляется отдельно от завершения задачи: MERGE затрагивает только
// AssignedToId и использует свежий ETag, чтобы не перетирать параллельные правки.

import apiClient from "../../api";
import { TASKS_LIST_API, TASKS_LIST_GUID } from "../config";
import { isDistributionListPrincipalType } from "../principalTypes";

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const CONTENT_TYPE = "application/json;odata=verbose";

function responseItem(response) {
  return response?.data?.d || response?.data || null;
}

function responseRows(response) {
  const data = responseItem(response);
  if (Array.isArray(data?.results)) return data.results;
  return data ? [data] : [];
}

function listGuidOf(task) {
  return String(task?.listGuid || task?.sourceListGuid || "").replace(/[{}]/g, "").toUpperCase();
}

function assertMainTask(task) {
  const sourceId = String(task?.sourceId || "").trim();
  const guid = listGuidOf(task);
  if ((sourceId && sourceId !== "main") || (guid && guid !== TASKS_LIST_GUID.toUpperCase())) {
    throw new Error("Менять рассылку можно только у задачи основного списка Tasks.");
  }
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} должен быть положительным целым числом.`);
  }
  return number;
}

function hasCollectionShape(value) {
  return Array.isArray(value) || Array.isArray(value?.results);
}

function isMultiUserField(field, freshTask) {
  const type = String(field?.TypeAsString || "").trim().toLowerCase();
  if (type === "usermulti" || field?.AllowMultipleValues === true || String(field?.AllowMultipleValues).toLowerCase() === "true") {
    return true;
  }
  if (type === "user" || field?.AllowMultipleValues === false || String(field?.AllowMultipleValues).toLowerCase() === "false") {
    return false;
  }

  // В GET с $expand AssignedTo одиночный User приходит объектом {Id, Title},
  // а UserMulti — коллекцией {results: [...]}. Не угадываем тип по доменной
  // модели: mapRawTask сводит оба формата к scalar AssignedToId.
  const value = freshTask?.AssignedTo;
  if (hasCollectionShape(value)) return true;
  if (value && typeof value === "object" && Number(value.Id) > 0) return false;
  return null;
}

async function resolveItemEntityType(get, listApi, item, fallbackEntityType) {
  if (item?.__metadata?.type) return String(item.__metadata.type);
  if (fallbackEntityType) return String(fallbackEntityType);
  try {
    const response = await get(`${listApi}?$select=ListItemEntityTypeFullName`, ACCEPT);
    const type = responseItem(response)?.ListItemEntityTypeFullName;
    if (type) return String(type);
  } catch (_e) {
    void _e;
  }
  try {
    const response = await get(`${listApi}/items?$top=1&$select=Id`, ACCEPT);
    const type = responseRows(response)[0]?.__metadata?.type;
    if (type) return String(type);
  } catch (_e) {
    void _e;
  }
  return null;
}

/**
 * Записывает одну выбранную рассылку в AssignedTo.
 *
 * @param {object} task — задача из основного списка Tasks
 * @param {{Id:number, Title:string, LoginName?:string, Email?:string, PrincipalType:number}} assignee
 * @param {{get?:Function, post?:Function, listApi?:string, entityType?:string}} [deps]
 * @returns {Promise<{assigneeId:number, isMultiple:boolean, etag:string, response:any}>}
 */
export async function updateTaskAssignedTo(task, assignee, deps = {}) {
  assertMainTask(task);
  const taskId = positiveInteger(task?.Id ?? task?.ID, "Id задачи");
  const assigneeId = positiveInteger(assignee?.Id, "Id рассылки");
  if (!isDistributionListPrincipalType(assignee?.PrincipalType)) {
    throw new Error("В поле AssignedTo можно выбрать только список рассылки.");
  }

  const get = deps.get || ((url, config) => apiClient.get(url, config));
  const post = deps.post || ((url, body, config) => apiClient.post(url, body, config));
  const listApi = deps.listApi || TASKS_LIST_API;
  const itemUrl = `${listApi}/items(${taskId})`;
  const itemSelect = `${itemUrl}?$select=Id,AssignedTo/Id,AssignedTo/Title,Modified&$expand=AssignedTo`;
  const fieldUrl = `${listApi}/fields?$filter=InternalName eq 'AssignedTo'&$select=InternalName,TypeAsString,AllowMultipleValues&$top=1`;

  const freshResponse = await get(itemSelect, ACCEPT);
  const freshTask = responseItem(freshResponse);
  if (!freshTask || Number(freshTask.Id) !== taskId) {
    throw new Error(`Задача #${taskId} не найдена в списке Tasks.`);
  }
  const etag = freshTask?.__metadata?.etag
    || freshResponse?.headers?.etag
    || freshResponse?.headers?.ETag
    || freshResponse?.headers?.["etag"];
  if (!etag || etag === "*") {
    throw new Error("Не удалось получить актуальный ETag задачи для безопасного сохранения.");
  }

  let field = null;
  try {
    field = responseRows(await get(fieldUrl, ACCEPT))[0] || null;
  } catch (_e) {
    // На старых SharePoint REST-ответах метаданные поля могут не прочитаться;
    // ниже пробуем определить многозначность по форме значения AssignedTo.
    void _e;
  }
  const isMultiple = isMultiUserField(field, freshTask);
  if (isMultiple === null) {
    throw new Error("Не удалось определить тип поля «AssignedTo» в списке Tasks.");
  }

  const entityType = await resolveItemEntityType(get, listApi, freshTask, deps.entityType);
  if (!entityType) {
    throw new Error("Не удалось определить тип элемента списка Tasks для сохранения.");
  }

  const collection = {
    __metadata: { type: "Collection(Edm.Int32)" },
    results: [assigneeId],
  };
  const payload = {
    __metadata: { type: entityType },
    AssignedToId: isMultiple ? collection : assigneeId,
  };
  const response = await post(itemUrl, payload, {
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": CONTENT_TYPE,
      "IF-MATCH": etag,
      "X-HTTP-Method": "MERGE",
    },
  });

  return { assigneeId, isMultiple, etag, response };
}

/** Локальный shape карточки после подтверждённой записи в SharePoint. */
export function buildTaskAssignedToPatch(task, assignee, { isMultiple = false, modified = new Date().toISOString() } = {}) {
  const id = positiveInteger(assignee?.Id, "Id рассылки");
  const title = String(assignee?.Title || assignee?.LoginName || `Id ${id}`).trim();
  const person = {
    Id: id,
    Title: title,
    ...(assignee?.LoginName ? { LoginName: assignee.LoginName } : {}),
    ...(assignee?.Email ? { Email: assignee.Email } : {}),
  };
  const rawAssignedTo = isMultiple ? { results: [person] } : person;
  const rawAssignedToId = isMultiple
    ? { __metadata: { type: "Collection(Edm.Int32)" }, results: [id] }
    : id;

  return {
    AssignedTo: title,
    // mapRawTask сохраняет первый Id scalar-ом и для single-, и для multi-поля.
    AssignedToId: id,
    Modified: modified,
    raw: {
      ...(task?.raw || {}),
      AssignedTo: rawAssignedTo,
      AssignedToId: rawAssignedToId,
      Modified: modified,
    },
  };
}
