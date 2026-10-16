// src/services/__tests__/stylingIcons.test.js
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { STYLING_ICONS, renderStylingIcon } from "../stylingIcons";

describe("stylingIcons", () => {
  it("известное имя → компонент MUI-иконки", () => {
    const el = renderStylingIcon("checkcircle", createElement);
    expect(el).toBeTruthy();
    expect(typeof el.type === "function" || typeof el.type === "object").toBe(true);
  });

  it("регистр не важен", () => {
    expect(renderStylingIcon("CheckCircle", createElement).type).toBe(
      renderStylingIcon("checkcircle", createElement).type
    );
  });

  it("emoji (короткая строка) → текстовый span", () => {
    const el = renderStylingIcon("🕵️", createElement);
    expect(el.type).toBe("span");
    expect(el.props.children).toBe("🕵️");
  });

  it("неизвестное длинное имя → null (кнопка просто без иконки)", () => {
    expect(renderStylingIcon("SomeVeryLongUnknownIconName", createElement)).toBeNull();
  });

  it("пусто → null", () => {
    expect(renderStylingIcon("", createElement)).toBeNull();
    expect(renderStylingIcon(null, createElement)).toBeNull();
  });

  it("в карте есть иконки для типовых действий", () => {
    for (const name of ["checkcircle", "searchoff", "send", "cancel", "playarrow", "save"]) {
      expect(STYLING_ICONS[name], name).toBeTruthy();
    }
  });
});
