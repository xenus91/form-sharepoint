// src/tasks/__tests__/completedTasks.logging.test.js
// Диагностика должна писаться ВСЕГДА (без ?dbg=1) и содержать статус, текст сервера
// и имя «плохого» поля — именно по ним разбирают «Не удалось загрузить завершённые задачи».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const apiState = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../../api", () => ({
  default: {
    get: (...args) => apiState.get(...args),
    post: (...args) => apiState.post(...args),
    defaults: { headers: {} },
  },
  invalidate: vi.fn(),
}));

const { fetchCompletedTasksPage, fetchCompletedCount } = await import("../completedTasks");

const spError = (status, text) => ({
  response: { status, data: { error: { message: { value: text } } } },
  message: `Request failed with status code ${status}`,
});

describe("логирование завершённых задач", () => {
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    apiState.get.mockReset();
    apiState.post.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("падение RenderListDataAsStream логируется с тегом [completedTasks:failed]", async () => {
    apiState.post.mockRejectedValue(
      spError(400, "Column 'Location1' does not exist. It may have been deleted by another user.")
    );
    await expect(
      fetchCompletedTasksPage({ currentUserId: 42, distribution: null })
    ).rejects.toBeTruthy();

    const call = errorSpy.mock.calls.find((args) => String(args[0]).includes("[completedTasks:failed]"));
    expect(call).toBeTruthy();
    const payload = call[1];
    expect(payload.status).toBe(400);
    expect(payload.badField).toBe("Location1");
    expect(String(payload.message)).toContain("does not exist");
    expect(String(payload.viewXml)).toContain("<View");
  });

  it("отсутствующее поле логируется warn-ом и убирается из ViewXml", async () => {
    apiState.post
      .mockRejectedValueOnce(spError(400, "Column 'ResultSearchTHU' does not exist."))
      .mockResolvedValueOnce({ data: { d: { RenderListDataAsStream: { Row: [], RowCount: 0 } } } });

    const page = await fetchCompletedTasksPage({ currentUserId: 42, distribution: null });
    expect(page.tasks).toEqual([]);
    const warn = warnSpy.mock.calls.find((args) => String(args[0]).includes("[completedTasks:badField]"));
    expect(warn).toBeTruthy();
    expect(String(warn[1])).toContain("ResultSearchTHU");
    // повторный запрос уже без удалённого поля
    const viewXml = apiState.post.mock.calls[1][1].parameters.ViewXml;
    expect(viewXml).not.toContain("ResultSearchTHU");
    expect(viewXml).toContain("AssignedTo");
  });

  it("ошибка счётчика логируется с тегом [completedTasks:count:failed]", async () => {
    apiState.get.mockRejectedValue(spError(500, "Value does not fall within the expected range."));
    apiState.post.mockResolvedValue({ data: { d: { RenderListDataAsStream: { RowCount: 3, Row: [] } } } });

    const res = await fetchCompletedCount({ currentUserId: 42, distribution: null });
    expect(res.count).toBe(3); // фолбэк на RowCount

    const call = errorSpy.mock.calls.find((args) =>
      String(args[0]).includes("[completedTasks:count:failed]")
    );
    expect(call).toBeTruthy();
    expect(call[1].status).toBe(500);
  });
});
