// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.rowStatus.test.jsx
//
// Заливка строк таблицы задач (#tasks) по статусу — требование 2026-10-10:
//   • Не начата                 → без заливки;
//   • В процессе выполнения     → бледно-оранжевый (tasks-row-progress);
//   • Завершена                 → бледно-зелёный   (tasks-row-completed);
//   • просрочена и НЕ завершена → бледно-красный   (tasks-row-overdue).
// Сами цвета живут в src/index.css — здесь проверяем, что нужные классы
// действительно доезжают до строк AG Grid.

import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TasksGrid from "../components/TasksGrid";

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

const day = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

const ROWS = [
  { compositeId: "main:1", sourceId: "main", Id: 1, Title: "Не начата", Status: "Не начата", PercentComplete: 0, DueDate: day(3) },
  { compositeId: "main:2", sourceId: "main", Id: 2, Title: "В работе", Status: "В процессе выполнения", PercentComplete: 0, DueDate: day(3) },
  { compositeId: "main:3", sourceId: "main", Id: 3, Title: "Завершена", Status: "Завершена", PercentComplete: 1, DueDate: day(3) },
  { compositeId: "main:4", sourceId: "main", Id: 4, Title: "Просрочена", Status: "В процессе выполнения", PercentComplete: 0, DueDate: day(-2) },
];

const settle = async (ms = 250) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

function renderGrid(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <TasksGrid rows={ROWS} {...props} />
      </ThemeProvider>,
    );
  });
  return { host, root };
}

/** { "Не начата": "ag-row ...", ... } — классы строк по заголовку задачи. */
function rowClasses(host) {
  const out = {};
  for (const row of host.querySelectorAll(".ag-center-cols-container .ag-row")) {
    const title = row.querySelector('[col-id="Title"]')?.textContent?.trim();
    if (title) out[title] = row.className;
  }
  return out;
}

describe("TasksGrid — заливка строк по статусу задачи", () => {
  it("не начата — без класса, в работе/завершена/просрочена — свои классы", async () => {
    const { host } = renderGrid();
    await settle(300);
    const classes = rowClasses(host);
    expect(Object.keys(classes)).toHaveLength(4);
    expect(classes["Не начата"]).not.toContain("tasks-row-progress");
    expect(classes["Не начата"]).not.toContain("tasks-row-completed");
    expect(classes["Не начата"]).not.toContain("tasks-row-overdue");
    expect(classes["В работе"]).toContain("tasks-row-progress");
    expect(classes["Завершена"]).toContain("tasks-row-completed");
    expect(classes["Просрочена"]).toContain("tasks-row-overdue");
  });

  it("просрочка важнее «в работе»: у просроченной нет оранжевого класса", async () => {
    const { host } = renderGrid();
    await settle(300);
    expect(rowClasses(host)["Просрочена"]).not.toContain("tasks-row-progress");
  });

  it("пока по задаче идёт запись — показываем «занятость», а не статус", async () => {
    const { host } = renderGrid({ updatingId: 2 });
    await settle(300);
    const classes = rowClasses(host);
    expect(classes["В работе"]).toContain("tasks-row-busy");
    expect(classes["В работе"]).not.toContain("tasks-row-progress");
    // остальные строки остаются в своей заливке
    expect(classes["Завершена"]).toContain("tasks-row-completed");
  });

  it("колонка «Срок» рисует текст как в карточке: «Осталось …» / «Просрочено … назад»", async () => {
    const { host } = renderGrid();
    await settle(300);
    const dues = [...host.querySelectorAll(".ag-center-cols-container .ag-row")].map((r) => ({
      title: r.querySelector('[col-id="Title"]')?.textContent?.trim(),
      due: r.querySelector('[col-id="DueDate"]')?.textContent?.trim(),
    }));
    const byTitle = Object.fromEntries(dues.map((d) => [d.title, d.due]));
    // 3 дня вперёд → «Осталось 2д 23ч» (округление вниз, как в карточке)
    expect(byTitle["Не начата"]).toMatch(/^Осталось \d+д \d+ч$/);
    expect(byTitle["В работе"]).toMatch(/^Осталось \d+д \d+ч$/);
    // 2 дня назад → «Просрочено 2д 0ч назад»
    expect(byTitle["Просрочена"]).toMatch(/^Просрочено \d+д \d+ч назад$/);
  });
});
