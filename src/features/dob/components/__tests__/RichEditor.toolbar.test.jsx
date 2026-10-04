// @vitest-environment jsdom
// src/features/dob/components/__tests__/RichEditor.toolbar.test.jsx
//
// Строка шаблонов над richtext-редактором: «Шаблон» и «Название нового шаблона»
// должны быть КОМПАКТНЫМИ (32 px), а не растянутыми темой приложения (там
// MuiOutlinedInput.height = 56) — иначе в форме заявки ДОБ это выглядит как
// «очень высокие инпуты для выбора и названия шаблона».
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

// Тема повторяет боевую: высота outlined-полей приложения — 56 px.
const INPUT_HEIGHT = 56;
const appTheme = createTheme({
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 28,
          height: INPUT_HEIGHT,
          "& .MuiSelect-select": { padding: "0 14px", height: "100% !important", display: "flex", alignItems: "center" },
        },
      },
    },
    MuiTextField: { defaultProps: { variant: "outlined" } },
  },
});

// CKEditor в jsdom не работает — подменяем: нам важна только строка шаблонов.
vi.mock("@ckeditor/ckeditor5-react", () => ({
  CKEditor: () => <div data-testid="ckeditor" />,
}));
vi.mock("@ckeditor/ckeditor5-build-classic", () => ({ default: {} }));

const { default: RichEditor } = await import("../RichEditor");
const { RICH_TEMPLATE_BAR_SX } = await import("../../lib/formStyles");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderEditor() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ThemeProvider theme={appTheme}>
        <RichEditor value="<p>x</p>" onChange={() => {}} onUploadImage={async () => ({})} />
      </ThemeProvider>,
    );
  });
  return { host, root };
}

/** Все CSS-правила, попавшие в документ (emotion вставляет их тегами <style>). */
function cssRules() {
  const text = [...document.querySelectorAll("style")].map(s => s.textContent || "").join("\n");
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2].replace(/\s+/g, "") });
  }
  return out;
}

describe("RichEditor — компактная строка шаблонов", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("«Шаблон» и «Название шаблона» — оба поля в строке шаблонов", () => {
    const { host } = renderEditor();
    const bar = host.querySelector('[data-testid="rich-template-bar"]');
    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain("Шаблон:");
    const roots = [...bar.querySelectorAll(".MuiInputBase-root")];
    expect(roots.length).toBe(2); // Select «Шаблон» + TextField «Название»
    expect(bar.querySelector("input")).toBeTruthy();
  });

  it("правило высоты 32px доходит до документа как правило-потомок выше темы", () => {
    renderEditor();
    const rules = cssRules().filter(
      r => r.selector.includes(".MuiInputBase-root") && r.body.includes("height:32px!important"),
    );
    // Select и TextField дают по правилу; у каждого селектор — потомок
    // (специфичность выше, чем у одиночного класса темы), поэтому инпуты
    // не могут остаться 56-пиксельными из-за порядка вставки стилей.
    expect(rules.length).toBeGreaterThanOrEqual(1);
    rules.forEach(r => expect(r.selector).toMatch(/\S\s+\.MuiInputBase-root/));
  });

  it("sx-константа держит высоту 32px и обнуляет вертикальные паддинги полей", () => {
    expect(RICH_TEMPLATE_BAR_SX["& .MuiInputBase-root"].height).toBe("32px !important");
    expect(RICH_TEMPLATE_BAR_SX["& .MuiInputBase-root"].minHeight).toBe("32px !important");
    expect(RICH_TEMPLATE_BAR_SX["& .MuiInputBase-input"].py).toBe("0 !important");
  });
});
