// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.filters.test.jsx
//
// Фильтр «Я исполнитель» рядом со строкой поиска.
//
// Зачем: в таблице задач пользователь видит и свои, и чужие задачи. Кнопка
// справа от поиска оставляет только те, где он в «Кому назначено».
// Важная деталь: Id пользователя РАЗНЫЙ на разных сайтах, поэтому строка
// сравнивается с Id ЕЁ ЖЕ источника (main → свой Id, dob → Id на сайте ДОБ).

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

const ROWS = [
  {
    compositeId: "main:10",
    sourceId: "main",
    Id: 10,
    Title: "Моя основная задача",
    Body: "Проверить паллет",
    Status: "В работе",
    PercentComplete: 0,
    AssignedTo: "Поршаков Сергей",
    AssignedToId: 207,
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    compositeId: "main:11",
    sourceId: "main",
    Id: 11,
    Title: "Чужая основная задача",
    Body: "Проверить ячейку",
    Status: "Не начата",
    PercentComplete: 0,
    AssignedTo: "Иванов Иван",
    AssignedToId: 305,
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    compositeId: "dob:1",
    sourceId: "dob",
    Id: 1,
    Title: "Моя заявка ООБ",
    Body: "Просмотр видеоархива",
    Status: "Не начата",
    PercentComplete: 0,
    AssignedTo: "Поршаков Сергей",
    // На сайте ДОБ у того же человека ДРУГОЙ Id.
    AssignedToId: { results: [42] },
    Modified: "2026-10-03T00:29:42Z",
  },
];

const CURRENT_USER_IDS = { main: 207, dob: 42 };

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
        <TasksGrid rows={ROWS} currentUserIds={CURRENT_USER_IDS} {...props} />
      </ThemeProvider>,
    );
  });
  return { host, root };
}

// Ищем ВНУТРИ своего host: предыдущие рендеры остаются в document.body
// (jsdom + MUI-порталы), поэтому глобальный поиск брал бы чужую кнопку.
const onlyMineButton = (host) => host.querySelector('[data-testid="tasks-grid-only-mine"]');
const rowTitles = (host) => [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .map((r) => r.querySelector('[col-id="Title"]')?.textContent?.trim())
  .filter(Boolean);

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 200));
  });
};

describe("TasksGrid — фильтр «Я исполнитель»", () => {
  it("кнопка есть рядом с полем поиска", async () => {
    const { host } = renderGrid();
    await settle(250);
    expect(onlyMineButton(host)).toBeTruthy();
    // и сама строка поиска на месте
    expect(host.querySelector('[data-testid="tasks-grid-search"]')).toBeTruthy();
  });

  it("по умолчанию выключен: видны все строки", async () => {
    const { host } = renderGrid();
    await settle(250);
    expect(onlyMineButton(host).getAttribute("aria-pressed")).toBe("false");
    expect(rowTitles(host).sort()).toEqual([
      "Моя заявка ООБ",
      "Моя основная задача",
      "Чужая основная задача",
    ]);
  });

  it("включается кликом и оставляет только мои задачи (включая другой сайт)", async () => {
    const { host } = renderGrid();
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    expect(onlyMineButton(host).getAttribute("aria-pressed")).toBe("true");
    const titles = rowTitles(host).sort();
    expect(titles).toEqual(["Моя заявка ООБ", "Моя основная задача"]);
    expect(titles).not.toContain("Чужая основная задача");
  });

  it("сравнивает AssignedToId с Id пользователя на сайте источника", async () => {
    // Если сверять всё с main-Id (207), заявка ДОБ с dob-Id 42 пропала бы.
    const { host } = renderGrid({ currentUserIds: { main: 999, dob: 42 } });
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    expect(rowTitles(host)).toEqual(["Моя заявка ООБ"]);
  });

  it("второй клик фильтр снимает", async () => {
    const { host } = renderGrid();
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    await click(onlyMineButton(host));
    await settle(200);
    expect(onlyMineButton(host).getAttribute("aria-pressed")).toBe("false");
    expect(rowTitles(host).length).toBe(3);
  });

  it("без Id пользователя кнопка недоступна, а не «молча ноль строк»", async () => {
    const { host } = renderGrid({ currentUserIds: null });
    await settle(250);
    expect(onlyMineButton(host).disabled).toBe(true);
    expect(rowTitles(host).length).toBe(3);
  });

  it("поиск работает вместе с фильтром", async () => {
    const { host } = renderGrid();
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    const search = host.querySelector('[data-testid="tasks-grid-search"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(search, "заявка");
      search.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
    await settle(200);
    expect(rowTitles(host)).toEqual(["Моя заявка ООБ"]);
  });
});
