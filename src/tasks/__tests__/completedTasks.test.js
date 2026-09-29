// src/tasks/__tests__/completedTasks.test.js
// Регрессия: в завершённые НЕ должны попадать задачи «в работе».
// Статус «В процессе выполнения» содержит подстроку «Выполн» — из-за этого
// CAML/REST-фильтры по «Выполн» тащили активные задачи вCompleted-вкладку и в счётчик.
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

const { buildCompletedViewXml, fetchCompletedCount, fetchCompletedTasksPage } = await import(
  "../completedTasks"
);

describe("completedTasks", () => {
  beforeEach(() => {
    apiState.get.mockReset();
    apiState.post.mockReset();
  });

  describe("buildCompletedViewXml", () => {
    const xml = buildCompletedViewXml({ currentUserId: 42, distribution: null, pageSize: 20 });

    it("ищет PercentComplete = 1", () => {
      expect(xml).toContain('<FieldRef Name="PercentComplete"');
    });

    it("НЕ ищет просто «Выполн» (иначе матчится «В процессе выполнения»)", () => {
      expect(xml).not.toContain(">Выполн<");
    });

    it("ищет завершённые статусы «Заверш» / «Выполнено» / «Выполнена»", () => {
      expect(xml).toContain("Заверш");
      expect(xml).toContain("Выполнено");
      expect(xml).toContain("Выполнена");
    });

    it("исключает статусы «в работе» через <Not><Contains>", () => {
      expect(xml).toContain("<Not>");
      expect(xml).toContain("В процессе");
      expect(xml).toContain("Выполня");
      expect(xml).toContain("Не начат");
    });
  });

  describe("fetchCompletedCount", () => {
    it("возвращает количество из REST $inlinecount", async () => {
      apiState.get.mockResolvedValue({ data: { d: { results: [], __count: 137 } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(137);
      expect(res.source).toContain("inlinecount");
    });

    it("REST-фильтр исключает статусы «в работе»", async () => {
      apiState.get.mockResolvedValue({ data: { d: { results: [], __count: 0 } } });
      await fetchCompletedCount({ currentUserId: 42, distribution: null });
      const url = apiState.get.mock.calls[0][0];
      const filter = decodeURIComponent(url.split("$filter=")[1]);
      expect(filter).toContain("not substringof('В процессе',Status)");
      expect(filter).toContain("not substringof('Выполня',Status)");
      expect(filter).toContain("not substringof('Не начат',Status)");
      expect(filter).toContain("substringof('Заверш',Status)");
    });

    it("фолбэк на RowCount, если REST не дал число", async () => {
      apiState.get.mockRejectedValue(new Error("boom"));
      apiState.post.mockResolvedValue({ data: { d: { RenderListDataAsStream: { RowCount: 12, Row: [] } } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(12);
      expect(res.source).toBe("RenderListDataAsStream");
    });
  });

  describe("fetchCompletedTasksPage", () => {
    it("не пропускает задачу со статусом «В процессе выполнения»", async () => {
      apiState.post.mockResolvedValue({
        data: {
          d: {
            RenderListDataAsStream: {
              RowCount: 2,
              NextHref: null,
              Row: [
                { ID: 1, Title: "Завершённая", Status: "Завершена", PercentComplete: 1 },
                { ID: 2, Title: "В работе", Status: "В процессе выполнения", PercentComplete: 0 },
                { ID: 3, Title: "Выполняется", Status: "Выполняется", PercentComplete: 0 },
              ],
            },
          },
        },
      });
      const page = await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });
      expect(page.tasks.map((t) => t.Id)).toEqual([1]);
    });
  });
});
