// src/features/dob/__tests__/personText.test.js
//
// Поля «Пользователь или группа» (User и UserMulti): из значения SharePoint
// нужно получить ФИО, а не объект и не пустоту.

import { describe, it, expect } from "vitest";
import { personName, personNames, personNameList, personCellText } from "../lib/personText";

describe("personText", () => {
  it("одно значение — ФИО из Title", () => {
    expect(personName({ Id: 7, Title: "Иванов Иван", EMail: "i@x.ru" })).toBe("Иванов Иван");
    expect(personNames({ Id: 7, Title: "Иванов Иван" })).toBe("Иванов Иван");
  });

  it("UserMulti — список ФИО через запятую", () => {
    const value = {
      __metadata: { type: "Collection(SP.User)" },
      results: [{ Id: 7, Title: "Иванов Иван" }, { Id: 9, Title: "Петрова Анна" }],
    };
    expect(personNames(value)).toBe("Иванов Иван, Петрова Анна");
    expect(personNameList(null, "X")).toEqual([]);
  });

  it("массив значений и запасные ключи (Name/LookupValue)", () => {
    expect(personNames([{ Title: "А" }, { Name: "Б" }])).toBe("А, Б");
    expect(personName({ LookupValue: "Группа РЦ" })).toBe("Группа РЦ");
  });

  it("нераскрытое значение (__deferred) — пусто, без URL в ячейке", () => {
    expect(personName({ __deferred: { uri: "http://sp/FieldValuesAsText" } })).toBe("");
  });

  it("строка списка: значение, OData_-вариант, ключ «поле/Title» и Id как запасной", () => {
    expect(personCellText({ Initiator: { Title: "Иванов Иван" } }, "Initiator")).toBe("Иванов Иван");
    expect(personCellText({ "Initiator/Title": "Иванов Иван" }, "Initiator")).toBe("Иванов Иван");
    expect(personCellText({ OData__Initiator: { Title: "Иванов Иван" } }, "Initiator")).toBe("Иванов Иван");
    // $expand не сработал — в строке только Id
    expect(personCellText({ Initiator: { __deferred: {} }, InitiatorId: 12 }, "Initiator")).toBe("12");
    expect(personCellText({}, "Initiator")).toBe("");
    expect(personCellText(null, "Initiator")).toBe("");
  });
});
