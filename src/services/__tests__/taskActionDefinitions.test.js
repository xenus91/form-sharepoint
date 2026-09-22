import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTaskActionDefinitions, resolveActionChoices, clearTaskActionDefinitionsCache } from "../taskActionDefinitions";

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
    expect(arr.map((x) => x.value)).not.toContain("move_to_correct_line");
    expect(arr.map((x) => x.value)).toContain("send_eo_to_otm");
    expect(arr.map((x) => x.value)).toContain("fix_failure");
    expect(arr.map((x) => x.value)).toContain("repack");
    // server filter should be in URL
    expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining("$filter=Enabled eq 1"), expect.anything());
  });

  it("resolveActionChoices returns only enabled for CT", async () => {
    const defs = {
      global: [],
      byCt: new Map([
        ["0x010800AAA", [{ value: "send_eo_to_otm", label: "Отправить ЕО в OTM" }, { value: "fix_failure", label: "Исправить ошибку" }]],
      ]),
      raw: [],
    };
    const choices = resolveActionChoices("0x010800AAA", defs, ["fallback"]);
    expect(choices).toHaveLength(2);
    expect(choices.map((c) => c.value)).toEqual(["send_eo_to_otm", "fix_failure"]);
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
    expect(arr[0].value).toBe("b");
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
    expect(arr[0].value).toBe("b");
  });
});
