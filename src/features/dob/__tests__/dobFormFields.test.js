// src/features/dob/__tests__/dobFormFields.test.js
// Поля связанной заявки для read-only просмотра: что показываем и как форматируем.

import { describe, it, expect } from "vitest";
import {
  buildViewFields,
  isHiddenFormField,
  formatFieldValue,
  hasFieldValue,
  sanitizeHtmlForView,
  contentTypeNameOf,
  getODataValue,
  stripTags,
} from "../lib/dobFormFields";

const FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  { InternalName: "Body", Title: "Описание", TypeAsString: "Note" },
  { InternalName: "Flag", Title: "Срочно", TypeAsString: "Boolean" },
  { InternalName: "DueDate", Title: "Срок", TypeAsString: "DateTime" },
  { InternalName: "AssignedTo", Title: "Кому назначено", TypeAsString: "User" },
  { InternalName: "Request", Title: "Заявка", TypeAsString: "Lookup", LookupList: "{1}" },
  { InternalName: "EmptyField", Title: "Пустое поле", TypeAsString: "Text" },
  { InternalName: "HiddenField", Title: "Служебное", TypeAsString: "Text", Hidden: true },
  { InternalName: "Modified", Title: "Изменено", TypeAsString: "DateTime" },
  { InternalName: "ContentType", Title: "Тип контента", TypeAsString: "Text" },
];

const ITEM = {
  Id: 2,
  Title: "Заявка ООБ",
  Body: "<p>Просмотр видеоархива</p>",
  Flag: true,
  DueDate: "2026-10-05T12:00:00Z",
  AssignedTo: { Title: "Поршаков Сергей", Id: 207 },
  AssignedToId: 207,
  Request: { Title: "Связанная заявка", Id: 77 },
  EmptyField: "",
  HiddenField: "секрет",
  Modified: "2026-10-03T09:00:00Z",
  ContentType: { Name: "Заявка ДОБ" },
};

describe("dob/lib/dobFormFields — значения", () => {
  it("getODataValue читает поле и OData-варианты", () => {
    expect(getODataValue({ A: 1 }, "A")).toBe(1);
    expect(getODataValue({ OData__B: 2 }, "B")).toBe(2);
    expect(getODataValue({}, "C")).toBeUndefined();
  });

  it("hasFieldValue считает пустые строки и пустой HTML пустыми", () => {
    expect(hasFieldValue("")).toBe(false);
    expect(hasFieldValue("   ")).toBe(false);
    expect(hasFieldValue("<p></p>")).toBe(false);
    expect(hasFieldValue("<p>&nbsp;</p>")).toBe(false);
    expect(hasFieldValue("<p>текст</p>")).toBe(true);
    expect(hasFieldValue(false)).toBe(true);
    expect(hasFieldValue(0)).toBe(true);
    expect(hasFieldValue(null)).toBe(false);
  });

  it("stripTags вычищает разметку", () => {
    expect(stripTags("<b>Привет</b> &amp; пока")).toBe("Привет & пока");
  });
});

describe("dob/lib/dobFormFields — поля по типу контента", () => {
  it("buildViewFields оставляет только заполненные, видимые и несистемные поля", () => {
    const view = buildViewFields(FIELDS, ITEM);
    const names = view.map((f) => f.internal);
    expect(names).toContain("Title");
    expect(names).toContain("Body");
    expect(names).toContain("AssignedTo");
    expect(names).toContain("Request");
    // пустые, скрытые и системные — скрыты
    expect(names).not.toContain("EmptyField");
    expect(names).not.toContain("HiddenField");
    expect(names).not.toContain("Modified");
    expect(names).not.toContain("ContentType");
  });

  it("колонки «Дополнительных действий» не показываются: их нет в типе контента", () => {
    const fields = [
      { InternalName: "AdditionalActions", Title: "Доп. действия", TypeAsString: "MultiChoice" },
      { InternalName: "AdditionalActionsRequired", Title: "Доп. действия обязательны", TypeAsString: "Boolean" },
      { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
    ];
    const item = { Title: "Задача", AdditionalActions: { results: ["Перебрать"] }, AdditionalActionsRequired: true };
    expect(isHiddenFormField("AdditionalActions")).toBe(true);
    expect(isHiddenFormField("AdditionalActionsRequired")).toBe(true);
    expect(buildViewFields(fields, item, { showEmpty: true }).map((f) => f.internal)).toEqual(["Title"]);
  });

  it("buildViewFields с showEmpty показывает пустые поля, но по-прежнему не служебные", () => {
    const names = buildViewFields(FIELDS, ITEM, { showEmpty: true }).map((f) => f.internal);
    expect(names).toContain("EmptyField");
    expect(names).not.toContain("HiddenField");
  });
});

describe("dob/lib/dobFormFields — форматирование значений", () => {
  it("boolean → Да/Нет", () => {
    expect(formatFieldValue({ InternalName: "Flag", TypeAsString: "Boolean" }, ITEM).text).toBe("Да");
    expect(formatFieldValue({ InternalName: "Flag", TypeAsString: "Boolean" }, { Flag: false }).text).toBe("Нет");
  });

  it("user/lookup → Title из раскрытого объекта", () => {
    expect(formatFieldValue({ InternalName: "AssignedTo", TypeAsString: "User" }, ITEM).text).toBe("Поршаков Сергей");
    expect(formatFieldValue({ InternalName: "Request", TypeAsString: "Lookup" }, ITEM).text).toBe("Связанная заявка");
  });

  it("datetime → локальная дата и время", () => {
    const out = formatFieldValue({ InternalName: "DueDate", TypeAsString: "DateTime" }, ITEM);
    expect(out.kind).toBe("text");
    expect(out.text).toMatch(/2026|05\.10\.2026/);
  });

  it("Note с разметкой → html (для read-only отображения)", () => {
    const out = formatFieldValue({ InternalName: "Body", TypeAsString: "Note" }, ITEM);
    expect(out.kind).toBe("html");
    expect(out.html).toContain("Просмотр видеоархива");
  });

  it("URL → ссылка", () => {
    const out = formatFieldValue({ InternalName: "Link", TypeAsString: "URL" }, { Link: { Url: "https://example.com", Description: "Сайт" } });
    expect(out.kind).toBe("link");
    expect(out.text).toBe("Сайт");
    expect(out.href).toBe("https://example.com");
  });
});

describe("dob/lib/dobFormFields — безопасный HTML", () => {
  it("вырезает script/style/onerror и оставляет разметку", () => {
    const dirty = '<p>Текст</p><script>alert(1)</script><img src="/sites/dob/x.png" onerror="alert(2)"><iframe src="//evil"></iframe>';
    const clean = sanitizeHtmlForView(dirty);
    expect(clean).toContain("<p>Текст</p>");
    expect(clean).toContain("x.png");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("<iframe");
  });

  it("не пропускает javascript:-ссылки", () => {
    const clean = sanitizeHtmlForView('<a href="javascript:alert(1)">жми</a>');
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("жми");
  });
});

describe("dob/lib/dobFormFields — тип контента", () => {
  it("contentTypeNameOf читает ContentType.Name", () => {
    expect(contentTypeNameOf(ITEM)).toBe("Заявка ДОБ");
    expect(contentTypeNameOf({ ContentType: "Заявка" })).toBe("Заявка");
    expect(contentTypeNameOf({})).toBe("");
  });
});
