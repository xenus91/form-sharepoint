// src/tasks/__tests__/multiSourceLoad.test.js
// Интеграционный тест multi-source загрузки: #tasks должен находить задачи
// пользователя и групп из DcEmail, а таблица — не падать на полях, которых нет
// в списке.
//
// Источник один — список Tasks на этом сайте. Заявки и задачи ДОБ вынесены в
// отдельное приложение xenus91/dob-requests на своём сайте (2026-10-16),
// поэтому кросс-сайтовых сценариев здесь больше нет.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  requests: [],
}));

const MAIN_ITEM = { Id: 10, Title: "Основная задача", Status: "Не начата", Created: "2026-10-01T10:00:00Z", Modified: "2026-10-03T10:00:00Z", AssignedTo: { Id: 5, Title: "Текущий" } };

vi.mock("../sourceClient", () => ({
  makeSourceClient: (source) => ({
    name: source.id,
    apiBase: "",
    toRequestUrl: (url) => url,
    listApi: async () => source.listApi || "",
    get: async (url) => {
      state.requests.push({ sourceId: source.id, url });
      if (url.includes("/web/currentuser")) {
        return { data: { d: { Id: 5 } } };
      }
      return { data: { d: { results: [MAIN_ITEM] } } };
    },
    post: async () => ({ data: {} }),
    merge: async () => ({ data: {} }),
  }),
}));

const { fetchTasksMultiSource } = await import("../multiSource");
const { getSourceById } = await import("../sources");

const SOURCES = [getSourceById("main")];

const SITE_IDS = {
  main: { userId: 5, principalIds: [33], ok: true },
};

describe("fetchTasksMultiSource — сквозная загрузка источника main", () => {
  beforeEach(() => {
    state.requests = [];
  });

  it("возвращает задачи источника с compositeId/sourceId/sourceLabel", async () => {
    const res = await fetchTasksMultiSource({
      sources: SOURCES,
      principals: [{ id: 33, title: "ООБ", kind: "group", kindHint: "group" }],
      nativePrincipalIds: [33, 34],
      sitePrincipalIds: SITE_IDS,
      omitResultFields: true,
    });

    expect(res.items).toHaveLength(1);
    const main = res.items.find((t) => t.sourceId === "main");
    expect(main.compositeId).toBe("main:10");
    expect(main.sourceLabel).toBe("Образцово");
    expect(main.Title).toBe("Основная задача");
    expect(res.errors).toEqual([]);
  });

  it("фильтр: пользователь + группы + родные Id DcEmail.Email", async () => {
    await fetchTasksMultiSource({
      sources: SOURCES,
      principals: [{ id: 33, title: "ООБ", kind: "group", kindHint: "group" }],
      nativePrincipalIds: [33, 34],
      sitePrincipalIds: SITE_IDS,
    });
    const mainReq = state.requests.find((r) => r.sourceId === "main");
    const filter = decodeURIComponent(mainReq.url);
    expect(filter).toContain("AssignedToId eq 5");
    expect(filter).toContain("AssignedToId eq 33");
    expect(filter).toContain("AssignedToId eq 34");
    expect(filter).toContain("PercentComplete ne 1");
  });

  // omitResultFields управляет ДОПОЛНИТЕЛЬНЫМИ полями результата (которые
  // приходят из типов контента), а не базовым набором колонок списка.
  it("omitResultFields=true не добавляет дополнительные поля результата", async () => {
    await fetchTasksMultiSource({
      sources: SOURCES,
      sitePrincipalIds: SITE_IDS,
      omitResultFields: true,
      resultFieldInternalNames: ["CustomResultField"],
    });
    const last = state.requests[state.requests.length - 1];
    const select = decodeURIComponent(last.url).match(/\$select=([^&]*)/)[1];
    expect(select).not.toContain("CustomResultField");
    expect(select).toContain("RelatedItems");
  });

  it("omitResultFields=false добавляет дополнительные поля результата", async () => {
    await fetchTasksMultiSource({
      sources: SOURCES,
      sitePrincipalIds: SITE_IDS,
      omitResultFields: false,
      resultFieldInternalNames: ["CustomResultField"],
    });
    const last = state.requests[state.requests.length - 1];
    const select = decodeURIComponent(last.url).match(/\$select=([^&]*)/)[1];
    expect(select).toContain("CustomResultField");
  });

  it("perSourceStats содержит assignedIds источника", async () => {
    const res = await fetchTasksMultiSource({
      sources: SOURCES,
      nativePrincipalIds: [33, 34],
      sitePrincipalIds: SITE_IDS,
    });
    expect(res.perSourceStats.main.assignedIds).toEqual([5, 33, 34]);
    expect(res.perSourceStats.main.fetched).toBe(1);
  });

  it("источник с нерезолвленными Id пропускается со скипом (таблица пустая, но не падает)", async () => {
    const res = await fetchTasksMultiSource({
      sources: SOURCES,
      nativePrincipalIds: [],
      sitePrincipalIds: { main: { userId: null, principalIds: [], ok: false } },
    });
    expect(res.items).toHaveLength(0);
    expect(res.perSourceStats.main.skipped).toBe("no-ids-resolved");
  });
});
