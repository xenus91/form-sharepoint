// src/features/dob/lib/__tests__/requestListFilters.test.js
// Фильтры шапки и группировка таблицы по статусу (ag-grid-community).

import { describe, it, expect } from "vitest";
import {
  groupRowsByStatus,
  regroupSortedNodes,
  statusTextOf,
  matchesContentType,
  isGroupRow,
  groupRowId,
  NO_STATUS_LABEL,
} from "../requestListFilters";

const ROWS = [
  { ID: 1, Status: "Открыт" },
  { ID: 2, Status: { Value: "В работе" } },
  { ID: 3, Status: "Открыт" },
  { ID: 4, OData__Status: "Завершена" },
];

describe("группировка по статусу", () => {
  it("перед каждой группой встаёт заголовок со счётчиком, порядок строк не меняется", () => {
    const grouped = groupRowsByStatus(ROWS, "Status");
    expect(grouped.map((r) => (isGroupRow(r) ? `${r.__groupLabel}(${r.__groupCount})` : r.ID))).toEqual([
      "Открыт(2)", 1, 3, "В работе(1)", 2, "Завершена(1)", 4,
    ]);
    expect(groupRowId(grouped[0])).toBe("group:Открыт");
  });

  it("пустой статус попадает в группу «(без статуса)»", () => {
    const grouped = groupRowsByStatus([{ ID: 5 }, { ID: 6, Status: "Открыт" }], "Status");
    expect(grouped[0].__groupLabel).toBe(NO_STATUS_LABEL);
    expect(grouped[0].__groupCount).toBe(1);
  });

  it("после сортировки группы собираются заново (postSortRows)", () => {
    const grouped = groupRowsByStatus(ROWS, "Status");
    // Имитируем сортировку AG Grid «по убыванию ID» — заголовки перемешались.
    const nodes = grouped.map((data) => ({ data }));
    nodes.sort((a, b) => {
      const idA = isGroupRow(a.data) ? -1 : a.data.ID;
      const idB = isGroupRow(b.data) ? -1 : b.data.ID;
      return idB - idA;
    });

    regroupSortedNodes(nodes, "Status");

    // Порядок групп — по первой строке группы в отсортированном списке.
    expect(nodes.map((n) => (isGroupRow(n.data) ? n.data.__groupLabel : n.data.ID))).toEqual([
      "Завершена", 4, "Открыт", 3, 1, "В работе", 2,
    ]);
  });

  it("значение статуса разбирается и из объекта Choice, и из OData__-колонки", () => {
    expect(statusTextOf({ Status: { Value: "Открыт" } })).toBe("Открыт");
    expect(statusTextOf({ OData__Status: "Завершена" }, "Status")).toBe("Завершена");
    expect(statusTextOf({ Status: "<b>Открыт</b>" })).toBe("Открыт");
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
});
