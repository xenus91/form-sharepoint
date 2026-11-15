// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import EONumberSearch from "../EONumberSearch";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("EONumberSearch", () => {
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
          <EONumberSearch {...props} />
        </ThemeProvider>,
      );
    });
    return host.querySelector('[data-testid="eo-search-input"]');
  }

  it("выдаёт отсканированное значение сразу при вводе", () => {
    const onChange = vi.fn();
    const input = render({ value: "", onChange });
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

    act(() => {
      setter.call(input, "808117004013738272");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("808117004013738272");
  });

  it("Enter подтверждает тот же запрос, не отправляя форму браузера", () => {
    const onSubmit = vi.fn();
    const input = render({ value: "808117004013738272", onSubmit });
    const event = new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    act(() => { input.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith("808117004013738272");
  });

  it("показывает число найденных задач", () => {
    render({ value: "808117004013738272", resultCount: 3 });
    expect(host.textContent).toContain("Найдено задач: 3");
  });
});
