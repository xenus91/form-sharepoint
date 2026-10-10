// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.defaultSort.test.jsx
//
// Требование 2026-10-10: таблица #tasks по умолчанию отсортирована «от самых
// старых к самым новым» — по ДАТЕ СОЗДАНИЯ задачи. Колонка «Срок» при этом
// показывает «Осталось/Просрочено/Решено за …» (отображение не меняем), но
// движок сортирует её по Created: иначе текст в колонке шёл бы вперемешку и
// порядок читался «как по тексту».

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
  matches: false, media: q, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const day = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

// Порядок в массиве намеренно «перемешан» — проверяем, что грид его переставит.
const ROWS = [
  { compositeId: "main:3", sourceId: "main", Id: 3, Title: "Средняя", Status: "В процессе выполнения", PercentComplete: 0, Created: day(-5), DueDate: day(9) },
  { compositeId: "main:1", sourceId: "main", Id: 1, Title: "Самая старая", Status: "Завершена", PercentComplete: 1, Created: day(-20), Modified: day(-1), DueDate: day(-2) },
  { compositeId: "main:2", sourceId: "main", Id: 2, Title: "Новая", Status: "Не начата", PercentComplete: 0, Created: day(-1), DueDate: day(3) },
  { compositeId: "main:4", sourceId: "main", Id: 4, Title: "Без даты создания", Status: "Не начата", PercentComplete: 0, Created: "", DueDate: day(2) },
];

async function renderGrid() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <TasksGrid rows={ROWS} />
      </ThemeProvider>,
    );
    await new Promise((r) => setTimeout(r, 350));
  });
  return host;
}

const titles = (host) => [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")))
  .map((r) => r.querySelector(".ag-cell")?.textContent?.trim() || "");

describe("TasksGrid — порядок по умолчанию: от старых к новым", () => {
  it("строки отсортированы по дате создания, без даты — в конце", async () => {
    const host = await renderGrid();
    expect(titles(host)).toEqual(["Самая старая", "Средняя", "Новая", "Без даты создания"]);
  });

  it("колонка «Срок» помечена как отсортированная по возрастанию", async () => {
    const host = await renderGrid();
    const header = [...host.querySelectorAll(".ag-header-cell")]
      .find((h) => /Срок/.test(h.textContent || ""));
    expect(header?.getAttribute("aria-sort")).toBe("ascending");
    // остальные колонки не отсортированы
    const status = [...host.querySelectorAll(".ag-header-cell")]
      .find((h) => /Статус/.test(h.textContent || ""));
    expect(status?.getAttribute("aria-sort") || "none").toBe("none");
  });
});
