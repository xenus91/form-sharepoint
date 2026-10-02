// src/tasks/__tests__/sources.test.js
// vitest тесты для sources.js (см. план, этап 1).
// Запускается через `npm test` (vitest) — недоступен в offline-окружении.

import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_TASK_SOURCES, getTaskSources, getSourceById, resolveSourceListApi } from "../sources";

describe("sources.js", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.removeItem("tasks.sources");
  });

  it("дефолт содержит main и dob", () => {
    const src = getTaskSources();
    expect(src.map((s) => s.id).sort()).toEqual(["dob", "main"]);
  });

  it("main enabled=true, dob enabled=false (до получения GUID)", () => {
    const src = getTaskSources();
    expect(src.find((s) => s.id === "main").enabled).toBe(true);
    expect(src.find((s) => s.id === "dob").enabled).toBe(false);
  });

  it("getSourceById возвращает корректный источник", () => {
    expect(getSourceById("main")?.clientKind).toBe("main");
    expect(getSourceById("dob")?.clientKind).toBe("dob");
    expect(getSourceById("unknown")).toBeNull();
  });

  it("override из localStorage мёржится поверх дефолта", () => {
    localStorage.setItem("tasks.sources", JSON.stringify({ dob: { enabled: true } }));
    const src = getTaskSources();
    expect(src.find((s) => s.id === "dob").enabled).toBe(true);
    expect(src.find((s) => s.id === "main").enabled).toBe(true);
  });

  it("resolveSourceListApi возвращает готовую строку для main", async () => {
    const main = DEFAULT_TASK_SOURCES.find((s) => s.id === "main");
    const api = await resolveSourceListApi(main);
    expect(api).toMatch(/^\/web\/lists\(guid'[A-F0-9-]+'\)$/);
  });

  it("listGuid vs listTitle — main имеет оба", () => {
    const main = getSourceById("main");
    expect(main.listGuid).toBeTruthy();
    expect(main.listTitle).toBe("Tasks");
    const dob = getSourceById("dob");
    expect(dob.listGuid).toBeNull(); // TODO Этап 0
    expect(dob.listTitle).toBe("RequestsTask");
  });
});