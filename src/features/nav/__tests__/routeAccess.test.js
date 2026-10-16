// src/features/nav/__tests__/routeAccess.test.js
// vitest тесты для routeAccess.js (см. план, этап 10).

import { describe, it, expect, beforeEach } from "vitest";
import { normalizeDepartment, matchDepartment, resolveRouteAccess } from "../routeAccess";

describe("routeAccess.js", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.removeItem("department.override");
  });

  describe("normalizeDepartment", () => {
    it("lower-case, схлопывание пробелов", () => {
      expect(normalizeDepartment("  ABC   ODD  ")).toBe("abc odd");
    });
    it("NBSP → space", () => {
      expect(normalizeDepartment("А\u00A0Б")).toBe("а б");
    });
    it("ё → е", () => {
      expect(normalizeDepartment("Ёлка")).toBe("елка");
    });
    it("пустое значение → ''", () => {
      expect(normalizeDepartment(null)).toBe("");
      expect(normalizeDepartment(undefined)).toBe("");
      expect(normalizeDepartment("")).toBe("");
    });
  });

  describe("matchDepartment", () => {
    it("точное совпадение для ООБ", () => {
      expect(matchDepartment("Отдел обеспечения бизнеса")).toBe(true);
      expect(matchDepartment("отдел обеспечения бизнеса")).toBe(true);
    });
    it("учитывает ё/е", () => {
      // «Отдёл …» — заглавная Ё/ё в начале слова
      expect(matchDepartment("Отдел обеспечения бизнеса".replace("е", "ё"))).toBe(true);
      // «обёспечения» — ё внутри слова
      expect(matchDepartment("Отдел обеспечения бизнеса".replace("обеспечения", "обёспечения"))).toBe(true);
    });
    it("не матчит другие подразделения", () => {
      expect(matchDepartment("Группа отгрузки РЦ")).toBe(false);
      expect(matchDepartment("Главный офис")).toBe(false);
    });
    it("пустое значение → false", () => {
      expect(matchDepartment("")).toBe(false);
      expect(matchDepartment(null)).toBe(false);
    });
  });

  describe("resolveRouteAccess", () => {
    it("match → isOOB=true", () => {
      expect(resolveRouteAccess({ department: "Отдел обеспечения бизнеса" })).toEqual({
        isOOB: true,
        reason: "department-match",
      });
    });
    it("no match → isOOB=false", () => {
      expect(resolveRouteAccess({ department: "Что-то" })).toEqual({
        isOOB: false,
        reason: "no-match",
      });
    });
    it("нет department → no-department", () => {
      expect(resolveRouteAccess({})).toEqual({
        isOOB: false,
        reason: "no-department",
      });
    });
    it("override oob форсит true", () => {
      expect(resolveRouteAccess({ department: "Группа", departmentOverride: "oob" })).toEqual({
        isOOB: true,
        reason: "override-oob",
      });
    });
    it("override off форсит false", () => {
      expect(resolveRouteAccess({ department: "Отдел обеспечения бизнеса", departmentOverride: "off" })).toEqual({
        isOOB: false,
        reason: "override-off",
      });
    });
  });
});