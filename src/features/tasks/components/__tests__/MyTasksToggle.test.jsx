// @vitest-environment jsdom
// src/features/tasks/components/__tests__/MyTasksToggle.test.jsx
//
// Тумблер «Я исполнитель» как кнопка вкл/выкл: состояние, подпись со счётчиком,
// недоступность, когда пользователь не опознан, и переключение с клавиатуры.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import MyTasksToggle from "../MyTasksToggle";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("MyTasksToggle", () => {
  let host;
  let root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(props) {
    act(() => {
      root.render(
        <ThemeProvider theme={createTheme()}>
          <MyTasksToggle {...props} />
        </ThemeProvider>
      );
    });
    return host.querySelector('[data-testid="my-tasks-toggle"]');
  }

  const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

  it("выключен по умолчанию: aria-checked=false", () => {
    const el = render({ enabled: false, onToggle: () => {}, count: 3 });
    expect(el.getAttribute("aria-checked")).toBe("false");
    expect(el.getAttribute("role")).toBe("switch");
  });

  it("в подписи видно, сколько задач я веду", () => {
    render({ enabled: false, onToggle: () => {}, count: 7 });
    expect(host.textContent).toContain("Я исполнитель (7)");
  });

  it("без счётчика подпись без скобок", () => {
    render({ enabled: false, onToggle: () => {}, count: null });
    expect(host.textContent).toContain("Я исполнитель");
    expect(host.textContent).not.toContain("Я исполнитель (");
  });

  it("клик переключает и зовёт onToggle с новым значением", () => {
    const seen = [];
    const el = render({ enabled: false, onToggle: (v) => seen.push(v) });
    act(() => { click(el); });
    expect(seen).toEqual([true]);
  });

  it("включённый — aria-checked=true, клик выключает", () => {
    const seen = [];
    const el = render({ enabled: true, onToggle: (v) => seen.push(v) });
    expect(el.getAttribute("aria-checked")).toBe("true");
    act(() => { click(el); });
    expect(seen).toEqual([false]);
  });

  it("переключается пробелом и Enter (доступность)", () => {
    const seen = [];
    const el = render({ enabled: false, onToggle: (v) => seen.push(v) });
    act(() => { key(el, " "); });
    act(() => { key(el, "Enter"); });
    expect(seen).toEqual([true, true]);
  });

  it("пользователь не опознан — тумблер недоступен и не переключается", () => {
    const seen = [];
    const el = render({ enabled: false, onToggle: (v) => seen.push(v), disabled: true });
    expect(el.getAttribute("aria-disabled")).toBe("true");
    act(() => { click(el); });
    act(() => { key(el, " "); });
    expect(seen).toEqual([]);
  });

  it("в режиме одной задачи (#tasks/<Id>) не рисуется", () => {
    render({ enabled: false, onToggle: () => {}, isHashMode: true });
    expect(host.querySelector('[data-testid="my-tasks-toggle"]')).toBeNull();
  });
});
