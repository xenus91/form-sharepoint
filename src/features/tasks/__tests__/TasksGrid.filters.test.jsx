// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.filters.test.jsx
//
// Фильтр «Я исполнитель» рядом со строкой поиска.
//
// Требование 2026-10-10: фильтр показывает ТОЛЬКО задачи, которые я ВЕДУ —
// у меня в работе или завершены мной. Раньше он сверял «Кому назначено»
// (AssignedToId), из-за чего показывал и задачи, которые на меня только
// назначены (ещё не взяты), и задачи, которые взял кто-то другой.
//
// Кто взял задачу — узнаём по Id на сайте источника / ФИО / учётной записи
// (lib/currentUserMatch.js): на разных сайтах у одного человека РАЗНЫЕ Id,
// поэтому строка сравнивается с Id ЕЁ ЖЕ источника (main → свой Id,
// dob → Id на сайте ДОБ).

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

const CURRENT_USER_TITLE = "Поршаков Сергей";

const ROWS = [
  {
    // Я взял в работу — моя.
    compositeId: "main:10",
    sourceId: "main",
    Id: 10,
    Title: "Моя задача в работе",
    Body: "Проверить паллет",
    Status: "В процессе выполнения",
    PercentComplete: 0,
    AssignedTo: "ООБ",
    AssignedToId: 33,
    EditorTitle: "Поршаков Сергей",
    EditorId: 207,
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    // Назначена на меня, но НИКТО ещё не взял → не моя (нет исполнителя).
    compositeId: "main:11",
    sourceId: "main",
    Id: 11,
    Title: "Назначена на меня, не начата",
    Body: "Проверить ячейку",
    Status: "Не начата",
    PercentComplete: 0,
    AssignedTo: "Поршаков Сергей",
    AssignedToId: 207,
    EditorTitle: "",
    EditorId: null,
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    // Завершена мной — моя.
    compositeId: "main:12",
    sourceId: "main",
    Id: 12,
    Title: "Завершена мной",
    Body: "ЕО найдена",
    Status: "Завершена",
    PercentComplete: 1,
    AssignedTo: "ООБ",
    AssignedToId: 33,
    EditorTitle: "Поршаков Сергей",
    EditorId: 207,
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    // В работе, но взял ДРУГОЙ (и назначена на меня) → не моя.
    compositeId: "main:13",
    sourceId: "main",
    Id: 13,
    Title: "В работе у другого",
    Body: "Проверить линию",
    Status: "В процессе выполнения",
    PercentComplete: 0,
    AssignedTo: "Поршаков Сергей",
    AssignedToId: 207,
    EditorTitle: "Иванов Иван",
    EditorId: 305,
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    // Задача сайта ДОБ, которую я взял: на сайте ДОБ у меня ДРУГОЙ Id (42).
    compositeId: "dob:1",
    sourceId: "dob",
    Id: 1,
    Title: "Моя заявка ООБ",
    Body: "Просмотр видеоархива",
    Status: "В работе",
    PercentComplete: 0,
    AssignedTo: "ООБ",
    AssignedToId: { results: [7] },
    Editor: { Id: 42, Title: "Поршаков Сергей" },
    EditorTitle: "Поршаков Сергей",
    Modified: "2026-10-03T00:29:42Z",
  },
  {
    // Задача сайта ДОБ, которую взял другой сотрудник.
    compositeId: "dob:2",
    sourceId: "dob",
    Id: 2,
    Title: "Заявка ООБ в работе у другого",
    Body: "Просмотр видеоархива",
    Status: "В работе",
    PercentComplete: 0,
    AssignedTo: "ООБ",
    AssignedToId: { results: [7] },
    Editor: { Id: 99, Title: "Петров Пётр" },
    EditorTitle: "Петров Пётр",
    Modified: "2026-10-03T00:29:42Z",
  },
];

const CURRENT_USER_IDS = { main: 207, dob: 42 };

/** Задачи, которые фильтр обязан оставить (см. ROWS). */
const MINE = ["Завершена мной", "Моя задача в работе", "Моя заявка ООБ"];

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
        <TasksGrid
          rows={ROWS}
          currentUserIds={CURRENT_USER_IDS}
          currentUserTitle={CURRENT_USER_TITLE}
          {...props}
        />
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
    expect(rowTitles(host)).toHaveLength(ROWS.length);
  });

  it("оставляет только задачи, которые у меня в работе или завершены мной", async () => {
    const { host } = renderGrid();
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    expect(onlyMineButton(host).getAttribute("aria-pressed")).toBe("true");
    expect(rowTitles(host).sort()).toEqual(MINE);
  });

  it("не показывает задачи, которые только назначены на меня (никто не взял)", async () => {
    const { host } = renderGrid();
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    const titles = rowTitles(host);
    expect(titles).not.toContain("Назначена на меня, не начата");
    // назначена на меня, но работает другой — тоже не моя
    expect(titles).not.toContain("В работе у другого");
    expect(titles).not.toContain("Заявка ООБ в работе у другого");
  });

  it("сравнивает взявшего с Id пользователя на сайте источника", async () => {
    // Если сверять всё с main-Id (207), заявка ДОБ с dob-Id 42 пропала бы.
    // ФИО не передаём: проверяем именно сверку по Id источника.
    const { host } = renderGrid({ currentUserIds: { main: 999, dob: 42 }, currentUserTitle: "" });
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    expect(rowTitles(host)).toEqual(["Моя заявка ООБ"]);
  });

  it("узнаёт свою задачу по ФИО, если Id взявшего не приехал", async () => {
    // Editor часто приходит только строкой (внешние источники, старый кэш).
    const { host } = renderGrid({
      currentUserIds: { main: 999, dob: 999 },
      currentUserTitle: "Поршаков Сергей Александрович",
    });
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    const titles = rowTitles(host).sort();
    expect(titles).toContain("Моя задача в работе");
    expect(titles).toContain("Завершена мной");
    expect(titles).not.toContain("В работе у другого");
  });

  it("второй клик фильтр снимает", async () => {
    const { host } = renderGrid();
    await settle(250);
    await click(onlyMineButton(host));
    await settle(200);
    await click(onlyMineButton(host));
    await settle(200);
    expect(onlyMineButton(host).getAttribute("aria-pressed")).toBe("false");
    expect(rowTitles(host)).toHaveLength(ROWS.length);
  });

  it("без данных о пользователе кнопка недоступна, а не «молча ноль строк»", async () => {
    const { host } = renderGrid({ currentUserIds: null, currentUserTitle: "" });
    await settle(250);
    expect(onlyMineButton(host).disabled).toBe(true);
    expect(rowTitles(host)).toHaveLength(ROWS.length);
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
