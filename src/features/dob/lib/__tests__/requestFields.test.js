// src/features/dob/lib/__tests__/requestFields.test.js
// Колонки страницы заявок: поля типов контента + остальные несистемные.

import { describe, it, expect } from "vitest";
import { collectCtFieldNames, selectRequestFields, isRequestTableField } from "../requestFields";

const field = (InternalName, extra = {}) => ({ InternalName, Title: InternalName, TypeAsString: "Text", ...extra });

const FIELDS = [
  field("ID", { TypeAsString: "Counter" }),
  field("Title"),
  field("Status", { TypeAsString: "Choice" }),
  field("Recipient", { TypeAsString: "Text" }),
  field("THU"),
  field("Author", { TypeAsString: "User" }),
  field("Modified", { TypeAsString: "DateTime" }),
  // системные / скрытые — не показываем
  field("FileRef"),
  field("ComplianceAssetId"),
  field("ContentTypeId"),
  field("ContentType", { Title: "Тип контента" }),
  field("HiddenCol", { Hidden: true }),
  field("ChekResult", { Title: "Результат проверки" }),
  field("OData__ModerationStatus"),
];

const CONTENT_TYPES = [
  { StringId: "0x0100AA", Name: "Заявка ООБ", FieldLinks: [{ Name: "THU" }, { Name: "Recipient" }] },
  { StringId: "0x0100BB", Name: "Заявка ТКН", FieldLinks: { results: [{ Name: "Status" }] } },
];

describe("requestFields", () => {
  it("собирает имена полей из FieldLinks всех типов контента (массив и results)", () => {
    expect([...collectCtFieldNames(CONTENT_TYPES)].sort()).toEqual(["Recipient", "Status", "THU"]);
    expect(collectCtFieldNames(null).size).toBe(0);
  });

  it("сначала ID/заголовок, затем поля типов контента, затем остальные", () => {
    const cols = selectRequestFields(FIELDS, { ctFieldNames: collectCtFieldNames(CONTENT_TYPES) });
    const names = cols.map((f) => f.InternalName);
    expect(names.slice(0, 2)).toEqual(["ID", "Title"]);
    // THU/Recipient/Status — из типов контента, идут до «остальных» (Author, Modified)
    expect(names.indexOf("THU")).toBeLessThan(names.indexOf("Author"));
    expect(names.indexOf("Status")).toBeLessThan(names.indexOf("Author"));
    // Modified в таблице НУЖЕН (в форме он скрыт — наборы исключений разные)
    expect(names).toContain("Modified");
    expect(names.indexOf("Modified")).toBeGreaterThan(names.indexOf("Status"));
    expect(new Set(names).size).toBe(names.length); // без дублей
  });

  it("системные, скрытые и «результат проверки» в таблицу не попадают", () => {
    const names = selectRequestFields(FIELDS, { ctFieldNames: collectCtFieldNames(CONTENT_TYPES) })
      .map((f) => f.InternalName);
    for (const bad of ["FileRef", "ComplianceAssetId", "ContentTypeId", "ContentType", "HiddenCol", "ChekResult", "OData__ModerationStatus"]) {
      expect(names).not.toContain(bad);
    }
  });

  it("работает и без списка типов контента — остаются все несистемные", () => {
    const names = selectRequestFields(FIELDS).map((f) => f.InternalName);
    expect(names).toContain("Author");
    expect(names).not.toContain("FileRef");
  });

  it("isRequestTableField отбраковывает мусор", () => {
    expect(isRequestTableField(field("THU"))).toBe(true);
    expect(isRequestTableField(field("FileRef"))).toBe(false);
    expect(isRequestTableField(field("X", { Hidden: true }))).toBe(false);
    expect(isRequestTableField(null)).toBe(false);
  });
});
