// src/features/dob/lib/__tests__/cellText.test.js
// Значение ячейки → текст: объекты {Value} и коллекции не должны превращаться
// в «[object Object]» в таблице #dob_requests.
import { describe, it, expect } from "vitest";
import { cellText } from "../cellText";

describe("cellText", () => {
  it("примитивы — как есть", () => {
    expect(cellText("Годен")).toBe("Годен");
    expect(cellText(42)).toBe("42");
    expect(cellText(true)).toBe("true");
    expect(cellText("")).toBe("");
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
  });

  it("одиночный выбор объектом {Value}", () => {
    expect(cellText({ Value: "Годен" })).toBe("Годен");
  });

  it("коллекция строк (MultiChoice)", () => {
    expect(cellText({ results: ["Годен", "Брак"] })).toBe("Годен; Брак");
    expect(cellText(["Годен", "Брак"])).toBe("Годен; Брак");
  });

  it("коллекция объектов {Value} — тот самый «[object Object]»", () => {
    const value = {
      __metadata: { type: "Collection(Edm.String)" },
      results: [{ Value: "Приёмка" }, { Value: "Отгрузка" }],
    };
    expect(cellText(value)).toBe("Приёмка; Отгрузка");
    expect(cellText(value)).not.toContain("[object Object]");
  });

  it("taxonomy/lookup: Label и LookupValue", () => {
    expect(cellText({ Label: "РЦ-8114", TermGuid: "x" })).toBe("РЦ-8114");
    expect(cellText({ LookupValue: "Заявка 12" })).toBe("Заявка 12");
  });

  it("deferred и пустой объект — пустая строка", () => {
    expect(cellText({ __deferred: { uri: "…" } })).toBe("");
    expect(cellText({})).toBe("");
  });

  it("вложенность и пустые элементы", () => {
    expect(cellText({ results: [{ Value: "А" }, null, { Value: "" }] })).toBe("А");
    expect(cellText([{ Value: { Value: "Глубже" } }])).toBe("Глубже");
  });
});
