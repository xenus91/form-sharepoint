// src/tasks/__tests__/completedTasks.realFields.test.js
// Регрессия: «Не удалось загрузить завершённые задачи. HTTP 400 · Поле или
// свойство AdditionalsActionsRequired не существует».
//
// Набор полей завершённых собран сразу по всем типам контента, поэтому часть
// колонок в конкретном списке отсутствует. SharePoint на отсутствующее поле в
// $select / ViewFields отвечает 400. Запрос обязан содержать ТОЛЬКО реально
// существующие поля списка.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiState = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../../api", () => ({
  default: {
    get: (...args) => apiState.get(...args),
    post: (...args) => apiState.post(...args),
    defaults: { headers: {} },
  },
  invalidate: vi.fn(),
}));

const { fetchCompletedTasksPage, clearListFieldNamesCache } = await import("../completedTasks");

/** Колонки, которые реально есть в списке пользователя (без AdditionalsActionsRequired). */
const REAL_FIELDS = [
  "ID",
  "Title",
  "Status",
  "PercentComplete",
  "Modified",
  "Created",
  "AssignedTo",
  "Editor",
  "DcEmail",
  "OutcomeChoice",
  "ResultSearchTHU",
  "Location1",
];

const FIELDS_URL = /\/fields\?\$select=InternalName/;

function mockSharePoint({ fieldsProbeFails = false } = {}) {
  apiState.get.mockImplementation((url) => {
    if (FIELDS_URL.test(url)) {
      if (fieldsProbeFails) return Promise.reject(new Error("Access denied"));
      return Promise.resolve({
        data: { d: { results: REAL_FIELDS.map((InternalName) => ({ InternalName })) } },
      });
    }
    // REST-страница элементов — пусто
    return Promise.resolve({ data: { d: { results: [] } } });
  });
  apiState.post.mockResolvedValue({
    data: { d: { results: [], ListItemCollectionPosition: null } },
  });
}

describe("завершённые задачи — только реально существующие поля", () => {
  beforeEach(() => {
    apiState.get.mockReset();
    apiState.post.mockReset();
    clearListFieldNamesCache();
  });

  it("сначала читает состав полей списка", async () => {
    mockSharePoint();
    await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });

    const call = apiState.get.mock.calls.find(([url]) => FIELDS_URL.test(url));
    expect(call).toBeTruthy();
    expect(call[0]).toContain("$select=InternalName");
  });

  it("в $select нет поля, которого нет в списке (AdditionalsActionsRequired)", async () => {
    mockSharePoint();
    await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });

    const itemCalls = apiState.get.mock.calls.filter(([url]) => /\/items\?/.test(url));
    expect(itemCalls.length).toBeGreaterThan(0);
    for (const [url] of itemCalls) {
      const select = decodeURIComponent(url.split("$select=")[1] || "");
      expect(select).not.toContain("AdditionalsActionsRequired");
    }
  });

  it("существующие поля при этом остаются в запросе", async () => {
    mockSharePoint();
    await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });

    const [url] = apiState.get.mock.calls.find(([u]) => /\/items\?/.test(u));
    const select = decodeURIComponent(url.split("$select=")[1] || "");
    expect(select).toContain("Title");
    expect(select).toContain("ResultSearchTHU");
  });

  it("в CAML ViewFields тоже только существующие поля", async () => {
    mockSharePoint();
    // REST-путь заставляем не найти ничего, чтобы дошли до CAML
    apiState.get.mockImplementation((url) => {
      if (FIELDS_URL.test(url)) {
        return Promise.resolve({
          data: { d: { results: REAL_FIELDS.map((InternalName) => ({ InternalName })) } },
        });
      }
      return Promise.resolve({ data: { d: { results: [] } } });
    });
    await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });

    const caml = apiState.post.mock.calls.find(([url]) => /GetListItems/.test(url));
    if (caml) {
      const body = String(caml[1]?.request?.Query?.ViewFields?.__metadata?.type ? JSON.stringify(caml[1]) : JSON.stringify(caml[1]));
      expect(body).not.toContain("AdditionalsActionsRequired");
    }
    // главный признак — в ViewFields запроса остались реальные поля
    expect(JSON.stringify(apiState.post.mock.calls)).toContain("Title");
  });

  it("если состав полей прочитать не удалось — запрос всё равно уходит (без падения)", async () => {
    mockSharePoint({ fieldsProbeFails: true });
    const page = await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });

    expect(page).toBeTruthy();
    const itemCalls = apiState.get.mock.calls.filter(([url]) => /\/items\?/.test(url));
    expect(itemCalls.length).toBeGreaterThan(0);
  });
});
