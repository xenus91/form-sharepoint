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

  describe("buildCompletedViewXml — старые проверки", () => {
    const xml = buildCompletedViewXml({ currentUserId: 42, distribution: null, pageSize: 20 });

    it("НЕ ищет просто «Выполн» (иначе матчится «В процессе выполнения»)", () => {
      expect(xml).not.toContain(">Выполн<");
    });

    it("PercentComplete не участвует в фильтре (только во ViewFields)", () => {
      const query = xml.slice(xml.indexOf("<Query>"), xml.indexOf("</Query>"));
      expect(query).not.toContain("PercentComplete");
    });
  });

  describe("buildCompletedViewXml — новый CAML", () => {
    const xml = buildCompletedViewXml({ currentUserId: 10, distribution: null, pageSize: 20, fields: ["ID"] });

    it("использует только Eq (без Contains / Not)", () => {
      expect(xml).not.toContain("<Contains>");
      expect(xml).not.toContain("<Not>");
      expect(xml).toContain("<Eq>");
    });

    it("ищет Status = Завершена — одно условие", () => {
      expect(xml).toContain('<Value Type="Text">Завершена</Value>');
      expect(xml).not.toContain("Заверш<"); // не по подстроке, а целиком
      const query2 = xml.slice(xml.indexOf("<Query>"), xml.indexOf("</Query>"));
      expect(query2).not.toContain("PercentComplete");
      // ровно один фильтр по Status
      expect(xml.match(/Name="Status"/g).length).toBe(1);
    });

    it("фильтрует по исполнителю", () => {
      expect(xml).toContain('Name="AssignedTo"');
      expect(xml).toContain('<Value Type="Integer">10</Value>');
    });
  });

  describe("fetchCompletedCount", () => {
    it("основной источник — REST $inlinecount (не CAML)", async () => {
      apiState.post.mockResolvedValue({ data: { d: { RenderListDataAsStream: { RowCount: 137, Row: [] } } } });
      apiState.get.mockResolvedValue({ data: { d: { results: [], __count: 42 } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(42);
      expect(res.source).toContain("inlinecount");
      // CAML не вызывается, пока REST отвечает
      expect(apiState.post).not.toHaveBeenCalled();
    });

    it("фолбэк на RowCount с минимальными ViewFields, если REST не дал число", async () => {
      apiState.get.mockRejectedValue(new Error("400"));
      apiState.post.mockResolvedValue({ data: { d: { RenderListDataAsStream: { RowCount: 137, Row: [] } } } });
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBe(137);
      expect(res.source).toContain("RenderListDataAsStream");
      const viewXml = apiState.post.mock.calls[0][1].parameters.ViewXml;
      expect(viewXml).toContain('<FieldRef Name="ID" />');
      expect(viewXml).not.toContain('<FieldRef Name="RelatedItems" />');
    });

    it("REST-фильтр использует eq по статусу (Choice не поддерживает substringof)", async () => {
      apiState.get.mockResolvedValue({ data: { d: { results: [], __count: 0 } } });
      await fetchCompletedCount({ currentUserId: 42, distribution: null });
      const url = apiState.get.mock.calls[0][0];
      const filter = decodeURIComponent(url.split("$filter=")[1]);
      // никаких substringof — они дают 400 "Value does not fall within the expected range"
      expect(filter).not.toContain("substringof");
      expect(filter).not.toContain("PercentComplete");
      expect(filter).toContain("Status eq 'Завершена'");
      expect(filter).not.toContain("В процессе"); // старые фильтры с substringof убраны
      expect(filter).not.toContain("Выполня");
      expect(filter.split("Status eq").length - 1).toBe(1); // один фильтр по Status
    });

    it("если фильтр по Status не проходит — счётчик null (без PercentComplete-костылей)", async () => {
      apiState.post.mockRejectedValue(new Error("boom"));
      apiState.get.mockRejectedValue(new Error("400"));
      const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
      expect(res.count).toBeNull();
      expect(apiState.get).toHaveBeenCalledTimes(1); // один фильтр — по Status
    });
  });

  describe("REST — основной путь страницы", () => {
    it("грузит через REST и возвращает nextPaging (CAML не нужен)", async () => {
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
