// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.perf.test.jsx
//
// Поповер действий должен открываться БЫСТРО. Причина былых тормозов: состояние
// меню (menuRow/menuAnchor) жило в TasksGrid, поэтому каждый клик по строке
// перерисовывал всю таблицу AG Grid. Таблица вынесена в memo-компонент
// `GridTable`, набор действий строки собирается один раз на открытие.
//
// Здесь проверяется именно это: открытие/закрытие поповера НЕ заставляет грид
// рендериться, а легитимные обновления (строки, поиск) — заставляют.

import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const state = vi.hoisted(() => ({ gridRenders: 0 }));

// Вместо настоящего AG Grid — заглушка, которая считает рендеры и рисует
// правдоподобные строки (по ним тест «кликает» как по ячейкам настоящего грида).
vi.mock("ag-grid-react", async () => {
  const React = (await import("react")).default;
  const h = React.createElement;
  return {
    AgGridReact: (props) => {
      state.gridRenders += 1;
      return h(
        "div",
        { className: "ag-root-wrapper" },
        h(
          "div",
          { className: "ag-center-cols-container" },
          (props.rowData || []).map((row) =>
            h(
              "div",
              { key: row.compositeId, className: "ag-row" },
              h(
                "div",
                {
                  className: "ag-cell",
                  // AG Grid отдаёт событие объектом c полями data/event
                  onClick: (event) => props.onCellClicked?.({ data: row, event }),
                },
                String(row.Title || ""),
              ),
            ),
          ),
        ),
      );
    },
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false,
  media: q,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const { default: TasksGrid } = await import("../components/TasksGrid");

const ROWS = [
  { compositeId: "main:10", sourceId: "main", Id: 10, Title: "Основная задача ООБ", Status: "В работе", PercentComplete: 0 },
  { compositeId: "dob:1", sourceId: "dob", Id: 1, Title: "Заявка ООБ", Status: "Не начата", PercentComplete: 0 },
];

const settle = async (ms = 60) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

function renderGrid(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const theme = createTheme();
  const draw = (extra) => act(() => {
    root.render(
      <ThemeProvider theme={theme}>
        <TasksGrid rows={ROWS} {...props} {...extra} />
      </ThemeProvider>
    );
  });
  draw({});
  return { host, root, draw };
}

const cellByText = (host, re) => [...host.querySelectorAll(".ag-center-cols-container .ag-row .ag-cell")]
  .find((c) => re.test(c.textContent || ""));
const openPopup = () => {
  const el = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop() || null;
  return el && el.style.opacity !== "0" ? el : null;
};
const click = async (el, x = 200, y = 300) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    await new Promise((r) => setTimeout(r, 60));
  });
};

describe("TasksGrid — поповер не перерисовывает таблицу", () => {
  it("открытие и закрытие поповера не вызывает ни одного рендера грида", async () => {
    const { host } = renderGrid({
      getRowActions: () => [{ key: "edit", label: "Изменить", icon: "edit" }],
    });
    await settle();
    // базовое число рендеров после монтирования: дальше важно, что оно НЕ растёт
    const afterMount = state.gridRenders;
    expect(afterMount).toBeGreaterThan(0);

    // клик по строке — поповер открылся, грид НЕ перерисовался
    await click(cellByText(host, /Заявка ООБ/));
    expect(openPopup()).toBeTruthy();
    expect(state.gridRenders).toBe(afterMount);

    // клик по другой строке (поповер переезжает) — тоже без рендера грида
    await click(cellByText(host, /Основная задача ООБ/), 320, 400);
    expect(state.gridRenders).toBe(afterMount);

    // закрытие — снова без рендера
    await act(async () => {
      document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
      document.body.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 160));
    });
    expect(state.gridRenders).toBe(afterMount);
  });

  it("легитимные обновления всё равно доходят до грида (memo не «залипает»)", async () => {
    const { host, draw } = renderGrid({ getRowActions: () => [] });
    await settle();
    const base = state.gridRenders;

    // новые строки — грид обязан отрисовать их
    draw({ rows: [...ROWS, { compositeId: "dob:9", sourceId: "dob", Id: 9, Title: "Ещё заявка", Status: "Не начата", PercentComplete: 0 }] });
    await settle();
    expect(state.gridRenders).toBeGreaterThan(base);
    expect(host.textContent).toContain("Ещё заявка");

    // индикатор обновления (полоса прогресса) тоже пробрасывается в грид (getRowClass)
    const before = state.gridRenders;
    draw({ updatingId: 10 });
    await settle();
    expect(state.gridRenders).toBeGreaterThan(before);
  });
});
