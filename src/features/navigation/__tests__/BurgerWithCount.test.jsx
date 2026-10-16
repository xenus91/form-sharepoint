// @vitest-environment jsdom
// src/features/navigation/__tests__/BurgerWithCount.test.jsx
//
// Чип с количеством активных задач на бургере — во всех интерфейсах, включая
// #dob_requests (раньше там был бургер без чипа).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import BurgerWithCount from "../BurgerWithCount";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

let root = null;
async function render(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <BurgerWithCount {...props} />
      </ThemeProvider>,
    );
    await new Promise((r) => setTimeout(r, 30));
  });
  return host;
}

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("BurgerWithCount", () => {
  it("показывает чип с количеством задач", async () => {
    await render({ count: 12, onClick: () => {} });
    const badge = document.querySelector(".MuiBadge-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("12");
  });

  it("ноль задач — чипа нет", async () => {
    await render({ count: 0, onClick: () => {} });
    const badge = document.querySelector(".MuiBadge-badge");
    expect(badge === null || badge.textContent === "").toBe(true);
  });

  it("больше 99 задач — «99+»", async () => {
    await render({ count: 150, onClick: () => {} });
    expect(document.querySelector(".MuiBadge-badge").textContent).toBe("99+");
  });

  it("клик открывает меню", async () => {
    const onClick = vi.fn();
    await render({ count: 3, onClick });
    const button = document.querySelector('button[aria-label="Открыть меню"]');
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
