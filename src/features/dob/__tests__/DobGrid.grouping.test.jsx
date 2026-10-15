// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.grouping.test.jsx
//
// Группировка таблицы #dob_requests по статусу — ШТАТНАЯ функция AG Grid
// (colDef.rowGroup + groupDisplayType="groupRows", модуль RowGroupingModule из
// ag-grid-enterprise). Группы строит сам грид: подпись, счётчик, шеврон.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

vi.mock("../api/dobApi", () => ({
  updateDobItem: vi.fn(async () => ({ ok: true })),
  getDobItem: vi.fn(async () => ({})),
}));

const { default: DobGrid } = await import("../components/DobGrid");
const { DobListStateProvider } = await import("../state/DobListStateContext");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "Title", Title: "Название", TypeAsString: "Text" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["Открыт", "Завершена"] } },
];

const ROWS = [
  { ID: 1, Title: "Первая", Status: "Открыт" },
  { ID: 2, Title: "Вторая", Status: "Открыт" },
  { ID: 3, Title: "Третья", Status: "Завершена" },
];

/** По умолчанию в таблице фильтр «Открыт» — в тестах групп его отключаем. */
async function renderGrid(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <DobListStateProvider fields={FIELDS} rows={ROWS}>
        <DobGrid fields={FIELDS} rows={ROWS} initialStatusFilter={null} {...props} />
      </DobListStateProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 180)); });
  return { host, root };
}

const groupLabels = (host) => [
  ...new Set([...host.querySelectorAll(".ag-group-value")].map((el) => (el.textContent || "").trim())),
];
const groupCounts = (host) => [
  ...new Set([...host.querySelectorAll(".ag-group-child-count")].map((el) => (el.textContent || "").trim())),
];
const text = (host) => (host.textContent || "").replace(/\s+/g, " ");

describe("DobGrid — штатная группировка AG Grid по статусу", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("грид строит группы со счётчиком", async () => {
    const { host } = await renderGrid();
    expect(host.querySelectorAll(".ag-row-group").length).toBeGreaterThan(0);
    expect(groupLabels(host)).toEqual(["Открыт", "Завершена"]);
    expect(groupCounts(host).sort()).toEqual(["(1)", "(2)"]);
    // признак штатной группировки AG Grid: шевроны разворачивания
    expect(host.querySelectorAll(".ag-group-expanded, .ag-group-contracted").length).toBeGreaterThan(0);
  });

  it("группу можно свернуть кликом по шеврону — её строки скрываются", async () => {
    const { host } = await renderGrid();
    expect(text(host)).toContain("Первая");

    const toggle = host.querySelector(".ag-group-expanded") || host.querySelector(".ag-group-contracted");
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 180));
    });

    expect(text(host)).not.toContain("Первая");
    expect(text(host)).toContain("Завершена");
  });

  it("по умолчанию показаны только заявки «Открыт» (стартовый Set-фильтр)", async () => {
    const { host } = await renderGrid({ initialStatusFilter: ["Открыт"] });
    expect(text(host)).toContain("Первая");
    expect(text(host)).not.toContain("Третья");
    expect(groupLabels(host)).toEqual(["Открыт"]);
  });
});
