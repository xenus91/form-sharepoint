// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.choiceObject.test.jsx
//
// В таблице #dob_requests у колонок «выбор» встречалось «[object Object]»:
// SharePoint отдаёт MultiChoice коллекцией, а элементы коллекции — объектами
// {Value}; одиночный выбор тоже может прийти объектом. Без форматтера AG Grid
// просто вызывает String(value).

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
  {
    InternalName: "Status", Title: "Статус", TypeAsString: "Choice",
    Choices: { results: ["Годен", "Брак"] },
  },
  {
    InternalName: "ErrorTypes", Title: "Виды ошибок", TypeAsString: "MultiChoice",
    Choices: { results: ["Приёмка", "Отгрузка"] },
  },
];

const ROWS = [
  {
    ID: 1,
    Title: "Заявка 1",
    // одиночный выбор объектом
    Status: { Value: "Годен" },
    // MultiChoice — коллекция объектов {Value}
    ErrorTypes: {
      __metadata: { type: "Collection(Edm.String)" },
      results: [{ Value: "Приёмка" }, { Value: "Отгрузка" }],
    },
  },
  { ID: 2, Title: "Заявка 2", Status: "Брак", ErrorTypes: ["Приёмка"] },
];

async function renderGrid() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <DobListStateProvider fields={FIELDS} rows={ROWS}>
        <DobGrid fields={FIELDS} rows={ROWS} />
      </DobListStateProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  return { host, root };
}

const cellText = (host, rowId, colId) => {
  const cell = host.querySelector(`[row-id="${rowId}"] [col-id="${colId}"]`);
  return cell ? String(cell.textContent || "").trim() : null;
};

describe("DobGrid — «выбор» без «[object Object]»", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("одиночный выбор объектом {Value} показывается текстом", async () => {
    const { host } = await renderGrid();
    expect(cellText(host, 1, "Status")).toBe("Годен");
  });

  it("MultiChoice коллекцией объектов показывается списком", async () => {
    const { host } = await renderGrid();
    expect(cellText(host, 1, "ErrorTypes")).toBe("Приёмка; Отгрузка");
  });

  it("обычные строковые значения не ломаются", async () => {
    const { host } = await renderGrid();
    expect(cellText(host, 2, "Status")).toBe("Брак");
    expect(cellText(host, 2, "ErrorTypes")).toBe("Приёмка");
  });

  it("в таблице вообще нет «[object Object]»", async () => {
    const { host } = await renderGrid();
    expect(host.textContent).not.toContain("[object Object]");
  });
});
