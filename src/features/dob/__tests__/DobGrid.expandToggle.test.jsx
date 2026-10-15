// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.expandToggle.test.jsx
//
// Требование 2026-10-15: «кнопка развернуть все / свернуть все должна меняться:
// если сейчас все развернуто, то отображается кнопка [свернуть]». То есть одна
// кнопка, у которой и подпись, и действие, и иконка зависят от состояния групп.

import { describe, it, expect, beforeEach } from "vitest";
import { renderDobGrid, click, textOf } from "./helpers/dobGridHarness";

const toolbar = (host) => host.querySelector('[data-testid="dob-grid-collapse-all"], [data-testid="dob-grid-expand-all"]');

describe("DobGrid — кнопка свернуть/развернуть все", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("кнопка одна", async () => {
    const { host } = await renderDobGrid({ stateScope: "toggle_one" });
    const buttons = [
      ...host.querySelectorAll('[data-testid="dob-grid-collapse-all"], [data-testid="dob-grid-expand-all"]'),
    ];
    expect(buttons).toHaveLength(1);
  });

  it("когда все группы раскрыты — предлагается «Свернуть все»", async () => {
    // без сохранённых настроек группы раскрыты (groupDefaultExpanded = -1)
    const { host } = await renderDobGrid({ stateScope: "toggle_open" });
    expect(textOf(host)).toContain("Первая"); // строки группы видны
    expect(toolbar(host).getAttribute("data-testid")).toBe("dob-grid-collapse-all");
    expect((toolbar(host).textContent || "").trim()).toBe("Свернуть все");
  });

  it("после сворачивания кнопка меняется на «Развернуть все»", async () => {
    const { host } = await renderDobGrid({ stateScope: "toggle_switch" });
    await click(toolbar(host));
    expect(toolbar(host).getAttribute("data-testid")).toBe("dob-grid-expand-all");
    expect((toolbar(host).textContent || "").trim()).toBe("Развернуть все");
    // группы свёрнуты — строк группы не видно
    expect(textOf(host)).not.toContain("Первая");
  });

  it("и обратно: после разворачивания снова «Свернуть все»", async () => {
    const { host } = await renderDobGrid({ stateScope: "toggle_back" });
    await click(toolbar(host)); // свернуть
    await click(toolbar(host)); // развернуть
    expect(toolbar(host).getAttribute("data-testid")).toBe("dob-grid-collapse-all");
    expect((toolbar(host).textContent || "").trim()).toBe("Свернуть все");
    expect(textOf(host)).toContain("Первая");
  });
});
