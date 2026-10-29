// preview/mockApi.js — заглушка SharePoint-клиента для локального предпросмотра карточек.
// НЕ используется в проде: подменяется только в preview/vite.config.js.

// Принципалы User Information List (см. src/features/tasks/lib/assignees.js).
// PrincipalType: 1 — пользователь, 8 — группа SharePoint.
const PRINCIPALS = {
  207: { Id: 207, Title: "Поршаков Сергей", LoginName: "i:0#.f|membership|porshakov@lenta.com", Email: "porshakov@lenta.com", PrincipalType: 1 },
  305: { Id: 305, Title: "Иванов Пётр", LoginName: "i:0#.f|membership|ivanov@lenta.com", Email: "ivanov@lenta.com", PrincipalType: 1 },
  411: { Id: 411, Title: "Смирнова Анна", LoginName: "i:0#.f|membership|smirnova@lenta.com", Email: "smirnova@lenta.com", PrincipalType: 1 },
  33: { Id: 33, Title: "Группа ООБ", LoginName: "Группа ООБ", Email: null, PrincipalType: 8 },
  42: { Id: 42, Title: "Поршаков Сергей", LoginName: "i:0#.f|membership|porshakov@lenta.com", Email: "porshakov@lenta.com", PrincipalType: 1 },
};

const RELATED_ROWS = [
  { Id: 24922, THU: "12345678901234567", DC_THU: "1050", Location1: "Ряд B, стеллаж 4", Recipient: { Title: "ООО Ромашка", SCNumberText: "SC-10234" } },
  { Id: 24923, THU: "76543210987654321", DC_THU: "1050", Location1: "Ряд A, стеллаж 1", Recipient: { Title: "ИП Иванов", SCNumberText: "SC-20001" } },
  { Id: 24924, THU: "11122233344455566", DC_THU: "1050", Location1: "Ряд C, стеллаж 7", Recipient: { Title: "АО Весна", SCNumberText: "SC-30002" } },
];

const apiClient = {
  get: async (url) => {
    if (typeof console !== "undefined") console.debug("[MOCK GET]", String(url).slice(0, 150));
    const decoded = decodeURIComponent(String(url));

    // ⚠️ Эмуляция прода: REST-фильтр по Choice-полю Status НЕ матчит ничего (0 строк),
    // хотя CAML те же задачи отдаёт.
    if (decoded.includes("Status eq")) {
      return { data: { d: { results: [], __count: 0 } } };
    }

    // Уточнение принципала «Кому назначено»: задача может прийти только с Id
    // (AssignedToId), тогда имя берётся отсюда (см. lib/assignees.js).
    const byId = decoded.match(/getuserbyid\((\d+)\)/i);
    if (byId) {
      const p = PRINCIPALS[Number(byId[1])];
      return { data: { d: p || { Id: Number(byId[1]), Title: "", LoginName: "", Email: "" } } };
    }
    const groupById = decoded.match(/sitegroups\/getbyid\((\d+)\)/i);
    if (groupById) {
      const p = PRINCIPALS[Number(groupById[1])];
      if (p && p.PrincipalType !== 1) return { data: { d: p } };
      return { data: { d: null } };
    }

    // Батч полей связанного элемента (relatedFields.js)
    if (decoded.includes("$filter")) {
      const ids = [...decoded.matchAll(/\(Id eq (\d+)\)/g)].map((m) => Number(m[1]));
      return { data: { d: { results: RELATED_ROWS.filter((r) => ids.includes(r.Id)) } } };
    }
    const m = String(url).match(/items\((\d+)\)/);
    if (m) {
      const row = RELATED_ROWS.find((r) => String(r.Id) === m[1]);
      return { data: { d: row || null } };
    }
    return { data: { d: { results: [] } } };
  },
  post: async (url, body) => {
    if (typeof console !== "undefined") console.debug("[MOCK POST]", String(url).slice(0, 80));
    // CAML работает. RowCount = числу возвращённых строк (такое поведение фермы у пользователя).
    if (String(url).includes("RenderListDataAsStream")) {
      const viewXml = String(body?.parameters?.ViewXml || "");
      const limitMatch = viewXml.match(/RowLimit Paged="TRUE">(\d+)</);
      const limit = limitMatch ? Number(limitMatch[1]) : 20;
      const all = [
        { ID: 901, Title: "Исправить паллет", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-20T10:00:00Z" },
        { ID: 902, Title: "Найти ЕО", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-19T10:00:00Z" },
        { ID: 904, Title: "Проверить ячейку", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-18T10:00:00Z" },
        { ID: 905, Title: "Переместить паллет", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-17T10:00:00Z" },
        { ID: 906, Title: "Списать ЕО", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-16T10:00:00Z" },
        { ID: 907, Title: "Проверить ТК", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-15T10:00:00Z" },
        { ID: 908, Title: "Исправить вес", Status: "Завершена", PercentComplete: 1, Modified: "2026-09-14T10:00:00Z" },
      ];
      // «в работе» не должен попасть в завершённые
      const rows = all.slice(0, limit);
      return { data: { d: { RenderListDataAsStream: { Row: rows, RowCount: rows.length, NextHref: rows.length < all.length ? "?Paged=TRUE&p_ID=908" : null } } } };
    }
    return { data: { d: {} } };
  },
  defaults: { headers: {} },
  interceptors: { request: { use: () => {} }, response: { use: () => {} } },
};

export default apiClient;
export const invalidate = () => {};
export const getCacheStats = () => ({});
export const cachedGet = (client, url, opts) => client.get(url, opts);
export const normalizeNextUrl = (u) => u;
