// preview/mockApi.js — заглушка SharePoint-клиента для локального предпросмотра карточек.
// НЕ используется в проде: подменяется только в preview/vite.config.js.
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
