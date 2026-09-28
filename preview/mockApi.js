// preview/mockApi.js — заглушка SharePoint-клиента для локального предпросмотра карточек.
// НЕ используется в проде: подменяется только в preview/vite.config.js.
const RELATED_ROWS = [
  { Id: 101, THU: "12345678901234567", DC_THU: "1050", Recipient: { Title: "ООО Ромашка", SCNumberText: "SC-10234" } },
  { Id: 102, THU: "76543210987654321", DC_THU: "1050", Recipient: { Title: "ИП Иванов", SCNumberText: "SC-20001" } },
  { Id: 103, THU: "11122233344455566", DC_THU: "1050", Recipient: { Title: "АО Весна", SCNumberText: "SC-30002" } },
];

const apiClient = {
  get: async (url) => {
    // Батч полей связанного элемента (relatedFields.js)
    if (String(url).includes("$filter")) {
      const ids = [...String(url).matchAll(/\(Id eq (\d+)\)/g)].map((m) => Number(m[1]));
      return { data: { d: { results: RELATED_ROWS.filter((r) => ids.includes(r.Id)) } } };
    }
    const m = String(url).match(/items\((\d+)\)/);
    if (m) {
      const row = RELATED_ROWS.find((r) => String(r.Id) === m[1]);
      return { data: { d: row || null } };
    }
    return { data: { d: { results: [] } } };
  },
  post: async () => ({ data: { d: {} } }),
  defaults: { headers: {} },
  interceptors: { request: { use: () => {} }, response: { use: () => {} } },
};

export default apiClient;
export const invalidate = () => {};
export const getCacheStats = () => ({});
export const cachedGet = (client, url, opts) => client.get(url, opts);
export const normalizeNextUrl = (u) => u;
