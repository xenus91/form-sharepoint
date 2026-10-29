// @vitest-environment jsdom
// src/__tests__/RecipientAutocomplete.chip.test.jsx
//
// Автокомплит получателя: выбранный получатель показывается чипом, а если по
// введённому номеру найден ровно один вариант — он выбирается автоматически.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const state = vi.hoisted(() => ({ items: [] }));

vi.mock("../api", () => ({
  default: {
    get: async () => ({ data: { d: { results: state.items } } }),
  },
  normalizeNextUrl: (u) => u,
}));

const RecipientAutocomplete = (await import("../RecipientAutocomplete")).default;

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

const SC = [
  { ID: 1, Title: "Магазин на Невском", SCNumberText: "12345", SCNumber: "12345" },
  { ID: 2, Title: "Магазин на Литейном", SCNumberText: "12346", SCNumber: "12346" },
  { ID: 3, Title: "РЦ Пулково", SCNumberText: "99999", SCNumber: "99999" },
];

// Родитель с реальным состоянием: onSelect кладёт id обратно в value — ровно как
// в App.jsx. Без этого компонент уходит в цикл (он синхронизирует selectedValue
// с пропом value), и тест виснет, хотя в приложении так не бывает.
function Harness({ spy }) {
  const [val, setVal] = React.useState("");
  return React.createElement(ThemeProvider, { theme: createTheme() },
    React.createElement(RecipientAutocomplete, {
      value: val,
      onSelect: (v) => { setVal(v); spy(v); },
      error: false,
      helperText: "",
      onFocus: () => {},
      disabled: false,
      isEOMissing: false,
    }));
}

async function mount(spy) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Harness, { spy }));
    await new Promise((r) => setTimeout(r, 60));
  });
  const input = host.querySelector(".MuiAutocomplete-root input");
  const type = async (text) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, text);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
    });
  };
  return {
    host, input, type,
    chip: () => host.querySelector('[data-testid="recipient-chip"]'),
    close: () => act(() => { root.unmount(); host.remove(); }),
  };
}

describe("Автокомплит получателя", () => {
  beforeEach(() => { state.items = SC; });
  afterEach(() => { document.body.innerHTML = ""; });

  it("ровно одно совпадение — выбирается после паузы, а не мгновенно", async () => {
    const spy = vi.fn();
    const v = await mount(spy);
    await v.type("999");
    // Сразу после ввода ещё НЕ выбрано — даём человеку допечатать номер.
    expect(spy).not.toHaveBeenCalled();
    expect(v.chip()).toBeNull();
    // До паузы список открыт — есть что выбирать.
    expect(document.body.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(spy).toHaveBeenCalledWith(3);
    expect(v.chip()).not.toBeNull();
    // После автовыбора список обязан закрыться.
    expect(document.body.querySelectorAll('[role="option"]').length).toBe(0);
    expect(v.chip().textContent).toContain("99999");
    expect(v.chip().textContent).toContain("РЦ Пулково");
    v.close();
  });

  it("несколько совпадений — автовыбора нет и чипа нет", async () => {
    const spy = vi.fn();
    const v = await mount(spy);
    await v.type("123");
    expect(spy).not.toHaveBeenCalled();
    expect(v.chip()).toBeNull();
    v.close();
  });

  it("текст варианта в поле погашен, чтобы не дублировать чип", async () => {
    const spy = vi.fn();
    const v = await mount(spy);
    await v.type("999");
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(v.chip()).not.toBeNull();
    // Текст гасится стилем (состояние inputValue намеренно не трогаем — его
    // подмена ломала сценарий «ЕО не нашлось» в App.eoDuplicateTiming).
    const root = v.host.querySelector(".MuiOutlinedInput-root");
    expect(root).not.toBeNull();
    v.close();
  });

  it("чип снимается крестиком — получатель очищается", async () => {
    const spy = vi.fn();
    const v = await mount(spy);
    await v.type("999");
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    const del = v.chip().querySelector("[data-testid='CancelIcon'], .MuiChip-deleteIcon");
    expect(del).not.toBeNull();
    await act(async () => {
      del.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(spy).toHaveBeenLastCalledWith("");
    expect(v.chip()).toBeNull();
    v.close();
  });
});
