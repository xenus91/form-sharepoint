// src/features/dob/lib/__tests__/requestListFilters.test.js
// Вспомогательные функции фильтров шапки #dob_requests.
// (Группировка по статусу — штатная функция AG Grid, см. DobGrid.grouping.test.)

import { describe, it, expect } from "vitest";
import { statusTextOf, statusGroupLabel, matchesContentType, NO_STATUS_LABEL } from "../requestListFilters";

describe("значение статуса строки", () => {
  it("разбирается и из объекта Choice, и из OData__-колонки, и из HTML", () => {
    expect(statusTextOf({ Status: { Value: "Открыт" } })).toBe("Открыт");
    expect(statusTextOf({ OData__Status: "Завершена" }, "Status")).toBe("Завершена");
    expect(statusTextOf({ Status: "<b>Открыт</b>" })).toBe("Открыт");
    expect(statusTextOf({})).toBe("");
  });

  it("пустой статус получает подпись «(без статуса)»", () => {
    expect(statusGroupLabel({}, "Status")).toBe(NO_STATUS_LABEL);
    expect(statusGroupLabel({ Status: "Открыт" }, "Status")).toBe("Открыт");
  });
});

describe("фильтр по типу контента", () => {
  it("совпадение полное и по префиксу (наследники типа)", () => {
    const ct = "0x0100ABC123";
    expect(matchesContentType("0x0100ABC123", ct)).toBe(true);
    expect(matchesContentType("0x0100ABC12300DEADBEEF", ct)).toBe(true);
    expect(matchesContentType("0x0100OTHER", ct)).toBe(false);
    expect(matchesContentType("", ct)).toBe(false);
  });

  it("ContentTypeId берётся из строки", () => {
    expect(matchesContentType({ ContentTypeId: "0x0100ABC123" }, "0x0100ABC123")).toBe(true);
    expect(matchesContentType({ OData__ContentTypeId: "0x0100ABC123" }, "0x0100abc123")).toBe(true);
  });
});
