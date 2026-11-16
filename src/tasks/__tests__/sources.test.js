// @vitest-environment jsdom
// src/tasks/__tests__/sources.test.js
// vitest тесты для sources.js.
//
// Источник задач один — список Tasks на этом сайте: заявки и задачи ДОБ вынесены
// в отдельное приложение на своём сайте (2026-10-16).

import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_TASK_SOURCES, getTaskSources, getSourceById, resolveSourceListApi } from "../sources";

describe("sources.js", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.removeItem("tasks.sources");
  });

  it("дефолт содержит только источник main", () => {
    const src = getTaskSources();
    expect(src.map((s) => s.id)).toEqual(["main"]);
    // Никаких кросс-сайтовых источников: приложение работает со своим сайтом.
    expect(src.every((s) => s.clientKind === "main")).toBe(true);
  });

  it("main enabled=true", () => {
    expect(getTaskSources().find((s) => s.id === "main").enabled).toBe(true);
  });

  it("getSourceById возвращает корректный источник", () => {
    expect(getSourceById("main")?.clientKind).toBe("main");
    expect(getSourceById("dob")).toBeNull();
    expect(getSourceById("unknown")).toBeNull();
  });

  it("override из localStorage мёржится поверх дефолта", () => {
    localStorage.setItem("tasks.sources", JSON.stringify({ main: { enabled: false } }));
    expect(getTaskSources().find((s) => s.id === "main").enabled).toBe(false);
  });

  it("resolveSourceListApi возвращает готовую строку для main", async () => {
    const main = DEFAULT_TASK_SOURCES.find((s) => s.id === "main");
    const api = await resolveSourceListApi(main);
    expect(api).toMatch(/^\/web\/lists\(guid'[A-F0-9-]+'\)$/);
  });

  it("main имеет listGuid, listApi и listTitle", () => {
    const main = getSourceById("main");
    expect(main.listGuid).toBeTruthy();
    expect(main.listTitle).toBe("Tasks");
    expect(main.listApi).toBe(`/web/lists(guid'${main.listGuid}')`);
  });

  it("listApi источника — путь ОТНОСИТЕЛЬНО api-base (без origin)", () => {
    const main = getSourceById("main");
    expect(main.listApi.startsWith("/web/lists")).toBe(true);
    expect(main.listApi).not.toContain("http");
    expect(main.listApi).not.toContain("/dob-api");
  });
});
