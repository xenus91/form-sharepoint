// @vitest-environment jsdom
// src/features/dob/__tests__/dobApi.takeInWork.test.js
//
// Взятие задачи в работу ИЗ ФОРМЫ: #dob_tasks/<id>?list=<GUID> открывается прямой
// ссылкой, поэтому «Взять в работу» обязано работать в самом списке задачи
// (MERGE статуса), а не только из таблицы/карточки.

import { describe, it, expect, vi, beforeEach } from "vitest";

const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";

const state = { posts: [], gets: [], itemStatus: "Не начата", itemPercent: 0, statusChoices: ["Не начата", "В работе", "Завершена"] };

const LIST_FIELDS = [
  { InternalName: "Title", Title: "Title", TypeAsString: "Text" },
  { InternalName: "DobSearchResult", Title: "Результат", TypeAsString: "Choice" },
];

const apiClient = {
  get: vi.fn(async (url) => {
    const u = String(url);
    state.gets.push(u);
    if (u.includes("/fields")) {
      const results = state.statusChoices.length
        ? [{ InternalName: "Status", Title: "Status", Choices: { results: state.statusChoices } }, ...LIST_FIELDS]
        : LIST_FIELDS;
      return { data: { d: { results } } };
    }
    if (u.includes("/items(906)")) {
      return { data: { d: { Id: 906, Status: state.itemStatus, PercentComplete: state.itemPercent } } };
    }
    return { data: { d: { ListItemEntityTypeFullName: "SP.Data.TasksListItem" } } };
  }),
  post: vi.fn(async (url, body, cfg) => {
    state.posts.push({ url, body, cfg });
    return { data: { d: { Id: 906 } } };
  }),
};

vi.mock("../../../api", () => ({ default: apiClient }));
vi.mock("../api/dobClient", () => ({
  DOB_LIST_GUID: "21B5B544-BD98-4B06-891F-C5A137331394",
  dobApiBase: () => "/dob-api/sites/dob/doblogistic/_api",
  dobListApi: (guid) => `/dob-api/sites/dob/doblogistic/_api/web/lists(guid'${guid}')`,
  dobAxios: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })) },
}));

const { takeDobTaskInWork } = await import("../api/dobApi");

describe("dobApi.takeDobTaskInWork — взятие задачи в работу из формы", () => {
  beforeEach(() => {
    state.posts.length = 0;
    state.gets.length = 0;
    state.itemStatus = "Не начата";
    state.itemPercent = 0;
    state.statusChoices = ["Не начата", "В работе", "Завершена"];
  });

  it("«Не начата» → MERGE статуса «в работе» из choices списка (не хардкод)", async () => {
    const res = await takeDobTaskInWork(906, MAIN_GUID);
    expect(res.ok).toBe(true);
    expect(res.status).toBe("В работе");

    const post = state.posts.at(-1);
    expect(post.url).toContain("/items(906)");
    expect(post.cfg.headers["X-HTTP-Method"]).toBe("MERGE");
    expect(post.cfg.headers["IF-MATCH"]).toBe("*");
    expect(post.body.Status).toBe("В работе");
  });

  it("choices можно передать готовыми (форме они уже известны) — лишний запрос не идёт", async () => {
    await takeDobTaskInWork(906, MAIN_GUID, { choices: ["Не начата", "В процессе выполнения"] });
    expect(state.posts.at(-1).body.Status).toBe("В процессе выполнения");
    expect(state.gets.some((u) => u.includes("/fields?$filter=InternalName eq 'Status'"))).toBe(false);
  });

  it("нет Status-choices → fallback «В работе», а не молчаливый отказ", async () => {
    state.statusChoices = [];
    const res = await takeDobTaskInWork(906, MAIN_GUID);
    expect(res.ok).toBe(true);
    expect(state.posts.at(-1).body.Status).toBe("В работе");
  });

  it("задача уже «В работе» → записи нет, причина already-taken", async () => {
    state.itemStatus = "В работе";
    const res = await takeDobTaskInWork(906, MAIN_GUID);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("already-taken");
    expect(state.posts).toHaveLength(0);
  });

  it("завершённую задачу не берём: completed без единой записи", async () => {
    state.itemStatus = "Завершена";
    state.itemPercent = 1;
    const res = await takeDobTaskInWork(906, MAIN_GUID);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("completed");
    expect(state.posts).toHaveLength(0);
  });
});
