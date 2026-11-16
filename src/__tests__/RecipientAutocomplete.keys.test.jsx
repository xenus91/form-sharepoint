// @vitest-environment jsdom
// src/__tests__/RecipientAutocomplete.keys.test.jsx
//
// MUI 6.1.1 ключует опции автокомплита так:
//   key: getOptionKey?.(option) ?? getOptionLabel(option)
// (useAutocomplete.js, getOptionProps). getOptionKey в компоненте не задан,
// поэтому ключом становился getOptionLabel — то есть SCNumber. В SCList
// встречаются разные элементы с одинаковым номером магазина, и React падал
// с «Encountered two children with the same key».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const rows = vi.hoisted(() => ({ list: [] }));

vi.mock("../api", () => ({
  default: {
    get: async () => ({ data: { d: { results: rows.list } } }),
    defaults: { headers: {} },
  },
  normalizeNextUrl: () => null,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const RecipientAutocomplete = (await import("../RecipientAutocomplete")).default;

const item = (ID, SCNumber, Title) => ({ ID, Title, SCNumberText: String(SCNumber), SCNumber });

/** Смонтировать компонент и раскрыть список. */
async function openList() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<RecipientAutocomplete value="" onSelect={() => {}} isEOMissing={false} />);
    await new Promise((r) => setTimeout(r, 60));
  });
  const input = host.querySelector("input");
  expect(input).toBeTruthy();
  await act(async () => {
    input.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 150));
  });
  return {
    host,
    root,
    options: () => [...document.body.querySelectorAll('[role="option"]')],
    close: async () => {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

describe("RecipientAutocomplete — уникальные ключи опций", () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    // Список рендерится в портал в body: если тест упал до close(), его опции
    // остались бы в DOM и попали бы в следующий тест.
    document.body.innerHTML = "";
  });

  it("повторяющиеся номера магазинов не дают предупреждения React о ключе", async () => {
    rows.list = [
      item(11, "2503", "Магазин А"),
      item(12, "2503", "Магазин Б"),
      item(13, "929728", "Магазин В"),
      item(14, "929728", "Магазин Г"),
      item(15, "77", "Магазин Д"),
    ];

    const list = await openList();

    // Все пять строк на месте — разные элементы с одним номером не теряются.
    expect(list.options().length).toBe(5);

    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      String(args[0] || "").includes("two children with the same key"),
    );
    expect(keyWarnings).toEqual([]);

    await list.close();
  }, 30000);

  it("один и тот же Id не показывается дважды (наложение страниц пагинации)", async () => {
    rows.list = [item(11, "2503", "Магазин А"), item(11, "2503", "Магазин А"), item(15, "77", "Магазин Д")];

    const list = await openList();
    expect(list.options().length).toBe(2);
    expect(list.options().map((o) => o.textContent)).toEqual(["2503", "77"]);

    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      String(args[0] || "").includes("two children with the same key"),
    );
    expect(keyWarnings).toEqual([]);

    await list.close();
  }, 30000);
});
