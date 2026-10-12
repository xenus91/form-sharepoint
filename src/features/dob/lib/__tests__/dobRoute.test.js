// src/features/dob/lib/__tests__/dobRoute.test.js
// Роут #dob_tasks переименован в #dob_requests; старые ссылки обязаны работать.

import { describe, it, expect } from "vitest";
import {
  buildDobItemHash,
  buildDobCreateHash,
  parseDobHash,
  isLegacyDobHash,
  toRequestsHash,
} from "../dobRoute";

describe("dobRoute — #dob_requests", () => {
  it("строит ссылки раздела", () => {
    expect(buildDobItemHash(881)).toBe("#dob_requests/881");
    expect(buildDobItemHash(13, "463B634E-A71A-4FEF-9A1F-B803431D8639"))
      .toBe("#dob_requests/13?list=463b634e-a71a-4fef-9a1f-b803431d8639");
    expect(buildDobCreateHash()).toBe("#dob_requests/new");
  });

  it("разбирает новый роут: список, создание, форма", () => {
    expect(parseDobHash("#dob_requests")).toMatchObject({ isDob: true, mode: "list", id: null });
    expect(parseDobHash("#dob_requests/new")).toMatchObject({ mode: "create", id: null });
    expect(parseDobHash("#dob_requests/881")).toMatchObject({ mode: "edit", id: 881 });
    expect(parseDobHash("#dob_requests/13?list=463B634E-A71A-4FEF-9A1F-B803431D8639"))
      .toMatchObject({ mode: "edit", id: 13, listGuid: "463b634e-a71a-4fef-9a1f-b803431d8639" });
  });

  it("старый роут #dob_tasks понимается так же (обратная совместимость)", () => {
    expect(parseDobHash("#dob_tasks")).toMatchObject({ isDob: true, mode: "list" });
    expect(parseDobHash("#dob_tasks/9723")).toMatchObject({ mode: "edit", id: 9723 });
    expect(parseDobHash("#dob_tasks/1?list=03fc1b92-baff-44dc-b8a3-d04acbe329d3"))
      .toMatchObject({ mode: "edit", id: 1, listGuid: "03fc1b92-baff-44dc-b8a3-d04acbe329d3" });
    expect(parseDobHash("#dob/10")).toMatchObject({ mode: "edit", id: 10 });
  });

  it("не принимает за раздел чужие hash'и", () => {
    expect(parseDobHash("#tasks/10").isDob).toBe(false);
    expect(parseDobHash("").isDob).toBe(false);
  });

  it("редирект со старого адреса сохраняет id и list", () => {
    expect(isLegacyDobHash("#dob_tasks/12?list=abc")).toBe(true);
    expect(isLegacyDobHash("#dob_requests/12")).toBe(false);
    expect(toRequestsHash("#dob_tasks/12?list=463b634e")).toBe("#dob_requests/12?list=463b634e");
    expect(toRequestsHash("#dob_tasks")).toBe("#dob_requests");
    expect(toRequestsHash("#dob_requests/12")).toBe("#dob_requests/12");
  });
});
