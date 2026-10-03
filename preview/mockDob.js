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
export const dobAxios = { get: async () => ({ data: { d: { results: [] } } }), post: async () => ({ data: { d: {} } }) };

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
