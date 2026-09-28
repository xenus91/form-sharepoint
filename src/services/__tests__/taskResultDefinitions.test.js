import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTaskResultDefinitions, resolveTaskResultDefinition, clearTaskResultDefinitionsCache } from "../taskResultDefinitions";

const CT_A = "0x010800AAAAAAAAAAAAAAAAAAAAA";

function makeApiClient(results) {
  return {
    get: vi.fn().mockResolvedValue({ data: { d: { results } } }),
  };
}

describe("taskResultDefinitions — RequiresConfirmed + Color/Variant/Gradient", () => {
  beforeEach(() => {
    clearTaskResultDefinitionsCache();
    try { sessionStorage.clear(); } catch {}
    try { globalThis.sessionStorage?.clear(); } catch {}
  });

  it("RequiresConfirmed=true приходит из SP и пробрасывается в resolveTaskResultDefinition", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Не найдена", ShowAdditionalActions: false, AdditionalsActionsRequired: false, RequiresConfirmed: "Да", Color: "error", Gradient: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    const r = resolveTaskResultDefinition("Не найдена", CT_A, defs);
    expect(r.requiresConfirmed).toBe(true);
    expect(r.cfg.color).toBe("error");
    expect(r.cfg.gradient).toBe("linear-gradient(180deg, #e53935 0%, #b71c1c 100%)");
  });

  it("RequiresConfirmed=Нет → false", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", ShowAdditionalActions: true, AdditionalsActionsRequired: true, RequiresConfirmed: "Нет", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    const r = resolveTaskResultDefinition("Найдена", CT_A, defs);
    expect(r.requiresConfirmed).toBe(false);
  });

  it("RequiresConfirmed=Нет → false (явный disable от админа)", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Не найдена", ShowAdditionalActions: false, AdditionalsActionsRequired: false, RequiresConfirmed: "Нет", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    const r = resolveTaskResultDefinition("Не найдена", CT_A, defs);
    expect(r.requiresConfirmed).toBe(false);
  });

  it("RequiresConfirmed отсутствует в SP → null (downstream fallback на hardcoded)", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", ShowAdditionalActions: false, AdditionalsActionsRequired: false, SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    const r = resolveTaskResultDefinition("Найдена", CT_A, defs);
    expect(r.requiresConfirmed).toBeNull();
    expect(r.showAdditionalActions).toBe(false);
  });

  it("graceful 400 на отсутствие RequiresConfirmed → fallback URL без новых полей", async () => {
    const apiClient = {
      get: vi.fn().mockImplementation((url) => {
        if (url.includes("RequiresConfirmed,")) {
          return Promise.reject({ response: { status: 400, data: { error: { message: { value: "Field 'RequiresConfirmed' does not exist" } } } } });
        }
        return Promise.resolve({ data: { d: { results: [
          { Id: 1, CType: CT_A, ResultValue: "Найдена", ShowAdditionalActions: true, AdditionalsActionsRequired: false, SortOrder: 10, Enabled: true },
        ] } } });
      }),
    };
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    const r = resolveTaskResultDefinition("Найдена", CT_A, defs);
    expect(r.showAdditionalActions).toBe(true);
    expect(r.requiresConfirmed).toBeNull();
    // Проверяем что fallback URL был вызван
    const calledUrls = apiClient.get.mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u) => u.includes("RequiresConfirmed,"))).toBe(true);
    expect(calledUrls.some((u) => !u.includes("RequiresConfirmed,"))).toBe(true);
  });

  it("404 → null (graceful fallback)", async () => {
    const apiClient = { get: vi.fn().mockRejectedValue({ response: { status: 404 } }) };
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    expect(defs).toBeNull();
  });

  it("Color/Variant/Gradient возвращаются как primary поля cfg", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", ShowAdditionalActions: true, AdditionalsActionsRequired: true, Color: "success", Variant: "contained", Gradient: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskResultDefinitions(apiClient, { forceRefresh: true });
    const r = resolveTaskResultDefinition("Найдена", CT_A, defs);
    expect(r.cfg.color).toBe("success");
    expect(r.cfg.variant).toBe("contained");
    expect(r.cfg.gradient).toBe("linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)");
  });
});