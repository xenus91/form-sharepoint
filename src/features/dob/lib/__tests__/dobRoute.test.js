// src/features/dob/lib/__tests__/dobRoute.test.js
// Два адреса — два списка:
//   заявки (Requests)              → #dob_requests[/new|/<id>]
//   задачи чужого списка (?list=)  → #dob_tasks/<id>?list=<guid>
// Старые ссылки на заявки (#dob_tasks/<id> без ?list=, #dob/<id>) работают.

import { describe, it, expect } from "vitest";
import {
  DOB_REQUESTS_HASH,
  buildDobRequestHash,
  buildDobTaskHash,
  buildDobItemHash,
  buildDobCreateHash,
  parseDobHash,
  isDobRequestList,
  isLegacyDobRequestHash,
  toRequestsHash,
} from "../dobRoute";

const MAIN_LIST = "463B634E-A71A-4FEF-9A1F-B803431D8639"; // основной Tasks
const OOB_LIST = "03fc1b92-baff-44dc-b8a3-d04acbe329d3";   // RequestsTask ООБ
const REQUESTS_LIST = "21B5B544-BD98-4B06-891F-C5A137331394"; // Requests (заявки)

describe("dobRoute — заявки на #dob_requests", () => {
  it("ссылки раздела заявок", () => {
    expect(DOB_REQUESTS_HASH).toBe("#dob_requests");
    expect(buildDobRequestHash(881)).toBe("#dob_requests/881");
    expect(buildDobCreateHash()).toBe("#dob_requests/new");
  });

  it("заявка из списка Requests — без ?list, даже если GUID передали", () => {
    expect(buildDobItemHash(881)).toBe("#dob_requests/881");
    expect(buildDobItemHash(881, REQUESTS_LIST)).toBe("#dob_requests/881");
    expect(isDobRequestList(REQUESTS_LIST)).toBe(true);
    expect(isDobRequestList(null)).toBe(true);
  });

  it("разбирает роут заявок: список, создание, форма", () => {
    expect(parseDobHash("#dob_requests")).toMatchObject({ isDob: true, mode: "list", id: null, kind: "request" });
    expect(parseDobHash("#dob_requests/new")).toMatchObject({ mode: "create", id: null, kind: "request" });
    expect(parseDobHash("#dob_requests/881")).toMatchObject({ mode: "edit", id: 881, kind: "request" });
  });
});

describe("dobRoute — задачи на #dob_tasks", () => {
  it("задача чужого списка остаётся на #dob_tasks/<id>?list=<guid>", () => {
    expect(buildDobItemHash(13, MAIN_LIST)).toBe("#dob_tasks/13?list=463b634e-a71a-4fef-9a1f-b803431d8639");
    expect(buildDobTaskHash(1, OOB_LIST)).toBe("#dob_tasks/1?list=03fc1b92-baff-44dc-b8a3-d04acbe329d3");
    expect(isDobRequestList(MAIN_LIST)).toBe(false);
  });

  it("парсер помечает такой адрес как задачу", () => {
    expect(parseDobHash("#dob_tasks/13?list=463B634E-A71A-4FEF-9A1F-B803431D8639"))
      .toMatchObject({ isDob: true, mode: "edit", id: 13, listGuid: "463b634e-a71a-4fef-9a1f-b803431d8639", kind: "task" });
  });

  it("задачную ссылку не переписывает на #dob_requests", () => {
    expect(isLegacyDobRequestHash("#dob_tasks/12?list=463b634e")).toBe(false);
    expect(toRequestsHash("#dob_tasks/12?list=463b634e")).toBe("#dob_tasks/12?list=463b634e");
  });
});

describe("dobRoute — обратная совместимость", () => {
  it("старые ссылки на заявки понимаются и переписываются", () => {
    expect(parseDobHash("#dob_tasks/9723")).toMatchObject({ mode: "edit", id: 9723, kind: "request" });
    expect(parseDobHash("#dob/10")).toMatchObject({ mode: "edit", id: 10, kind: "request" });

    expect(isLegacyDobRequestHash("#dob_tasks/12")).toBe(true);
    expect(isLegacyDobRequestHash("#dob/10")).toBe(true);
    expect(isLegacyDobRequestHash("#dob_requests/12")).toBe(false);
    expect(toRequestsHash("#dob_tasks/12")).toBe("#dob_requests/12");
    expect(toRequestsHash("#dob/10")).toBe("#dob_requests/10");
    expect(toRequestsHash("#dob_tasks")).toBe("#dob_requests");
    expect(toRequestsHash("#dob_requests/12")).toBe("#dob_requests/12");
  });

  it("не принимает за раздел чужие hash'и", () => {
    expect(parseDobHash("#tasks/10").isDob).toBe(false);
    expect(parseDobHash("").isDob).toBe(false);
  });
});
