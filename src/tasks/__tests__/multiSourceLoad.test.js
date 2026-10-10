// src/tasks/__tests__/multiSourceLoad.test.js
// Интеграционный тест multi-source загрузки: #tasks должен находить задачи
// пользователя и групп из DcEmail на обоих сайтах, а таблица — не падать
// на полях, которых нет на сайте-источнике.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  requests: [],
  // Поля, которых нет на сайте-источнике — как настоящий SharePoint отвечает 400
  dobMissingFields: ["ResultSearchTHU", "Location1", "OffDepKey", "AdditionalsActionsRequired", "AdditionalActions"],
}));

const MAIN_ITEM = { Id: 10, Title: "Основная задача", Status: "Не начата", Created: "2026-10-01T10:00:00Z", Modified: "2026-10-03T10:00:00Z", AssignedTo: { Id: 5, Title: "Текущий" } };
const DOB_ITEM = { Id: 1, Title: "Заявка ООБ", Body: "Просмотр видеоархива", Status: "Не начата", PercentComplete: 0, Created: "2026-10-02T00:29:42Z", Modified: "2026-10-03T00:29:42Z", AssignedTo: { Id: 207, Title: "Поршаков Сергей" } };

vi.mock("../sourceClient", () => ({
  makeSourceClient: (source) => {
    const isMain = source.id === "main";
    const apiBase = isMain ? "" : "/dob-api/sites/dob/doblogistic/_api";
    return {
      name: source.id,
      apiBase,
      toRequestUrl: (url) => (isMain ? url : `${apiBase}${url}`),
      listApi: async () => source.listApi || "",
      get: async (url) => {
        state.requests.push({ sourceId: source.id, url });
        if (url.includes("/web/currentuser")) {
          return { data: { d: { Id: isMain ? 5 : 207 } } };
        }
        if (!isMain) {
          const select = decodeURIComponent((url.match(/\$select=([^&]*)/) || [])[1] || "");
          const bad = state.dobMissingFields.find((f) => select.split(",").includes(f));
          if (bad) {
            const err = new Error("column does not exist");
            err.response = { status: 400, data: { error: { message: { value: `Столбец '${bad}' не существует.` } } } };
            throw err;
          }
          return { data: { d: { results: [DOB_ITEM] } } };
        }
        return { data: { d: { results: [MAIN_ITEM] } } };
      },
      post: async () => ({ data: {} }),
      merge: async () => ({ data: {} }),
    };
  },
}));

const { fetchTasksMultiSource } = await import("../multiSource");
const { getSourceById } = await import("../sources");

const SOURCES = [getSourceById("main"), getSourceById("dob")];

const SITE_IDS = {
  main: { userId: 5, principalIds: [33], ok: true },
  dob: { userId: 207, principalIds: [33], ok: true },
};

describe("fetchTasksMultiSource — сквозная загрузка main + dob", () => {
  beforeEach(() => {
    state.requests = [];
  });

  it("возвращает задачи обоих источников со compositeId/sourceId/sourceLabel", async () => {
    const res = await fetchTasksMultiSource({
      sources: SOURCES,
      principals: [{ id: 33, title: "ООБ", kind: "group", kindHint: "group" }],
      nativePrincipalIds: [33, 34],
      sitePrincipalIds: SITE_IDS,
      omitResultFields: true,
    });

    expect(res.items).toHaveLength(2);
    const main = res.items.find((t) => t.sourceId === "main");
    const dob = res.items.find((t) => t.sourceId === "dob");
    expect(main.compositeId).toBe("main:10");
    expect(dob.compositeId).toBe("dob:1");
    expect(dob.sourceLabel).toBe("DOB Logistic");
    expect(dob.Title).toBe("Заявка ООБ");
    // сортировка — от самых старых к самым новым (Created asc, требование 2026-10-10):
    // main создана 10-01, dob — 10-02. Modified на порядок больше не влияет.
    expect(res.items.map((t) => t.compositeId)).toEqual(["main:10", "dob:1"]);
    expect(res.errors).toEqual([]);
  });

  it("фильтр dob: пользователь + группа из DcEmail, без родных Id основного сайта", async () => {
    await fetchTasksMultiSource({
      sources: SOURCES,
      principals: [{ id: 33, title: "ООБ", kind: "group", kindHint: "group" }],
      nativePrincipalIds: [33, 34],
      sitePrincipalIds: SITE_IDS,
    });
    const dobReq = state.requests.find((r) => r.sourceId === "dob");
    const filter = decodeURIComponent(dobReq.url);
    expect(filter).toContain("AssignedToId eq 207"); // пользователь на сайте ДОБ
    expect(filter).toContain("AssignedToId eq 33");  // группа, срезолвленная на ДОБ
    expect(filter).not.toContain("AssignedToId eq 34"); // Id основного сайта не применяем
    expect(filter).toContain("PercentComplete ne 1");
  });

  it("фильтр main: пользователь + группы + родные Id DcEmail.Email", async () => {
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
  });

  it("в select dob нет полей результата и main-only полей (иначе 400 → пустая таблица)", async () => {
    await fetchTasksMultiSource({ sources: SOURCES, sitePrincipalIds: SITE_IDS, omitResultFields: true });
    const dobReqs = state.requests.filter((r) => r.sourceId === "dob");
    const last = dobReqs[dobReqs.length - 1];
    const select = decodeURIComponent(last.url).match(/\$select=([^&]*)/)[1];
    expect(select).not.toContain("ResultSearchTHU");
    expect(select).not.toContain("Location1");
    expect(select).not.toContain("OffDepKey");
    expect(select).toContain("RelatedItems");
  });

  it("perSourceStats содержит assignedIds по каждому источнику", async () => {
    const res = await fetchTasksMultiSource({
      sources: SOURCES,
      nativePrincipalIds: [33, 34],
      sitePrincipalIds: SITE_IDS,
    });
    expect(res.perSourceStats.main.assignedIds).toEqual([5, 33, 34]);
    expect(res.perSourceStats.dob.assignedIds).toEqual([207, 33]);
    expect(res.perSourceStats.dob.fetched).toBe(1);
  });

  it("источник с нерезолвленными Id пропускается со скипом (не роняет остальные)", async () => {
    const res = await fetchTasksMultiSource({
      sources: SOURCES,
      nativePrincipalIds: [],
      sitePrincipalIds: { main: SITE_IDS.main, dob: { userId: null, principalIds: [], ok: false } },
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].sourceId).toBe("main");
    expect(res.perSourceStats.dob.skipped).toBe("no-ids-resolved");
  });
});
