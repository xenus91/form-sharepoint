// @vitest-environment jsdom
// @filename: src/api/sharepoint/__tests__/client.cache.test.js
// Проверяет кэш/дедуп на НАСТОЯЩЕМ apiClient (со всеми его интерцепторами),
// подменяя только транспортный адаптер. Раньше такое проверяли на самодельном
// axios.create — и в реальном приложении пары запросов не схлопывались.
import { describe, it, expect, beforeEach } from "vitest";
import apiClient from "../client";
import { clearCache } from "../../../sp/cache";

describe("apiClient (реальный) — кэш и дедупликация", () => {
  let hits;

  beforeEach(() => {
    clearCache();
    hits = [];
    apiClient.defaults.adapter = (config) => {
      hits.push(config.url);
      return Promise.resolve({
        data: { d: { n: hits.length } },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    };
  });

  it("два одновременных GET /web/currentuser → один сетевой запрос", async () => {
    const url = "/web/currentuser?$select=Id,LoginName,Title";
    const [a, b] = await Promise.all([apiClient.get(url), apiClient.get(url)]);
    expect(hits).toEqual([url]);
    expect(b.data).toEqual(a.data);
  });

  it("повторный GET справочника берётся из кэша", async () => {
    const url = "/web/lists/getbytitle('TaskBehaviour')/items?$filter=Enabled eq 1";
    await apiClient.get(url);
    await apiClient.get(url);
    expect(hits).toEqual([url]);
  });

  it("метаданные полей с разным $filter — разные запросы", async () => {
    await apiClient.get("/web/lists(guid'X')/fields?$filter=InternalName eq 'Status'");
    await apiClient.get("/web/lists(guid'X')/fields?$filter=InternalName eq 'ResultSearchTHU'");
    expect(hits.length).toBe(2);
  });

  it("данные списков не кэшируются", async () => {
    const url = "/web/lists/getbytitle('ProblemsPallet')/items(25393)?$select=Id";
    await apiClient.get(url);
    await apiClient.get(url);
    expect(hits.length).toBe(2);
  });
});
