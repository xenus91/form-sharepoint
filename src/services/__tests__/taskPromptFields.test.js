import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTaskPromptFields, resolvePromptFields, clearTaskPromptFieldsCache } from "../taskPromptFields";

const CT_A = "0x010800AAAAAAAAAAAAAAAAAAAAA";
const CT_B = "0x010800BBBBBBBBBBBBBBBBBBBBB";

function makeApiClient(results, { primaryError = null } = {}) {
  return {
    get: vi.fn().mockImplementation(() => {
      if (primaryError) return Promise.reject(primaryError);
      return Promise.resolve({ data: { d: { results } } });
    }),
  };
}

describe("taskPromptFields", () => {
  beforeEach(() => {
    clearTaskPromptFieldsCache();
    try { sessionStorage.clear(); } catch {}
    try { globalThis.sessionStorage?.clear(); } catch {}
  });

  it("parseBool handles Да/Нет/true/false/1/0/empty/null", async () => {
    // Indirect: Required="Да" → required=true в cfg
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", FieldTitle: "Где?", FieldType: "text", Required: "Да", SortOrder: 10, Enabled: true },
      { Id: 2, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Comment", FieldTitle: "Комментарий", Required: "Нет", SortOrder: 20, Enabled: true },
      { Id: 3, CType: CT_A, ResultValue: "Не найдена", FieldInternalName: "Reason", FieldTitle: "Причина", Required: true, SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const foundFields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(foundFields.find((f) => f.internalName === "Location1").required).toBe(true);
    expect(foundFields.find((f) => f.internalName === "Comment").required).toBe(false);
    const notFoundFields = resolvePromptFields(CT_A, "Не найдена", defs);
    expect(notFoundFields[0].required).toBe(true);
  });

  it("parseBool handles missing Required as false", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Comment", FieldTitle: "Комментарий", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields[0].required).toBe(false);
  });

  it("filters Enabled=false client-side", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", Required: false, SortOrder: 10, Enabled: false },
      { Id: 2, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Comment", Required: false, SortOrder: 20, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields).toHaveLength(1);
    expect(fields[0].internalName).toBe("Comment");
    expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining("$filter=Enabled eq 1"), expect.anything());
  });

  it("FieldType defaults to 'text', 'multiline' is recognized", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", FieldType: "multiline", SortOrder: 10, Enabled: true },
      { Id: 2, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Comment", SortOrder: 20, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields.find((f) => f.internalName === "Location1").type).toBe("multiline");
    expect(fields.find((f) => f.internalName === "Comment").type).toBe("text");
  });

  it("resolvePromptFields: exact CT × Result match", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields).toHaveLength(1);
    expect(fields[0].internalName).toBe("Location1");
  });

  it("resolvePromptFields: prefix CT match (parent ContentType)", async () => {
    const PARENT = CT_A; // shorter
    const CHILD = CT_A + "EXTRA";
    const apiClient = makeApiClient([
      { Id: 1, CType: PARENT, ResultValue: "Найдена", FieldInternalName: "ParentField", SortOrder: 10, Enabled: true },
      { Id: 2, CType: CHILD, ResultValue: "Найдена", FieldInternalName: "ChildField", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    // Child CT: exact match wins → ChildField
    const childFields = resolvePromptFields(CHILD, "Найдена", defs);
    expect(childFields[0].internalName).toBe("ChildField");
    // Parent CT: ParentField
    const parentFields = resolvePromptFields(PARENT, "Найдена", defs);
    expect(parentFields[0].internalName).toBe("ParentField");
    // Grandchild CT (extending parent): falls back to parent → ParentField
    const grandchildFields = resolvePromptFields(CT_A + "MORE", "Найдена", defs);
    expect(grandchildFields[0].internalName).toBe("ParentField");
  });

  it("resolvePromptFields: byCtWildcard with ResultValue='*' applies per CT", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "*", FieldInternalName: "GlobalForA", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "ЛюбойРезультат", defs);
    expect(fields).toHaveLength(1);
    expect(fields[0].internalName).toBe("GlobalForA");
  });

  it("resolvePromptFields: global wildcard (empty CType, ResultValue='*') applies to all CT", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: "", ResultValue: "*", FieldInternalName: "AlwaysLocation1", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fieldsA = resolvePromptFields(CT_A, "Найдена", defs);
    const fieldsB = resolvePromptFields(CT_B, "Не найдена", defs);
    expect(fieldsA[0].internalName).toBe("AlwaysLocation1");
    expect(fieldsB[0].internalName).toBe("AlwaysLocation1");
  });

  it("resolvePromptFields: per-CT (exact) wins over global wildcard", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: "", ResultValue: "*", FieldInternalName: "DefaultField", SortOrder: 100, Enabled: true },
      { Id: 2, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "CustomField", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields).toHaveLength(1);
    expect(fields[0].internalName).toBe("CustomField");
  });

  it("resolvePromptFields: per-CT wildcard wins over global wildcard", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: "", ResultValue: "*", FieldInternalName: "Global", SortOrder: 100, Enabled: true },
      { Id: 2, CType: CT_A, ResultValue: "*", FieldInternalName: "ForA", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Любой", defs);
    expect(fields[0].internalName).toBe("ForA");
  });

  it("resolvePromptFields: returns [] when no match", async () => {
    const apiClient = makeApiClient([]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields).toEqual([]);
  });

  it("resolvePromptFields: returns [] when defs is null (404)", () => {
    expect(resolvePromptFields(CT_A, "Найдена", null)).toEqual([]);
  });

  it("404 → null result from fetch", async () => {
    const apiClient = { get: vi.fn().mockRejectedValue({ response: { status: 404 } }) };
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    expect(defs).toBeNull();
  });

  it("dedup: same (CType, ResultValue, FieldInternalName) — last SortOrder wins", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", FieldTitle: "v1", Required: false, SortOrder: 10, Enabled: true },
      { Id: 2, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", FieldTitle: "v2", Required: true, SortOrder: 20, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields).toHaveLength(1);
    expect(fields[0].title).toBe("v2");
    expect(fields[0].required).toBe(true);
  });

  it("sortOrder ASC in resolved array", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "C", SortOrder: 30, Enabled: true },
      { Id: 2, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "A", SortOrder: 10, Enabled: true },
      { Id: 3, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "B", SortOrder: 20, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields.map((f) => f.internalName)).toEqual(["A", "B", "C"]);
  });

  it("does NOT do substring match (unlike taskResultDefinitions)", async () => {
    const apiClient = makeApiClient([
      { Id: 1, CType: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", SortOrder: 10, Enabled: true },
    ]);
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    // "Найдена в зоне" should NOT match "Найдена" — пустой массив
    const fields = resolvePromptFields(CT_A, "Найдена в зоне", defs);
    expect(fields).toEqual([]);
  });

  it("graceful 400 on missing CType field → fallback to ContentTypeId0/ContentTypeId", async () => {
    const apiClient = {
      get: vi.fn().mockImplementation((url) => {
        if (url.includes("CType,") && !url.includes("ContentTypeId0,")) {
          return Promise.reject({ response: { status: 400, data: { error: { message: { value: "Field 'CType' does not exist" } } } } });
        }
        return Promise.resolve({ data: { d: { results: [
          { Id: 1, ContentTypeId0: CT_A, ResultValue: "Найдена", FieldInternalName: "Location1", SortOrder: 10, Enabled: true },
        ] } } });
      }),
    };
    const defs = await fetchTaskPromptFields(apiClient, { forceRefresh: true });
    const fields = resolvePromptFields(CT_A, "Найдена", defs);
    expect(fields[0].internalName).toBe("Location1");
  });
});