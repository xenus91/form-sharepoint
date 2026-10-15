// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.grouping.test.jsx
//
// Группировка таблицы #dob_requests по статусу. Row Grouping в AG Grid —
// Enterprise-фича, а стоит ag-grid-community, поэтому группы собираются вручную
// (lib/requestListFilters) — проверяем, что заголовки групп реально видны.

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
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice" },
];

const ROWS = [
  { ID: 1, Title: "Первая", Status: "Открыт" },
  { ID: 2, Title: "Вторая", Status: "Открыт" },
  { ID: 3, Title: "Третья", Status: "Завершена" },
];

async function renderGrid({ groupByStatus = true } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <DobListStateProvider fields={FIELDS} rows={ROWS}>
        <DobGrid fields={FIELDS} rows={ROWS} groupByStatus={groupByStatus} />
      </DobListStateProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  return { host, root };
}

describe("DobGrid — группировка по статусу", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("перед каждой группой стоит заголовок со счётчиком", async () => {
    const { host } = await renderGrid();
    // Строка в AG Grid лежит и в pinned-, и в center-контейнере — считаем в одном.
    const groupRows = [...host.querySelectorAll(".ag-center-cols-container .dob-group-row")];
    expect(groupRows.length).toBe(2);

    const text = (host.textContent || "").replace(/\s+/g, " ");
    expect(text).toContain("Открыт — 2");
    expect(text).toContain("Завершена — 1");
  });

  it("первой идёт группа первой строки, строки групп не перемешаны", async () => {
    const { host } = await renderGrid();
    const rows = [...host.querySelectorAll('.ag-center-cols-container [row-id]')];
    const order = rows.map((row) => {
      const id = row.getAttribute("row-id");
      return id.startsWith("group:") ? id : `#${id}`;
    });
    expect(order).toEqual(["group:Открыт", "#1", "#2", "group:Завершена", "#3"]);
  });

  it("без группировки заголовков групп нет", async () => {
    const { host } = await renderGrid({ groupByStatus: false });
    expect(host.querySelectorAll(".ag-center-cols-container .dob-group-row").length).toBe(0);
    expect(host.querySelectorAll('.ag-center-cols-container [row-id="1"]').length).toBe(1);
  });
});
