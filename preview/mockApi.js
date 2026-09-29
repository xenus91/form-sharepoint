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
    // Батч полей связанного элемента (relatedFields.js)
    // Счётчик завершённых: эмулируем прод — substringof на Choice-поле даёт 400
    if (String(url).includes("$inlinecount=allpages")) {
      const decoded = decodeURIComponent(String(url));
      if (decoded.includes("substringof")) {
        const err = new Error("Request failed with status code 400");
        err.response = { status: 400, data: { error: { message: { value: "Value does not fall within the expected range." } } } };
        throw err;
      }
      return { data: { d: { results: [], __count: 4 } } };
    }
    if (String(url).includes("$filter")) {
      const decoded = decodeURIComponent(String(url));
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
    // RenderListDataAsStream: эмулируем прод — «битое» поле RelatedItems ломает ViewFields (500)
    if (String(url).includes("RenderListDataAsStream")) {
      const viewXml = String(body?.parameters?.ViewXml || "");
      if (viewXml.includes('Name="RelatedItems"')) {
        const err = new Error("Request failed with status code 500");
        err.response = {
          status: 500,
          data: { error: { message: { value: "Один или несколько типов полей установлены неправильно. Перейдите на страницу параметров списка и удалите эти поля." } } },
        };
        throw err;
      }
      const rows = [
        { ID: 901, Title: "Исправить паллет", Status: "Завершена", PercentComplete: 1, AssignedTo: "Поршаков Сергей", Modified: "2026-09-20T10:00:00Z" },
        { ID: 902, Title: "Найти ЕО", Status: "Завершена", PercentComplete: 1, AssignedTo: "Поршаков Сергей", Modified: "2026-09-19T10:00:00Z" },
        { ID: 903, Title: "В работе (должна отсеяться)", Status: "В процессе выполнения", PercentComplete: 0, AssignedTo: "Поршаков Сергей", Modified: "2026-09-18T10:00:00Z" },
      ];
      return { data: { d: { RenderListDataAsStream: { Row: rows, RowCount: rows.length, NextHref: null } } } };
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
