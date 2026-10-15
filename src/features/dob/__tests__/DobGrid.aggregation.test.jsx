// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.aggregation.test.jsx
//
// «Агрегация по группам не работает»: при переносе колонки в «Значения» в строке
// группы ничего не появлялось, потому что у колонки не было aggFunc («Без
// агрегации»). Проверяем через api.setValueColumns() — это то же действие, что и
// перенос колонки в раздел «Значения» панели «Колонки».

import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react-dom/test-utils";
import { renderDobGrid } from "./helpers/dobGridHarness";

const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "Title", Title: "Тема заявки", TypeAsString: "Text" },
  { InternalName: "Amount", Title: "Сумма", TypeAsString: "Currency" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice" },
];

const ROWS = [
  { ID: 1, Title: "Первая", Amount: 100, Status: "Открыт" },
  { ID: 2, Title: "Вторая", Amount: 250, Status: "Открыт" },
  { ID: 3, Title: "Третья", Amount: 40, Status: "Завершена" },
];

const groupCells = (host, colId) => [
  ...host.querySelectorAll(`.ag-row-group [col-id="${colId}"]`)].map((c) => (c.textContent || "").replace(/[\u00a0\s]+/g, " ").trim());

const headers = (host) => [...host.querySelectorAll(".ag-header-cell-text")].map((e) => e.textContent.trim()).filter(Boolean);

describe("DobGrid — агрегация по группам", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("колонка в «Значениях» даёт агрегат в строке группы", async () => {
    let api = null;
    const { host } = await renderDobGrid({
      fields: FIELDS,
      rows: ROWS,
      contentTypes: [],
      stateScope: "agg_api",
      onGridReady: (e) => { api = e?.api || null; },
    });
    expect(api).toBeTruthy();

    // «Открыт»: 100 + 250 = 350; «Завершена»: 40
    await act(async () => {
      api.setValueColumns(["Amount"]);
      await new Promise((r) => setTimeout(r, 300));
    });
    const cells = groupCells(host, "Amount");
    expect(cells).toContain("350,00");
    expect(cells).toContain("40,00");
  });

  it("у нечисловой колонки агрегат — количество", async () => {
    let api = null;
    const { host } = await renderDobGrid({
      fields: FIELDS,
      rows: ROWS,
      contentTypes: [],
      stateScope: "agg_count",
      onGridReady: (e) => { api = e?.api || null; },
    });

    await act(async () => {
      api.setValueColumns(["Title"]);
      await new Promise((r) => setTimeout(r, 300));
    });
    const cells = groupCells(host, "Title");
    expect(cells).toContain("2"); // «Открыт» — две заявки
    expect(cells).toContain("1"); // «Завершена» — одна
  });

  it("названия колонок из Description остаются (aggFunc шапку не съедает)", async () => {
    let api = null;
    const { host } = await renderDobGrid({
      fields: FIELDS,
      rows: ROWS,
      contentTypes: [],
      stateScope: "agg_headers",
      onGridReady: (e) => { api = e?.api || null; },
    });
    expect(headers(host)).toContain("Тема заявки");

    await act(async () => {
      api.setValueColumns(["Amount", "Title"]);
      await new Promise((r) => setTimeout(r, 300));
    });
    const after = headers(host);
    expect(after).toContain("Тема заявки");
    expect(after.some((h) => h.includes("Количество(") || h.includes("Сумма("))).toBe(false);
  });
});
