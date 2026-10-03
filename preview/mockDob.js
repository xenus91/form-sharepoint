// preview/mockDob.js — мок DOB-API для предпросмотра (npm run preview:cards).
// Подменяет `../api/dobApi` и `../api/dobClient` (см. preview/vite.config.js),
// чтобы показывать компоненты ДОБ без SharePoint.
//
// Данные взяты из реального примера пользователя: заявка «еуые», тип контента
// «Элемент», заполнено 2 поля — чтобы было видно, что чипов и поясняющих
// подписей в диалоге больше нет.

export const DOB_LIST_GUID = "21B5B544-BD98-4B06-891F-C5A137331394";
export const DOB_SITE_RELATIVE = "/sites/dob/doblogistic";
export const dobApiBase = () => "/dob-api/sites/dob/doblogistic/_api";
export const dobListApi = (listGuid = DOB_LIST_GUID) => `${dobApiBase()}/web/lists(guid'${listGuid}')`;
export const getDobDigest = async () => "mock-digest";

// ── Мини-эмуляция SharePoint для dob-СПИСКА ЗАДАЧ ────────────────────────────
// Нужна, чтобы предпросмотр и проверки могли прогнать взятие задачи в работу
// (takeTaskInWork → MERGE) без тенанта — включая ту самую VAT-проверку SharePoint:
// MERGE без `__metadata.type` отвечает 400 «Найдена запись без имени типа…».
// Так проверка доказывает, что фикс действительно закрывает ошибку.
export const DOB_TASKS_LIST_GUID = "03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3";
export const DOB_TASKS_LIST_API = `/web/lists(guid'${DOB_TASKS_LIST_GUID.toLowerCase()}')`;
export const DOB_TASKS_ENTITY_TYPE = "SP.Data.RequestsTaskListItem";
export const SHAREPOINT_NO_TYPE_ERROR =
  "Найдена запись без имени типа, но не указан ожидаемый тип. " +
  "Если указана модель, то необходимо также указать ожидаемый тип для поддержки записей, не имеющих сведений о типе.";

const TASK_STATUS_CHOICES = ["Не начата", "В работе", "Завершена"];
const TASK_ITEM = {
  Id: 1,
  Title: "Заявка ООБ",
  Status: "Не начата",
  PercentComplete: 0,
  Modified: "2026-10-03T00:29:42Z",
  Editor: { Id: 207, Title: "Поршаков Сергей" },
};

/** Журнал запросов к dob-списку задач (для проверок предпросмотра). */
export const dobRequests = [];

function spError(message, status = 400) {
  const err = new Error(message);
  err.response = { status, data: { error: { message: { value: message } } } };
  return err;
}

const dobGet = async (url) => {
  const u = decodeURIComponent(String(url));
  dobRequests.push({ method: "GET", url: u });
  if (u.includes("ListItemEntityTypeFullName")) {
    return { data: { d: { ListItemEntityTypeFullName: DOB_TASKS_ENTITY_TYPE } } };
  }
  if (/\/fields\?/.test(u)) {
    if (/InternalName eq 'Status'/.test(u)) {
      return { data: { d: { results: [{ InternalName: "Status", Title: "Статус", Choices: { results: TASK_STATUS_CHOICES } }] } } };
    }
    return { data: { d: { results: [] } } };
  }
  if (!/\/items/.test(u)) return { data: { d: { results: [] } } };
  // Как в тенанте: в ответе по элементу с $select имени типа нет — тип берётся
  // у списка (ListItemEntityTypeFullName), иначе MERGE упадёт с 400.
  const withSelect = /\$select=/.test(u);
  return {
    data: {
      d: withSelect
        ? { ...TASK_ITEM, __metadata: { etag: '"1"' } }
        : { ...TASK_ITEM, __metadata: { etag: '"1"', type: DOB_TASKS_ENTITY_TYPE } },
    },
  };
};

const dobPost = async (url, body, config) => {
  const isMerge = /merge/i.test(String(config?.headers?.["X-HTTP-Method"] || ""));
  dobRequests.push({ method: isMerge ? "MERGE" : "POST", url: String(url), body });
  if (isMerge && !body?.__metadata?.type) {
    // Точное поведение SharePoint: запись без имени типа не принимается.
    throw spError(SHAREPOINT_NO_TYPE_ERROR);
  }
  if (isMerge && body.Status) TASK_ITEM.Status = body.Status;
  return { status: 204, data: {} };
};

export const dobAxios = { get: dobGet, post: dobPost };

const FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text", Required: true },
  { InternalName: "Body", Title: "Описание", TypeAsString: "Note" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["Не начата", "В работе", "Завершена"] } },
  { InternalName: "AssignedTo", Title: "Кому назначено", TypeAsString: "User" },
  { InternalName: "DueDate", Title: "Срок", TypeAsString: "DateTime" },
  { InternalName: "Urgent", Title: "Срочно", TypeAsString: "Boolean" },
  { InternalName: "Comment", Title: "Комментарий", TypeAsString: "Note" },
  { InternalName: "EmptyField", Title: "Пустое поле", TypeAsString: "Text" },
  { InternalName: "Modified", Title: "Изменено", TypeAsString: "DateTime" },
  { InternalName: "ContentType", Title: "Тип контента", TypeAsString: "Text" },
];

const ITEM = {
  Id: 1,
  Title: "еуые",
  Body: "<p>Просмотр видеоархива за смену, проверить паллету <b>№456</b></p>",
  Status: "Не начата",
  AssignedTo: { Id: 207, Title: "Поршаков Сергей" },
  AssignedToId: 207,
  DueDate: "2026-10-07T12:00:00Z",
  Urgent: true,
  Comment: "",
  EmptyField: "",
  Modified: "2026-10-03T00:29:42Z",
  Created: "2026-10-03T00:29:41Z",
  Author: { Id: 207, Title: "Поршаков Сергей" },
  Editor: { Id: 207, Title: "Поршаков Сергей" },
  ContentType: { Name: "Элемент" },
};

export async function getDobFields() {
  return FIELDS;
}

export async function getDobItemForView() {
  return ITEM;
}

export async function getDobItem() {
  return ITEM;
}

export async function getDobAttachments() {
  return [];
}
