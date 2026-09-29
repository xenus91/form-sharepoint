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
    it("основной источник — RowCount (ViewFields только ID)", async () => {
      apiState.post.mockResolvedValue({ data: { d: { RenderListDataAsStream: { RowCount: 137, Row: [] } } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(137);
      expect(res.source).toBe("RenderListDataAsStream");
      const viewXml = apiState.post.mock.calls[0][1].parameters.ViewXml;
      expect(viewXml).toContain('<FieldRef Name="ID" />');
      expect(viewXml).not.toContain('<FieldRef Name="RelatedItems" />');
      expect(apiState.get).not.toHaveBeenCalled();
    });

    it("фолбэк на REST $inlinecount, если RowCount нет", async () => {
      apiState.post.mockResolvedValue({ data: { d: { RenderListDataAsStream: { Row: [] } } } });
      apiState.get.mockResolvedValue({ data: { d: { results: [], __count: 5 } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(5);
      expect(res.source).toContain("inlinecount");
    });

    it("REST-фильтр использует eq по статусу (Choice не поддерживает substringof)", async () => {
      apiState.post.mockRejectedValue(new Error("boom"));
      apiState.get.mockResolvedValue({ data: { d: { results: [], __count: 0 } } });
      await fetchCompletedCount({ currentUserId: 42, distribution: null });
      const url = apiState.get.mock.calls[0][0];
      const filter = decodeURIComponent(url.split("$filter=")[1]);
      // никаких substringof — они дают 400 "Value does not fall within the expected range"
      expect(filter).not.toContain("substringof");
      expect(filter).toContain("PercentComplete eq 1");
      expect(filter).toContain("Status eq 'Завершена'");
      expect(filter).toContain("Status eq 'Выполнено'");
    });

    it("при ошибке первого фильтра пробует следующие", async () => {
      apiState.post.mockRejectedValue(new Error("boom"));
      apiState.get
        .mockRejectedValueOnce(new Error("400"))
        .mockResolvedValueOnce({ data: { d: { results: [], __count: 8 } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(8);
      expect(apiState.get).toHaveBeenCalledTimes(2);
    });
  });

  describe("REST-фолбэк страницы", () => {
    it("если CAML не работает — грузит через REST и возвращает nextPaging", async () => {
      apiState.post.mockRejectedValue(new Error("500 field types"));
      apiState.get.mockResolvedValue({
        data: {
          d: {
            results: [
              { Id: 11, Title: "Завершённая", Status: "Завершена", PercentComplete: 1 },
              { Id: 12, Title: "В работе", Status: "В процессе выполнения", PercentComplete: 0 },
            ],
            __next: "https://sp/sites/x/_api/web/lists(guid'1')/items?$skiptoken=Paged%3dTRUE%26p_ID%3d12",
          },
        },
      });
      const page = await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });
      expect(page.source).toBe("REST");
      expect(page.tasks.map((t) => t.Id)).toEqual([11]);
      expect(page.nextPaging).toBe("Paged=TRUE&p_ID=12");
      const url = apiState.get.mock.calls[0][0];
      expect(decodeURIComponent(url)).not.toContain("substringof");
      expect(decodeURIComponent(url)).toContain("Status eq 'Завершена'");
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
