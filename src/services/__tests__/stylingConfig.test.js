import { describe, it, expect } from "vitest";
import { parseStyling, resolveStylingForChoice, isGradient, resolveStylingIcon } from "../stylingConfig";

describe("stylingConfig", () => {
  describe("parseStyling", () => {
    it("returns ok with empty value for empty input", () => {
      expect(parseStyling("")).toEqual({ ok: true, value: {} });
      expect(parseStyling(null)).toEqual({ ok: true, value: {} });
      expect(parseStyling(undefined)).toEqual({ ok: true, value: {} });
    });

    it("returns error for invalid JSON", () => {
      const r = parseStyling("not json {");
      expect(r.ok).toBe(false);
      expect(r.error).toContain("invalid JSON");
    });

    it("returns error for non-object root", () => {
      expect(parseStyling("[]").ok).toBe(false);
      expect(parseStyling('"hi"').ok).toBe(false);
    });

    it("parses #643 example (Исправлено green, Не исправлено red)", () => {
      const json = '{"Исправлено":{"bg":"linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)","c":"#fff"},"Не исправлено":{"bg":"linear-gradient(180deg, #e53935 0%, #b71c1c 100%)","c":"#fff"}}';
      const r = parseStyling(json);
      expect(r.ok).toBe(true);
      expect(r.value["исправлено"].bg).toBe("linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)");
      expect(r.value["исправлено"].color).toBe("#fff");
      expect(r.value["не исправлено"].bg).toBe("linear-gradient(180deg, #e53935 0%, #b71c1c 100%)");
    });

    it("translates compact variant codes", () => {
      const r = parseStyling('{"A":{"v":"ctd"},"B":{"v":"out"},"C":{"v":"tx"}}');
      expect(r.value.a.variant).toBe("contained");
      expect(r.value.b.variant).toBe("outlined");
      expect(r.value.c.variant).toBe("text");
    });

    it("accepts full MUI variant names", () => {
      const r = parseStyling('{"A":{"v":"outlined"},"B":{"v":"contained"}}');
      expect(r.value.a.variant).toBe("outlined");
      expect(r.value.b.variant).toBe("contained");
    });

    it("ignores unknown variant codes", () => {
      const r = parseStyling('{"A":{"v":"wtf"}}');
      // Невалидный вариант → запись не создаётся вовсе (применится _default или MUI-дефолт)
      expect(r.value.a).toBeUndefined();
    });

    it("ignores unknown keys silently", () => {
      const r = parseStyling('{"A":{"bg":"#fff","unknown":"whatever","c":"#000","i":"CheckCircleIcon"}}');
      expect(r.value.a.bg).toBe("#fff");
      expect(r.value.a.color).toBe("#000");
      expect(r.value.a.icon).toBe("CheckCircleIcon");
      expect(r.value.a.unknown).toBeUndefined();
    });

    it("drops strings longer than 500 chars", () => {
      const huge = "x".repeat(501);
      const r = parseStyling(JSON.stringify({ A: { bg: huge } }));
      // Слишком длинное значение отбрасывается → запись не создаётся
      expect(r.value.a).toBeUndefined();
    });

    it("keeps strings exactly 500 chars", () => {
      const limit = "x".repeat(500);
      const r = parseStyling(JSON.stringify({ A: { bg: limit } }));
      expect(r.value.a.bg).toBe(limit);
    });

    it("skips non-object entry values", () => {
      const r = parseStyling('{"A":"string","B":{"bg":"#fff"}}');
      expect(r.value.a).toBeUndefined();
      expect(r.value.b.bg).toBe("#fff");
    });
  });

  describe("isGradient", () => {
    it("градиент и картинку нельзя класть в background-image? — наоборот: их можно", () => {
      expect(isGradient("linear-gradient(180deg,#43a047,#2e7d32)")).toBe(true);
      expect(isGradient("radial-gradient(circle, #fff, #000)")).toBe(true);
      expect(isGradient('url("/img/bg.png")')).toBe(true);
    });

    it("плоский цвет — не градиент (его нельзя подставлять в background-image)", () => {
      expect(isGradient("#43a047")).toBe(false);
      expect(isGradient("rgb(67,160,71)")).toBe(false);
      expect(isGradient("var(--brand)")).toBe(false);
    });
  });

  describe("resolveStylingIcon", () => {
    const parsed = parseStyling(
      JSON.stringify({
        _default: { i: "help" },
        "Найдена": { i: "checkcircle" },
        "Не найдена": { i: "searchoff" },
      })
    ).value;

    it("иконка по точному choice", () => {
      expect(resolveStylingIcon("Найдена", parsed)).toBe("checkcircle");
      expect(resolveStylingIcon("Не найдена", parsed)).toBe("searchoff");
    });

    it("фолбэк на _default", () => {
      expect(resolveStylingIcon("Что-то ещё", parsed)).toBe("help");
    });

    it("null, если иконок нет", () => {
      expect(resolveStylingIcon("Найдена", parseStyling(JSON.stringify({ "Найдена": { bg: "#fff" } })).value)).toBeNull();
      expect(resolveStylingIcon("Найдена", null)).toBeNull();
    });
  });

  describe("resolveStylingForChoice", () => {
    const parsed = parseStyling({
      "_default": { bg: "#ddd", color: "#000", variant: "outlined" },
      "Исправлено": { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", color: "#fff" },
      "Не исправлено": { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", color: "#fff" },
    }).value;

    it("finds exact match", () => {
      const sx = resolveStylingForChoice("Исправлено", parsed);
      expect(sx).not.toBeNull();
      expect(sx.background).toContain("#2e7d32");
      expect(sx.color).toBe("#fff");
      expect(sx.variant).toBeUndefined();
    });

    it("falls back to _default for unknown choice", () => {
      const sx = resolveStylingForChoice("Whatever", parsed);
      expect(sx.background).toBe("#ddd");
      expect(sx.color).toBe("#000");
      expect(sx.variant).toBe("outlined");
    });

    it("returns null for null parsed", () => {
      expect(resolveStylingForChoice("A", null)).toBeNull();
    });

    it("returns null for empty parsed", () => {
      expect(resolveStylingForChoice("A", {})).toBeNull();
    });

    it("returns null when choice and parsed have only _default with no styling fields", () => {
      const empty = parseStyling('{"_default":{}}').value;
      expect(resolveStylingForChoice("A", empty)).toBeNull();
    });

    it("includes hover brightness from bg", () => {
      const sx = resolveStylingForChoice("Исправлено", parsed);
      expect(sx["&:hover"]).toBeDefined();
      expect(sx["&:hover"].filter).toBe("brightness(1.1)");
    });
  });

  it('"i": false на верхнем уровне выключает иконки везде', () => {
    const text = JSON.stringify({ i: false, _default: { v: "ctd" }, "Найдена": { bg: "#2e7d32", i: "checkcircle" } });
    const parsed = parseStyling(text);
    expect(parsed.ok).toBe(true);
    expect(resolveStylingIcon("Найдена", parsed.value)).toBe(null);
    expect(resolveStylingIcon("Не найдена", parsed.value)).toBe(null);
    // стили при этом продолжают работать
    expect(resolveStylingForChoice("Найдена", parsed.value)).toMatchObject({ background: "#2e7d32" });
  });

  it('"icons": false — то же самое', () => {
    const parsed = parseStyling(JSON.stringify({ icons: false, "Найдена": { i: "checkcircle" } }));
    expect(resolveStylingIcon("Найдена", parsed.value)).toBe(null);
  });

  it('"i": "none" в записи = без иконки', () => {
    const parsed = parseStyling(JSON.stringify({ "Найдена": { bg: "#2e7d32", i: "none" } }));
    expect(resolveStylingIcon("Найдена", parsed.value)).toBe(null);
    expect(resolveStylingForChoice("Найдена", parsed.value)).toMatchObject({ background: "#2e7d32" });
  });

});