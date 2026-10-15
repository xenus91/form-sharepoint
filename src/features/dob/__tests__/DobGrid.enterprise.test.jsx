// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.enterprise.test.jsx
//
// Управление колонками и строками средствами AG Grid Enterprise: панель
// «Колонки» (показ/скрытие, порядок, закрепление, группы строк), панель
// «Фильтры» с Set-фильтром (выбор значений галочками), строка состояния со
// счётчиками и агрегатами, номера строк.

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

async function renderGrid() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <DobListStateProvider fields={FIELDS} rows={ROWS}>
        <DobGrid fields={FIELDS} rows={ROWS} initialStatusFilter={null} />
      </DobListStateProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  return { host, root };
}

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));
  });
};

// Кнопка панели — это div-обёртка с <button> внутри: слушатель висит на кнопке.
const sideButton = (host, label) => {
  const wrapper = [...host.querySelectorAll(".ag-side-button")]
    .find((b) => (b.textContent || "").includes(label));
  return wrapper?.querySelector("button") || wrapper || null;
};

const panelText = (host) => (host.querySelector(".ag-tool-panel-wrapper")?.textContent || "").replace(/\s+/g, " ");

describe("DobGrid — управление колонками и строками (AG Grid Enterprise)", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("есть панели «Колонки» и «Фильтры»", async () => {
    const { host } = await renderGrid();
    expect(sideButton(host, "Колонки")).toBeTruthy();
    expect(sideButton(host, "Фильтры")).toBeTruthy();
  });

  it("в панели «Колонки» видно группу строк — группировку настраивает пользователь", async () => {
    const { host } = await renderGrid();
    await click(sideButton(host, "Колонки"));

    const text = panelText(host);
    expect(text).toContain("Row Groups");
    // статус уже в группах — отсюда его можно убрать или добавить другое поле
    expect(text).toContain("Статус");
    expect(host.querySelector(".ag-column-select")).toBeTruthy();
  });

  it("панель «Фильтры» открывается", async () => {
    const { host } = await renderGrid();
    const btn = sideButton(host, "Фильтры");
    await click(btn);

    // Список значений Set-фильтра виртуализирован и в jsdom без реальной
    // разметки не рендерится, поэтому проверяем, что панель открылась.
    expect(host.querySelector(".ag-side-button.ag-selected")?.textContent || "").toContain("Фильтры");
    expect(host.querySelector(".ag-filter-panel, .ag-filter-toolpanel, .ag-filters-panel")).toBeTruthy();
  });

  it("у колонки есть кнопка фильтра, а стартовый фильтр — Set (значения, не текст)", async () => {
    const { host } = await renderGrid();
    expect(host.querySelector('.ag-header-cell[col-id="Status"] .ag-icon-filter')).toBeTruthy();

    // Set-фильтр принимает список значений: именно поэтому «Открыт» отбирается
    // значениями, а не подстрокой текста.
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    const root2 = createRoot(host2);
    await act(async () => {
      root2.render(
        <DobListStateProvider fields={FIELDS} rows={ROWS}>
          <DobGrid fields={FIELDS} rows={ROWS} initialStatusFilter={["Открыт"]} />
        </DobListStateProvider>,
      );
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    const text2 = (host2.textContent || "").replace(/\s+/g, " ");
    expect(text2).toContain("Первая");
    expect(text2).not.toContain("Третья");
  });

  it("строка состояния показывает счётчики строк", async () => {
    const { host } = await renderGrid();
    const bar = host.querySelector(".ag-status-bar");
    expect(bar).toBeTruthy();
    expect((bar.textContent || "").replace(/\s+/g, " ")).toContain("3");
  });

  it("есть номера строк", async () => {
    const { host } = await renderGrid();
    expect(host.querySelectorAll('[col-id="ag-Grid-RowNumbersColumn"]').length).toBeGreaterThan(0);
  });
});
