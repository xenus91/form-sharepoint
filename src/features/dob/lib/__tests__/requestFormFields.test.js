// src/features/dob/lib/__tests__/requestFormFields.test.js
// Поля формы создания заявки: Title/Срок/Исполнитель должны быть в форме
// (в отличие от формы закрытия задачи), служебные — нет.

import { describe, it, expect } from "vitest";
import { buildRequestFormControls, isRequestFormField } from "../requestFormFields";

const f = (InternalName, TypeAsString, extra = {}) => ({
  InternalName, Title: `Поле ${InternalName}`, Required: false, Hidden: false, ReadOnlyField: false,
  FieldTypeKind: 2, TypeAsString, Choices: { results: [] }, ...extra,
});

describe("buildRequestFormControls", () => {
  it("основные поля заявки в форме есть, виды контролов — по типу поля", () => {
    const controls = buildRequestFormControls([
      f("DueDate", "DateTime", { Title: "Срок" }),
      f("AssignedTo", "User", { Title: "Исполнитель" }),
      f("Participants", "UserMulti", { Title: "Участники", FieldTypeKind: 21 }),
      f("Note", "Note", { Title: "Описание" }),
      f("Problems", "MultiChoice", { Title: "Проблемы", Choices: { results: ["Паллета", "ТКН"] } }),
      f("Volume", "Number", { Title: "Объём" }),
      f("Urgent", "Boolean", { Title: "Срочно" }),
      f("Site", "URL", { Title: "Ссылка" }),
    ]);

    expect(controls.map((c) => c.internalName)).toEqual([
      "DueDate", "AssignedTo", "Participants", "Note", "Problems", "Volume", "Urgent", "Site",
    ]);
    const by = Object.fromEntries(controls.map((c) => [c.internalName, c]));
    expect(by.DueDate).toMatchObject({ kind: "date", title: "Срок" });
    expect(by.AssignedTo).toMatchObject({ kind: "person", multiple: false });
    expect(by.Participants).toMatchObject({ kind: "person", multiple: true });
    expect(by.Note).toMatchObject({ kind: "richtext" });
    expect(by.Problems).toMatchObject({ kind: "multichoice", choices: ["Паллета", "ТКН"], multiple: true });
    expect(by.Volume).toMatchObject({ kind: "number" });
    expect(by.Urgent).toMatchObject({ kind: "boolean" });
    expect(by.Site).toMatchObject({ kind: "url" });
  });

  it("Title, Status и «Результирующий выбор» в форму не попадают", () => {
    const controls = buildRequestFormControls([
      f("Title", "Text", { Title: "Наименование", Required: true }),
      f("Status", "Choice", { Title: "Статус", Choices: { results: ["Открыт"] } }),
      f("DobSearchResult", "OutcomeChoice", {
        Title: "Результат проверки", TypeDisplayName: "Результирующий выбор",
        Choices: { results: ["Найдена", "Не найдена"] },
      }),
      f("DueDate", "DateTime", { Title: "Срок", Required: true }),
    ]);
    expect(controls.map((c) => c.internalName)).toEqual(["DueDate"]);
  });

  it("служебные, скрытые, lookup и мусорные поля в форму не попадают", () => {
    const controls = buildRequestFormControls([
      f("ID", "Counter"),
      f("Title", "Text", { Title: "Наименование" }),
      f("ContentType", "Computed"),
      f("ContentTypeId", "ContentTypeId"),
      f("Created", "DateTime"),
      f("Modified", "DateTime"),
      f("Attachments", "Attachments"),
      f("LookupField", "Lookup", { FieldTypeKind: 7 }),
      f("OData__ColorTag", "Computed"),
      f("_ModerationStatus", "ModStat"),
      f("_x0068_Junk", "Text"),
      f("Secret", "Text", { Hidden: true }),
      f("Frozen", "Text", { ReadOnlyField: true }),
      f("SomeField", "Text", { Title: "Тип контента" }),
    ]);
    expect(controls).toEqual([]);
  });

  it("isRequestFormField не пускает пустые и дубли не плодит", () => {
    expect(isRequestFormField(null)).toBe(false);
    expect(isRequestFormField(f("Title", "Text"))).toBe(false);
    expect(isRequestFormField(f("DueDate", "DateTime"))).toBe(true);
    expect(buildRequestFormControls([f("DueDate", "DateTime"), f("DueDate", "DateTime")])).toHaveLength(1);
  });

  it("Choices терпит строку-список и массив", () => {
    const [a, b] = buildRequestFormControls([
      f("A", "Choice", { Choices: "Один\nДва" }),
      f("B", "Choice", { Choices: ["Три"] }),
    ]);
    expect(a.choices).toEqual(["Один", "Два"]);
    expect(b.choices).toEqual(["Три"]);
  });
});
