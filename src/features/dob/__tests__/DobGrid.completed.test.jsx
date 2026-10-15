// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.completed.test.jsx
//
// Таблица ДОБ (#dob_requests) с 2026-10-15 только просматривается: правки в
// ячейках нет ни у открытых, ни у завершённых строк. Завершённая строка при
// этом по-прежнему помечается визуально («только просмотр»).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

vi.mock("../api/dobApi", () => ({
  updateDobItem: vi.fn(async () => ({ ok: true })),
  getDobItem: vi.fn(async () => ({})),
}));

vi.mock("../../NotificationsProvider", () => ({
  default: ({ children }) => children,
  useNotifications: () => ({ notify: vi.fn() }),
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
  { InternalName: "Comment", Title: "Комментарий", TypeAsString: "Text" },
];

const ROWS = [
  { ID: 1, Title: "Открытая заявка", Status: "В работе", PercentComplete: 0, Comment: "правим" },
  { ID: 2, Title: "Закрытая заявка", Status: "Завершена", PercentComplete: 1, Comment: "не правим" },
];

async function renderGrid(rows = ROWS) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <DobListStateProvider fields={FIELDS} rows={rows}>
        <DobGrid fields={FIELDS} rows={rows} />
      </DobListStateProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  return { host };
}

const rowById = (host, id) => host.querySelector(`[row-id="${id}"]`);

describe("DobGrid — завершённую строку править нельзя", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("завершённая строка помечена как «только просмотр», открытая — нет", async () => {
    const { host } = await renderGrid();
    const open = rowById(host, 1);
    const done = rowById(host, 2);
    expect(open).toBeTruthy();
    expect(done).toBeTruthy();
    expect(done.classList.contains("dob-row-completed")).toBe(true);
    expect(open.classList.contains("dob-row-completed")).toBe(false);
  });

  it("ячейки заявок не редактируются — ни открытой, ни завершённой строки", async () => {
    const { host } = await renderGrid();
    // В jsdom видны только закреплённые колонки (ID/Title) — остальные
    // виртуализованы за пределами нулевой ширины контейнера.
    const cellOf = (id) => {
      const row = rowById(host, id);
      return [...row.querySelectorAll(".ag-cell")].find((c) => c.getAttribute("col-id") === "Title");
    };
    const openCell = cellOf(1);
    const doneCell = cellOf(2);
    expect(openCell).toBeTruthy();
    expect(doneCell).toBeTruthy();

    const dblClick = (cell) => act(async () => {
      cell.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 60));
    });

    await dblClick(openCell);
    const openEditing = rowById(host, 1).querySelector(".ag-cell-inline-editing");
    await dblClick(doneCell);
    const doneEditing = rowById(host, 2).querySelector(".ag-cell-inline-editing");

    // Заявки не редактируются вовсе — двойной клик по ячейке ничего не открывает.
    expect(openEditing).toBeNull();
    expect(doneEditing).toBeNull();
  });

  it("в колонках нет ни одной редактируемой ячейки (readOnly)", async () => {
    const { host } = await renderGrid();
    const cells = [...host.querySelectorAll(".ag-cell")];
    expect(cells.length).toBeGreaterThan(0);
    // AG Grid помечает редактируемую ячейку атрибутом/классом при наведении;
    // надёжнее проверить, что редактор не поднимается ни в одной ячейке строки.
    for (const cell of cells) {
      await act(async () => {
        cell.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(cell.classList.contains("ag-cell-inline-editing")).toBe(false);
    }
  });
});
