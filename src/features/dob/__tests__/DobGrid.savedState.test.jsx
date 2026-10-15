// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.savedState.test.jsx
//
// Требования 2026-10-15:
//   • «добавь возможность сохранения пользовательских настроек ag-grid»;
//   • агрегации убраны (2026-10-15): ни раздела «Значения», ни сумм в строке группы.

import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react-dom/test-utils";
import { renderDobGrid, click, textOf, sideButton } from "./helpers/dobGridHarness";
import { gridStateKey } from "../lib/gridStateStorage";

const wait = async (ms) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

describe("DobGrid — сохранение настроек", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("изменение группировки сохраняется в localStorage и восстанавливается", async () => {
    const scope = "saved_state";
    const { host } = await renderDobGrid({ stateScope: scope });
    expect(textOf(host)).toContain("Первая");

    // сворачиваем группу — это изменение состояния грида
    const toggle = host.querySelector(".ag-group-expanded") || host.querySelector(".ag-group-contracted");
    expect(toggle).toBeTruthy();
    await click(toggle);
    expect(textOf(host)).not.toContain("Первая");
    // запись идёт с задержкой 400 мс
    await wait(600);

    const raw = localStorage.getItem(gridStateKey(scope));
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw);
    expect(saved.rowGroupExpansion).toBeTruthy();

    // новый грид открывается в том же виде: группа свёрнута
    const { host: host2 } = await renderDobGrid({ stateScope: scope });
    expect(textOf(host2)).not.toContain("Первая");
    expect(textOf(host2)).toContain("Открыт");
  });

  it("кнопка «Сбросить настройки таблицы» очищает хранилище и возвращает вид по умолчанию", async () => {
    const scope = "saved_state_reset";
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      columnVisibility: { hiddenColIds: ["Title"] },
      partialColumnState: true,
    }));
    const { host } = await renderDobGrid({ stateScope: scope });
    // сохранённая настройка применилась: колонка «Название» скрыта
    expect(host.querySelector('.ag-header-cell[col-id="Title"]')).toBe(null);

    await click(host.querySelector('[data-testid="dob-grid-reset-state"]'));
    await wait(300);

    expect(localStorage.getItem(gridStateKey(scope))).toBe(null);
    // грид пересоздан с настройками по умолчанию — колонка на месте
    expect(document.querySelector('.ag-header-cell[col-id="Title"]')).toBeTruthy();
  });

  it("сохранённые настройки важнее стартового фильтра «Открыт»", async () => {
    const scope = "saved_state_filter";
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      // пользователь снял фильтр «Открыт» и оставил группы раскрытыми
      filter: { filterModel: {} },
      rowGroupExpansion: {
        expandedRowGroupIds: ["row-group-Status-Открыт", "row-group-Status-Завершена"],
      },
      partialColumnState: true,
    }));
    const { host } = await renderDobGrid({ stateScope: scope, initialStatusFilter: ["Открыт"] });
    // пользователь когда-то снял фильтр — не возвращаем его насильно
    expect(textOf(host)).toContain("Третья");
  });
});
describe("DobGrid — агрегации убраны", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("в панели «Колонки» нет раздела «Значения»", async () => {
    const { host } = await renderDobGrid({ stateScope: "no_agg_panel" });
    await click(sideButton(host, "Колонки"));
    const panel = (host.querySelector(".ag-tool-panel-wrapper")?.textContent || "").replace(/\s+/g, " ");
    expect(panel).toContain("Группы строк");
    expect(panel).not.toContain("Значения");
  });

  it("сохранённое состояние с агрегатом не показывает чисел в строке группы", async () => {
    const scope = "no_agg_state";
    const rows = [
      { ID: 10, Title: "Первая", Status: "Открыт", ContentTypeId: "0x0100AA" },
      { ID: 20, Title: "Вторая", Status: "Открыт", ContentTypeId: "0x0100AA" },
      { ID: 5, Title: "Третья", Status: "Завершена", ContentTypeId: "0x0100BB" },
    ];
    // Состояние могло остаться от старой сборки — агрегат должен игнорироваться.
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      rowGroup: { groupColIds: ["Status"] },
      aggregation: { aggregationModel: [{ colId: "ID", aggFunc: "sum" }] },
      partialColumnState: true,
    }));
    const { host } = await renderDobGrid({ stateScope: scope, rows });

    const groupCells = [...host.querySelectorAll('.ag-row-group [col-id="ID"]')]
      .map((c) => (c.textContent || "").trim());
    expect(groupCells).not.toContain("30");
    expect(groupCells).not.toContain("5");

    // группировка при этом работает: подписи и счётчики строк на месте
    expect(textOf(host)).toContain("Открыт");
    expect(textOf(host)).toContain("Завершена");
  });

  it("в статус-панели нет агрегатов по выделению", async () => {
    const { host } = await renderDobGrid({ stateScope: "no_agg_bar" });
    const bar = (host.querySelector(".ag-status-bar")?.textContent || "").replace(/\s+/g, " ");
    expect(bar).toContain("Строки");
    for (const label of ["Сумма", "Среднее", "Количество", "Минимум", "Максимум"]) {
      expect(bar).not.toContain(label);
    }
  });
});
