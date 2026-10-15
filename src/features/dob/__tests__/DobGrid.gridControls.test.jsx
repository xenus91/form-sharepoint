// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.gridControls.test.jsx
//
// Требования 2026-10-15:
//   • «удали чекбокс из таблицы»;
//   • «добавить возможность свернуть и развернуть всю таблицу по группам»;
//   • «интерфейс ag-grid перевести на русскую локаль».

import { describe, it, expect, beforeEach } from "vitest";
import { renderDobGrid, click, textOf, sideButton } from "./helpers/dobGridHarness";

describe("DobGrid — чекбоксы, группы, локаль", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("чекбоксов в таблице нет", async () => {
    const { host } = await renderDobGrid({ stateScope: "no_checkbox" });
    // Отдельной колонки с галочками нет вовсе…
    expect(host.querySelectorAll('[col-id="ag-Grid-SelectionColumn"]').length).toBe(0);
    // …в строках галочек нет…
    expect(host.querySelectorAll(".ag-row .ag-checkbox, .ag-row .ag-selection-checkbox").length).toBe(0);
    // …а скрытые заготовки AG Grid не показаны.
    const visible = [...host.querySelectorAll(".ag-selection-checkbox, .ag-header-select-all")]
      .filter((el) => !el.classList.contains("ag-hidden"));
    expect(visible.length).toBe(0);
  });

  it("клик по строке по-прежнему выделяет её (нужно кнопке «Открыть»)", async () => {
    const { host } = await renderDobGrid({ stateScope: "row_click" });
    const cell = [...host.querySelectorAll('.ag-cell[col-id="Title"]')].find((c) => (c.textContent || "").includes("Первая"));
    expect(cell).toBeTruthy();
    await click(cell);
    expect(host.querySelectorAll(".ag-row-selected").length).toBeGreaterThan(0);
  });

  it("кнопками над таблицей группы сворачиваются и разворачиваются", async () => {
    const { host } = await renderDobGrid({ stateScope: "expand_collapse" });
    expect(textOf(host)).toContain("Первая");

    await click(host.querySelector('[data-testid="dob-grid-collapse-all"]'));
    expect(textOf(host)).not.toContain("Первая");
    expect(textOf(host)).toContain("Открыт");

    await click(host.querySelector('[data-testid="dob-grid-expand-all"]'));
    expect(textOf(host)).toContain("Первая");
  });

  it("есть кнопка сброса настроек таблицы", async () => {
    const { host } = await renderDobGrid({ stateScope: "reset_button" });
    expect(host.querySelector('[data-testid="dob-grid-reset-state"]')).toBeTruthy();
  });

  it("интерфейс грида на русском", async () => {
    const { host } = await renderDobGrid({ stateScope: "locale" });
    const status = (host.querySelector(".ag-status-bar")?.textContent || "").replace(/\s+/g, " ");
    expect(status).toContain("Строки");
    expect(status).toContain("Выделено");
    // агрегации убраны (2026-10-15) — агрегатов в статус-панели нет
    for (const label of ["Сумма", "Среднее", "Количество", "Минимум", "Максимум"]) {
      expect(status).not.toContain(label);
    }

    const paging = (host.querySelector(".ag-paging-panel")?.textContent || "").replace(/\s+/g, " ");
    expect(paging).toContain("Страница");

    // панель «Колонки»: разделы тоже по-русски
    await click(sideButton(host, "Колонки"));
    const panel = (host.querySelector(".ag-tool-panel-wrapper")?.textContent || "").replace(/\s+/g, " ");
    expect(panel).toContain("Группы строк");
    expect(panel).not.toContain("Значения");
  });
});
