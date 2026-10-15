// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.headers.test.jsx
//
// Требование 2026-10-15: в таблице #dob_requests названия колонок берём из
// Description поля, а не из Title. Если Description пустое — откат на Title
// (иначе шапка осталась бы пустой). Сущности в описании показываем символами
// (&#58; → «:»), признак обязательности « *» сохраняем.

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
  // Description есть — шапка из него
  { InternalName: "Title", Title: "Название", Description: "Тема заявки", TypeAsString: "Text" },
  // Description с сущностью + обязательное поле
  {
    InternalName: "Status",
    Title: "StatusInternal",
    Description: "Стадия&#58; обработка",
    TypeAsString: "Choice",
    Required: true,
    Choices: { results: ["Открыт", "Закрыт"] },
  },
  // Description пустое — остаётся Title
  { InternalName: "Comment", Title: "Комментарий", Description: "   ", TypeAsString: "Text" },
];

const ROWS = [
  { ID: 1, Title: "Заявка 1", Status: "Открыт", PercentComplete: 0, Comment: "текст" },
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
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  return { host, root };
}

const headerTexts = (host) => Array.from(host.querySelectorAll(".ag-header-cell-text"))
  .map((n) => String(n.textContent || "").trim())
  .filter(Boolean);

describe("DobGrid — шапки колонок #dob_requests берутся из Description", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("заголовок — из Description поля", async () => {
    const { host } = await renderGrid();
    const headers = headerTexts(host);
    expect(headers).toContain("Тема заявки");
    // Title поля в шапку не попадает
    expect(headers.some((h) => h === "Название")).toBe(false);
  });

  it("пустое Description — откат на Title", async () => {
    const { host } = await renderGrid();
    expect(headerTexts(host)).toContain("Комментарий");
  });

  it("сущности в Description показываются символами, обязательность сохраняется", async () => {
    const { host } = await renderGrid();
    const headers = headerTexts(host);
    expect(headers).toContain("Стадия: обработка *");
    expect(headers.some((h) => h.includes("&#58;"))).toBe(false);
    expect(headers.some((h) => h.includes("StatusInternal"))).toBe(false);
  });
});
