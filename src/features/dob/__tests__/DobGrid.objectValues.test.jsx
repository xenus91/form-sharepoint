// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.objectValues.test.jsx
//
// Баг 2026-10-15: «[object Object]» в ячейках. Причина — форматтеры числовых и
// датных колонок делали String(значение), а значение приходило объектом-обёрткой
// ({Value: 1500}, {Value: '/Date(…)/'}): числовой форматтер печатал
// «[object Object]», датный — «[object Ob» (String(v).slice(0, 10)).

import { describe, it, expect, beforeEach } from "vitest";
import { renderDobGrid, textOf } from "./helpers/dobGridHarness";

const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "Amount", Title: "Сумма", TypeAsString: "Currency" },
  { InternalName: "Qty", Title: "Количество", TypeAsString: "Number" },
  { InternalName: "PlanDate", Title: "Дата плана", TypeAsString: "DateTime" },
  { InternalName: "Link", Title: "Ссылка", TypeAsString: "URL" },
];

const ROWS = [
  {
    ID: 1,
    Amount: { Value: 1500 },
    Qty: { Value: 3 },
    PlanDate: { Value: "2026-10-01T00:00:00Z" },
    Link: { Url: "http://x", Description: "отчёт" },
  },
  { ID: 2, Amount: { __deferred: { uri: "x" } }, Qty: {}, PlanDate: {}, Link: {} },
  { ID: 3, Amount: "2500", Qty: 7, PlanDate: "2026-10-05T00:00:00Z", Link: "http://y" },
];

// В отформатированных числах разделитель тысяч — неразрывный пробел (U+00A0),
// поэтому приводим все пробелы к обычным.
const cellsOf = (host, colId) => [
  ...new Set(
    [...host.querySelectorAll(`[col-id="${colId}"]`)]
      .map((c) => (c.textContent || "").replace(/[\u00a0\s]+/g, " ").trim()),
  ),
];

describe("DobGrid — значения-объекты в ячейках", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("«[object Object]» в таблице нет", async () => {
    const { host } = await renderDobGrid({ fields: FIELDS, rows: ROWS, contentTypes: [], stateScope: "obj_values" });
    expect(textOf(host)).not.toContain("[object Object]");
    expect(textOf(host)).not.toContain("[object Ob");
  });

  it("числа из объекта-обёртки показываются числами", async () => {
    const { host } = await renderDobGrid({ fields: FIELDS, rows: ROWS, contentTypes: [], stateScope: "obj_numbers" });
    expect(cellsOf(host, "Amount")).toContain("1 500,00");
    expect(cellsOf(host, "Amount")).toContain("2 500,00");
    expect(cellsOf(host, "Qty")).toContain("3");
    expect(cellsOf(host, "Qty")).toContain("7");
  });

  it("дата из объекта-обёртки показывается русской датой", async () => {
    const { host } = await renderDobGrid({ fields: FIELDS, rows: ROWS, contentTypes: [], stateScope: "obj_dates" });
    const dates = cellsOf(host, "PlanDate");
    // 1 октября 2026 из {Value: '2026-10-01T00:00:00Z'} и 5 октября из строки
    expect(dates).toContain("01.10.2026");
    expect(dates).toContain("05.10.2026");
    expect(dates.some((d) => d.includes("[object"))).toBe(false);
  });

  it("пустые значения-объекты — пустая ячейка, не мусор", async () => {
    const { host } = await renderDobGrid({ fields: FIELDS, rows: ROWS, contentTypes: [], stateScope: "obj_empty" });
    for (const colId of ["Amount", "Qty", "PlanDate", "Link"]) {
      for (const text of cellsOf(host, colId)) {
        expect(text).not.toContain("[object");
      }
    }
  });
});
