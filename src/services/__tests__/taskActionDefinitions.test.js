import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTaskActionDefinitions, resolveActionChoices, resolveActionDefaults, clearTaskActionDefinitionsCache } from "../taskActionDefinitions";

describe("taskActionDefinitions", () => {
  beforeEach(() => {
    clearTaskActionDefinitionsCache();
    try { sessionStorage.clear(); } catch {}
    try { globalThis.sessionStorage?.clear(); } catch {}
  });

  it("filters Enabled=false client side and server filter", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "Отправить ЕО в OTM", ActionId: "send_eo_to_otm", SortOrder: 10, Enabled: true, CType: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E" },
          { Id: 2, Title: "Переместить в корректную линию", ActionId: "move_to_correct_line", SortOrder: 20, Enabled: false, CType: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E" },
          { Id: 3, Title: "Исправить ошибку", ActionId: "fix_failure", SortOrder: 30, Enabled: true, CType: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E" },
          { Id: 4, Title: "Перебрать", ActionId: "repack", SortOrder: 40, Enabled: true, CType: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E" },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    expect(defs.byCt.size).toBe(1);
    const arr = defs.byCt.get("0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E");
    expect(arr).toHaveLength(3);
    // value now = Title (human normal name) not ActionId
    expect(arr.map((x) => x.value)).not.toContain("Переместить в корректную линию");
    expect(arr.map((x) => x.value)).toContain("Отправить ЕО в OTM");
    expect(arr.map((x) => x.value)).toContain("Исправить ошибку");
    expect(arr.map((x) => x.value)).toContain("Перебрать");
    // label also human
    expect(arr.map((x) => x.label)).toContain("Отправить ЕО в OTM");
    // server filter should be in URL
    expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining("$filter=Enabled eq 1"), expect.anything());
  });

  it("resolveActionChoices returns only enabled for CT", async () => {
    const defs = {
      global: [],
      byCt: new Map([
        ["0x010800AAA", [{ value: "Отправить ЕО в OTM", label: "Отправить ЕО в OTM" }, { value: "Исправить ошибку", label: "Исправить ошибку" }]],
      ]),
      raw: [],
    };
    const choices = resolveActionChoices("0x010800AAA", defs, ["fallback"]);
    expect(choices).toHaveLength(2);
    expect(choices.map((c) => c.value)).toEqual(["Отправить ЕО в OTM", "Исправить ошибку"]);
  });

  it("disabled via boolean false is filtered", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "A", ActionId: "a", SortOrder: 10, Enabled: false, CType: "0x0108" },
          { Id: 2, Title: "B", ActionId: "b", SortOrder: 20, Enabled: true, CType: "0x0108" },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    const arr = defs.byCt.get("0x0108");
    expect(arr).toHaveLength(1);
    expect(arr[0].value).toBe("B");
  });

  it("parseBool handles string Нет/Да for Enabled", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "A", ActionId: "a", SortOrder: 10, Enabled: "Нет", CType: "0x0108" },
          { Id: 2, Title: "B", ActionId: "b", SortOrder: 20, Enabled: "Да", CType: "0x0108" },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    const arr = defs.byCt.get("0x0108");
    expect(arr).toHaveLength(1);
    expect(arr[0].value).toBe("B");
  });

  it("Default field marks defaults and resolveActionDefaults returns multiple", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "Отправить ЕО в OTM", ActionId: "send_eo_to_otm", SortOrder: 10, Enabled: true, CType: "0x0108AAA", Default: true },
          { Id: 2, Title: "Перебрать", ActionId: "repack", SortOrder: 20, Enabled: true, CType: "0x0108AAA", Default: false },
          { Id: 3, Title: "Проверить доки", ActionId: "check_docs", SortOrder: 30, Enabled: true, CType: "0x0108AAA", Default: "Да" },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    const arr = defs.byCt.get("0x0108AAA");
    expect(arr).toHaveLength(3);
    expect(arr.find((x) => x.value === "Отправить ЕО в OTM").isDefault).toBe(true);
    expect(arr.find((x) => x.value === "Перебрать").isDefault).toBe(false);
    expect(arr.find((x) => x.value === "Проверить доки").isDefault).toBe(true);
    const defaults = resolveActionDefaults("0x0108AAA", defs);
    expect(defaults).toEqual(["Отправить ЕО в OTM", "Проверить доки"]);
  });

  it("resolveActionDefaults returns [] when no defaults (nothing preselected)", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "A", ActionId: "a", SortOrder: 10, Enabled: true, CType: "0x0108", Default: false },
          { Id: 2, Title: "B", ActionId: "b", SortOrder: 20, Enabled: true, CType: "0x0108", Default: "Нет" },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    const defaults = resolveActionDefaults("0x0108", defs);
    expect(defaults).toEqual([]);
  });

  it("Default via IsDefault fallback also parsed", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "A", ActionId: "a", SortOrder: 10, Enabled: true, CType: "0x0108", IsDefault: true },
          { Id: 2, Title: "B", ActionId: "b", SortOrder: 20, Enabled: true, CType: "0x0108", IsDefault: false },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    const defaults = resolveActionDefaults("0x0108", defs);
    expect(defaults).toEqual(["A"]);
  });

  it("resolveActionDefaults returns null when list not found (fallback)", () => {
    const defaults = resolveActionDefaults("0x0108", null);
    expect(defaults).toBeNull();
  });

  it("normal names: value is Title not ActionId", async () => {
    const fakeData = {
      d: {
        results: [
          { Id: 1, Title: "Отправить ЕО в OTM", ActionId: "send_eo_to_otm", SortOrder: 10, Enabled: true, CType: "0x0108" },
        ],
      },
    };
    const apiClient = { get: vi.fn().mockResolvedValue({ data: fakeData }) };
    const defs = await fetchTaskActionDefinitions(apiClient, { forceRefresh: true });
    const arr = defs.byCt.get("0x0108");
    expect(arr[0].value).toBe("Отправить ЕО в OTM");
    expect(arr[0].label).toBe("Отправить ЕО в OTM");
    expect(arr[0].actionId).toBe("send_eo_to_otm");
  });
});
