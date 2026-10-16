// src/tasks/__tests__/takeTaskInWork.test.js
// Взятие в работу задачи внешнего источника: MERGE Status на сайте-владельце,
// защита от повторного взятия/завершения, авто-выбор статуса из choice-поля.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ requests: [], item: null, choices: [], mergeError: null, listEntityType: null }));

vi.mock("../sourceClient", () => ({
  makeSourceClient: () => ({
    name: "dob",
    apiBase: "/dob-api/sites/dob/doblogistic/_api",
    toRequestUrl: (url) => `/dob-api/sites/dob/doblogistic/_api${url}`,
    listApi: () => "/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')",
    get: async (url) => {
      state.requests.push({ method: "GET", url });
      if (url.includes("/fields?")) return { data: { d: { results: [{ InternalName: "Status", Choices: { results: state.choices } }] } } };
      if (url.includes("ListItemEntityTypeFullName")) {
        return { data: { d: state.listEntityType ? { ListItemEntityTypeFullName: state.listEntityType } : {} } };
      }
      if (url.includes("/items?")) {
        return { data: { d: { results: state.listEntityType ? [{ Id: 1, __metadata: { type: state.listEntityType } }] : [] } } };
      }
      return { data: { d: state.item } };
    },
    post: async () => ({ data: { d: {} } }),
    merge: async (url, body) => {
      state.requests.push({ method: "MERGE", url, body });
      if (typeof state.onMerge === "function") return state.onMerge(url, body);
      if (state.mergeError) throw state.mergeError;
      return { status: 204, data: {} };
    },
  }),
}));

const { takeTaskInWork, pickInProgressChoice } = await import("../mutations/takeTaskInWork");

const SOURCE = { id: "dob", label: "DOB", clientKind: "dob", listGuid: "03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3" };

describe("pickInProgressChoice", () => {
  it("выбирает статус «в работе», исключая завершающие", () => {
    expect(pickInProgressChoice(["Не начата", "В работе", "Завершена"])).toBe("В работе");
    expect(pickInProgressChoice(["Не начата", "В процессе выполнения", "Отменена"])).toBe("В процессе выполнения");
    expect(pickInProgressChoice(["Не начата", "Выполняется", "Выполнено"])).toBe("Выполняется");
  });
  it("не путает «Выполнено» (завершено) с «Выполняется»", () => {
    expect(pickInProgressChoice(["Выполнено", "Завершена"])).toBeNull();
  });
  it("нет подходящих → null", () => {
    expect(pickInProgressChoice(["Не начата", "Завершена"])).toBeNull();
    expect(pickInProgressChoice([])).toBeNull();
    expect(pickInProgressChoice(null)).toBeNull();
  });
});

describe("takeTaskInWork", () => {
  beforeEach(() => {
    state.requests = [];
    state.choices = ["Не начата", "В работе", "Завершена"];
    state.mergeError = null;
    state.listEntityType = null;
    state.onMerge = null;
    state.item = { Id: 1, Status: "Не начата", PercentComplete: 0, Editor: null, __metadata: { type: "SP.Data.RequestsTaskListItem" } };
  });

  it("берёт задачу в работу: MERGE со статусом «в работе»", async () => {
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("В работе");
    const merge = state.requests.find((r) => r.method === "MERGE");
    expect(merge).toBeTruthy();
    expect(merge.url).toBe("/dob-api/sites/dob/doblogistic/_api/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')/items(1)");
    expect(merge.body).toEqual({ __metadata: { type: "SP.Data.RequestsTaskListItem" }, Status: "В работе" });
  });

  it("не перетирает чужое взятие", async () => {
    state.item = { Id: 1, Status: "В работе", PercentComplete: 0, Editor: { Id: 33, Title: "Поршаков Сергей" } };
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("already-taken");
    expect(res.editorTitle).toBe("Поршаков Сергей");
    expect(state.requests.filter((r) => r.method === "MERGE")).toHaveLength(0);
  });

  it("не берёт завершённую задачу", async () => {
    state.item = { Id: 1, Status: "Завершена", PercentComplete: 1 };
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("completed");
    expect(state.requests.filter((r) => r.method === "MERGE")).toHaveLength(0);
  });

  it("если в списке нет статуса «в работе» — сообщает доступные варианты", async () => {
    state.choices = ["Не начата", "Завершена"];
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no-status-choice");
    expect(res.choices).toEqual(["Не начата", "Завершена"]);
    expect(state.requests.filter((r) => r.method === "MERGE")).toHaveLength(0);
  });

  it("явный inProgressStatus источника имеет приоритет над автоподбором", async () => {
    state.choices = ["Не начата", "Взял в работу"]; // маркеры не сработают
    const res = await takeTaskInWork("dob:1", { allSources: [{ ...SOURCE, inProgressStatus: "Взял в работу" }] });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("Взял в работу");
  });

  it("тип берётся у списка, если его нет в свежем GET (иначе SharePoint 400)", async () => {
    state.item = { Id: 1, Status: "Не начата", PercentComplete: 0, Editor: null };
    state.listEntityType = "SP.Data.RequestsTaskListItem";
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(res.ok).toBe(true);
    const merge = state.requests.find((r) => r.method === "MERGE");
    expect(merge.body).toEqual({ __metadata: { type: "SP.Data.RequestsTaskListItem" }, Status: "В работе" });
  });

  it("400 «не указан ожидаемый тип» → повтор MERGE с добранным типом", async () => {
    state.item = { Id: 1, Status: "Не начата", PercentComplete: 0, Editor: null };
    state.listEntityType = null; // заранее тип неизвестен
    let attempt = 0;
    state.mergeError = null;
    const typeError = {
      response: {
        status: 400,
        data: { error: { message: { value: "Найдена запись без имени типа, но не указан ожидаемый тип." } } },
      },
    };
    // первый MERGE падает; тип появляется у списка только на этапе добора,
    // поэтому второй MERGE уходит уже с __metadata.type и проходит
    state.onMerge = () => {
      attempt += 1;
      if (attempt === 1) {
        state.listEntityType = "SP.Data.RequestsTaskListItem";
        throw typeError;
      }
      return { status: 204, data: {} };
    };
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(attempt).toBe(2);
    expect(res.ok).toBe(true);
    const lastMerge = state.requests.filter((r) => r.method === "MERGE").pop();
    expect(lastMerge.body).toEqual({ __metadata: { type: "SP.Data.RequestsTaskListItem" }, Status: "В работе" });
  });

  it("412 при MERGE трактуется как «уже взята»", async () => {
    state.mergeError = { response: { status: 412, data: {} } };
    const res = await takeTaskInWork("dob:1", { allSources: [SOURCE] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("already-taken");
  });

  it("некорректный compositeId → invalid-id", async () => {
    const res = await takeTaskInWork("dob", { allSources: [SOURCE] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("invalid-id");
  });
});
