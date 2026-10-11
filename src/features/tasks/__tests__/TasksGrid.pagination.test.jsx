// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.pagination.test.jsx
//
// Пагинация в табличном представлении (требование 2026-10-11):
//   • таблица листается страницами, а не скроллится «простынёй»;
//   • размер страницы можно менять (25/50/100/200);
//   • сортировка и поиск — по ВСЕМ строкам, а не по текущей странице;
//   • вкладка «Завершённые» грузится порциями с сервера, поэтому при переходе
//     на последнюю страницу таблица просит следующую (onNeedMoreRows).

import { describe, it, expect, vi } from "vitest";
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

// 60 задач, Created растёт вместе с Id — порядок «от старых к новым» очевиден.
const ROWS = Array.from({ length: 60 }, (_, i) => ({
  compositeId: `main:${i + 1}`,
  sourceId: "main",
  Id: i + 1,
  Title: `Задача ${i + 1}`,
  Status: i % 3 === 0 ? "Завершена" : "Не начата",
  PercentComplete: i % 3 === 0 ? 1 : 0,
  Created: day(-100 + i),
  Modified: day(-100 + i),
  DueDate: day(5),
}));

async function renderGrid(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <TasksGrid rows={ROWS} {...props} />
      </ThemeProvider>,
    );
    await new Promise((r) => setTimeout(r, 400));
  });
  return host;
}

const pagerText = (host) => (host.querySelector(".ag-paging-panel")?.textContent || "").replace(/\s+/g, " ").trim();
const pagingButton = (host, label) => [...host.querySelectorAll(".ag-paging-button")]
  .find((b) => b.getAttribute("aria-label") === label);
const firstRowTitle = (host) => [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")))[0]
  ?.querySelector(".ag-cell")?.textContent?.trim() || "";

const clickPaging = async (host, label) => {
  await act(async () => {
    pagingButton(host, label).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));
  });
};

describe("TasksGrid — пагинация", () => {
  it("по умолчанию страница по 50, панель показывает диапазон и число страниц", async () => {
    const host = await renderGrid();
    const text = pagerText(host);
    expect(text).toContain("1 to 50 of 60");
    expect(text).toContain("Page 1 of 2");
    // первые/предыдущие недоступны на первой странице, следующие — доступны
    expect(pagingButton(host, "First Page").getAttribute("aria-disabled")).toBe("true");
    expect(pagingButton(host, "Next Page").getAttribute("aria-disabled")).toBe("false");
    expect(firstRowTitle(host)).toBe("Задача 1");
  });

  it("переход на следующую страницу показывает остаток, «последняя» — конец списка", async () => {
    const host = await renderGrid();
    await clickPaging(host, "Next Page");
    expect(pagerText(host)).toContain("51 to 60 of 60");
    expect(pagerText(host)).toContain("Page 2 of 2");
    expect(firstRowTitle(host)).toBe("Задача 51");
    expect(pagingButton(host, "Next Page").getAttribute("aria-disabled")).toBe("true");

    await clickPaging(host, "First Page");
    expect(pagerText(host)).toContain("1 to 50 of 60");
    expect(firstRowTitle(host)).toBe("Задача 1");
  });

  it("размер страницы задаётся пропсом", async () => {
    const host = await renderGrid({ pageSize: 25 });
    expect(pagerText(host)).toContain("1 to 25 of 60");
    expect(pagerText(host)).toContain("Page 1 of 3");
  });

  it("на последней странице просит у сервера следующую порцию (вкладка «Завершённые»)", async () => {
    const onNeedMoreRows = vi.fn();
    const host = await renderGrid({ pageSize: 25, onNeedMoreRows });
    expect(onNeedMoreRows).not.toHaveBeenCalled();
    await clickPaging(host, "Last Page");
    expect(pagerText(host)).toContain("Page 3 of 3");
    expect(onNeedMoreRows).toHaveBeenCalled();
  });
});
