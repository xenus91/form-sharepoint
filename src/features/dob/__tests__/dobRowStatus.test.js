// src/features/dob/__tests__/dobRowStatus.test.js
//
// Завершённую задачу нельзя править НИГДЕ — в том числе ячейкой прямо в
// таблице ДОБ (#dob_tasks). Здесь проверяется определение «строка завершена».

import { describe, it, expect } from "vitest";
import { isRowCompleted, statusInternalOf } from "../lib/dobRowStatus";

describe("dobRowStatus — завершённая строка списка ДОБ", () => {
  it("«Завершена» + PercentComplete 1 → завершена", () => {
    expect(isRowCompleted({ Status: "Завершена", PercentComplete: 1 })).toBe(true);
  });

  it("«Завершена» без процента → завершена", () => {
    expect(isRowCompleted({ Status: "Завершена" })).toBe(true);
  });

  it("только PercentComplete = 1 → завершена", () => {
    expect(isRowCompleted({ Status: "В работе", PercentComplete: 1 })).toBe(true);
  });

  it("«В работе» → не завершена", () => {
    expect(isRowCompleted({ Status: "В работе", PercentComplete: 0 })).toBe(false);
  });

  it("«Не начата» → не завершена", () => {
    expect(isRowCompleted({ Status: "Не начата", PercentComplete: 0 })).toBe(false);
  });

  it("пустая строка → не завершена", () => {
    expect(isRowCompleted(null)).toBe(false);
    expect(isRowCompleted(undefined)).toBe(false);
    expect(isRowCompleted({})).toBe(false);
  });

  it("статус в OData-колонке (OData__Status)", () => {
    expect(isRowCompleted({ OData__Status: "Завершена", OData__PercentComplete: 1 })).toBe(true);
  });

  it("статус в колонке с нестандартным именем — по statusInternalOf", () => {
    const fields = [
      { InternalName: "Title", Title: "Название" },
      { InternalName: "OData__x0421__x0442__x0430__x0442__x0443__x0441", Title: "Статус" },
    ];
    const internal = statusInternalOf(fields);
    expect(internal).toBe("OData__x0421__x0442__x0430__x0442__x0443__x0441");
    const row = { [internal]: "Завершена", PercentComplete: 1 };
    expect(isRowCompleted(row, internal)).toBe(true);
  });

  it("без колонки статуса — имя по умолчанию Status", () => {
    expect(statusInternalOf([])).toBe("Status");
    expect(statusInternalOf(null)).toBe("Status");
  });
});
