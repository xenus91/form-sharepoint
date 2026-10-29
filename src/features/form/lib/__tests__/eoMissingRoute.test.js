// src/features/form/lib/__tests__/eoMissingRoute.test.js
//
// Роут главной формы с заранее выбранной проблемой «Не найдена».
import { describe, it, expect } from "vitest";
import { EO_MISSING_LOCATION, EO_MISSING_PROBLEM, isEoMissingRoute } from "../eoMissingRoute";

describe("isEoMissingRoute — распознавание роута", () => {
  it("#eoismissing", () => {
    expect(isEoMissingRoute("#eoismissing", "/")).toBe(true);
  });

  it("варианты написания в hash", () => {
    expect(isEoMissingRoute("#eo-is-missing", "/")).toBe(true);
    expect(isEoMissingRoute("#eo_is_missing", "/")).toBe(true);
    expect(isEoMissingRoute("#EOISMISSING", "/")).toBe(true);
  });

  it("путь /eoismissing без hash", () => {
    expect(isEoMissingRoute("", "/eoismissing")).toBe(true);
    expect(isEoMissingRoute("#form", "/eo-is-missing")).toBe(true);
  });

  it("обычные роуты не задевает", () => {
    expect(isEoMissingRoute("#form", "/")).toBe(false);
    expect(isEoMissingRoute("#tasks", "/")).toBe(false);
    expect(isEoMissingRoute("#tasks/25399", "/")).toBe(false);
    expect(isEoMissingRoute("#manager", "/sites/x/SitePages/app.aspx")).toBe(false);
    expect(isEoMissingRoute("", "/")).toBe(false);
  });

  it("пустые и кривые значения не роняют", () => {
    expect(isEoMissingRoute()).toBe(false);
    expect(isEoMissingRoute(null, null)).toBe(false);
  });

  it("константы предвыбора — та же проблема, что ставит handleChange", () => {
    expect(EO_MISSING_PROBLEM).toBe("Не найдена");
    expect(EO_MISSING_LOCATION).toBe("Не найдена в зоне отгрузки");
  });
});
