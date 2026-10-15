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
describe("DobGrid — агрегации (поведение 14bed60)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("в панели «Колонки» есть раздел «Значения»", async () => {
    const { host } = await renderDobGrid({ stateScope: "agg_panel" });
    await click(sideButton(host, "Колонки"));
    const panel = (host.querySelector(".ag-tool-panel-wrapper")?.textContent || "").replace(/\s+/g, " ");
    expect(panel).toContain("Группы строк");
    expect(panel).toContain("Значения");
  });

  it("колонка из сохранённого состояния попадает в «Значения» с функцией агрегата", async () => {
    const scope = "agg_values";
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      rowGroup: { groupColIds: ["Status"] },
      aggregation: { aggregationModel: [{ colId: "ID", aggFunc: "sum" }] },
      partialColumnState: true,
    }));
    const { host } = await renderDobGrid({ stateScope: scope });
    await click(sideButton(host, "Колонки"));
    const panel = (host.querySelector(".ag-tool-panel-wrapper")?.textContent || "").replace(/\s+/g, " ");
    // чип в разделе «Значения» показывает выбранную функцию
    expect(panel).toContain("Сумма(ID)");
  });

  it("в статус-панели есть агрегаты по выделению", async () => {
    const { host } = await renderDobGrid({ stateScope: "agg_bar" });
    const bar = (host.querySelector(".ag-status-bar")?.textContent || "").replace(/\s+/g, " ");
    for (const label of ["Сумма", "Среднее", "Количество", "Минимум", "Максимум"]) {
      expect(bar).toContain(label);
    }
  });

  it("строка группы — отдельная строка с названием и числом заявок", async () => {
    const scope = "agg_grouprow";
    const rows = [
      { ID: 10, Title: "Первая", Status: "Открыт", ContentTypeId: "0x0100AA" },
      { ID: 20, Title: "Вторая", Status: "Открыт", ContentTypeId: "0x0100AA" },
      { ID: 5, Title: "Третья", Status: "Завершена", ContentTypeId: "0x0100BB" },
    ];
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      rowGroup: { groupColIds: ["Status"] },
      aggregation: { aggregationModel: [{ colId: "ID", aggFunc: "sum" }] },
      partialColumnState: true,
    }));
    let api = null;
    const { host } = await renderDobGrid({
      stateScope: scope,
      rows,
      onGridReady: (e) => { api = e?.api || null; },
    });

    // режим строки группы — как в 14bed60
    expect(api.getGridOption("groupDisplayType")).toBe("groupRows");
    expect(api.getGridOption("groupSuppressBlankHeader")).toBeFalsy();
    // полноширинная строка группы (groupDisplayType="groupRows")
    expect(host.querySelector(".ag-full-width-row.ag-row-group")).toBeTruthy();
    const labels = [...host.querySelectorAll(".ag-full-width-row.ag-row-group .ag-group-value")]
      .map((e) => (e.textContent || "").trim());
    expect(labels).toContain("Открыт");
    expect(labels).toContain("Завершена");
    const counts = [...host.querySelectorAll(".ag-full-width-row.ag-row-group .ag-group-child-count")]
      .map((e) => (e.textContent || "").trim()).filter(Boolean);
    expect([...new Set(counts)]).toEqual(["(2)", "(1)"]);
    // в самой строке группы сумм нет — агрегат живёт в «Значениях» и внизу
    expect(textOf(host.querySelector(".ag-full-width-row.ag-row-group"))).not.toContain("30");
  });
});
