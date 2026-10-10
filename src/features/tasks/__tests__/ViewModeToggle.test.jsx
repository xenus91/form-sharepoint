// @vitest-environment jsdom
// src/features/tasks/__tests__/ViewModeToggle.test.jsx
//
// Переключатель «Карточки / Таблица» — ТОЛЬКО НА ДЕСКТОПЕ.
// На узком экране таблица нечитаема: горизонтальный скролл плюс popup
// действий, который не помещается в экран. Поэтому там остаются карточки,
// а переключатель скрыт полностью (CSS-брейкпоинт md = 900 px, без JS-замеров —
// чтобы не мигало при первой отрисовке).

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import ViewModeToggle from "../components/ViewModeToggle";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToggle(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(ThemeProvider, { theme: createTheme() },
        React.createElement(ViewModeToggle, { value: "cards", onChange: vi.fn(), ...props })),
    );
  });
  return { host, root };
}

describe("ViewModeToggle — только на десктопе", () => {
  it("на узких экранах (xs/sm) скрыт, от md — виден", () => {
    // Проверяем сгенерированный CSS: на маленькой ширине переключателя нет,
    // а начиная с md (900 px) он появляется.
    const { host } = renderToggle();
    const cls = [...host.querySelector(".MuiToggleButtonGroup-root").classList].find((c) => c.startsWith("css-"));
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent || "").join("\n");
    // внутри media-правила (узкий экран) класс прячется
    const hidden = new RegExp(`@media[^{]*\\{[^@]*?\\.${cls}[^}]*display:\\s*none`).test(css);
    expect(hidden).toBe(true);
    // а без media (десктоп) — display: inline-flex
    const shown = new RegExp(`\\.${cls}\\{[^}]*display:\\s*inline-flex`).test(css);
    expect(shown).toBe(true);
  });

  it("переключатель рендерится с этими sx (скрытие через CSS, а не JS-замер ширины)", () => {
    const { host } = renderToggle();
    const group = host.querySelector(".MuiToggleButtonGroup-root");
    expect(group).toBeTruthy();
    // Класс emotion из sx реально применён — значит скрытие работает и без JS.
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent || "").join("\n");
    const cls = [...group.classList].find((c) => c.startsWith("css-"));
    expect(cls).toBeTruthy();
    expect(css.includes(`.${cls}`)).toBe(true);
    // и в правилах есть media-запрос, где этот класс прячется
    const mediaBlock = css.match(new RegExp(`@media[^{]*\\{[^@]*?\\.${cls}[^}]*display:none[^}]*\\}`));
    expect(mediaBlock).toBeTruthy();
  });

  it("обе кнопки на месте: «Карточки» и «Таблица»", () => {
    const { host } = renderToggle();
    expect(host.querySelector('[data-testid="viewmode-cards"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="viewmode-table"]')).toBeTruthy();
  });

  it("клик по «Таблица» переключает режим", () => {
    const onChange = vi.fn();
    const { host } = renderToggle({ onChange });
    const tableBtn = host.querySelector('[data-testid="viewmode-table"]');
    act(() => {
      tableBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onChange).toHaveBeenCalledWith("table");
  });
});
