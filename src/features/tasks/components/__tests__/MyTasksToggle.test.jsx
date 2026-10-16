// @vitest-environment jsdom
// src/features/tasks/components/__tests__/MyTasksToggle.test.jsx
//
// Кнопка «Я исполнитель» вкл/выкл: нажатое (contained) состояние = фильтр
// применён, ненажатое (outlined) = выключен. Плюс подпись со счётчиком,
// недоступность, когда пользователь не опознан, и скрытие в #tasks/<Id>.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import MyTasksToggle from "../MyTasksToggle";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("MyTasksToggle — кнопка вкл/выкл", () => {
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

  it("это кнопка, а не ползунок", () => {
    const el = render({ enabled: false, onToggle: () => {} });
    expect(el.tagName).toBe("BUTTON");
    expect(el.getAttribute("role")).not.toBe("switch");
  });

  it("выключена: aria-pressed=false и контур (outlined)", () => {
    const el = render({ enabled: false, onToggle: () => {} });
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect(el.className).toContain("MuiButton-outlined");
    expect(el.className).not.toContain("MuiButton-contained");
  });

  it("включена: aria-pressed=true и заливка (contained) — фильтр применён", () => {
    const el = render({ enabled: true, onToggle: () => {} });
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect(el.className).toContain("MuiButton-contained");
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

  it("клик по выключенной включает", () => {
    const seen = [];
    const el = render({ enabled: false, onToggle: (v) => seen.push(v) });
    act(() => { click(el); });
    expect(seen).toEqual([true]);
  });

  it("клик по включённой выключает", () => {
    const seen = [];
    const el = render({ enabled: true, onToggle: (v) => seen.push(v) });
    act(() => { click(el); });
    expect(seen).toEqual([false]);
  });

  it("пользователь не опознан — кнопка недоступна и не переключается", () => {
    const seen = [];
    const el = render({ enabled: false, onToggle: (v) => seen.push(v), disabled: true });
    expect(el.disabled).toBe(true);
    act(() => { click(el); });
    expect(seen).toEqual([]);
  });

  it("в режиме одной задачи (#tasks/<Id>) не рисуется", () => {
    render({ enabled: false, onToggle: () => {}, isHashMode: true });
    expect(host.querySelector('[data-testid="my-tasks-toggle"]')).toBeNull();
  });
});
