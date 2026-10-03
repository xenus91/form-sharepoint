// @vitest-environment jsdom
// src/tasks/__tests__/sources.test.js
// vitest тесты для sources.js (см. план, этап 1).

import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_TASK_SOURCES, getTaskSources, getSourceById, resolveSourceListApi, DOB_TASKS_LIST_GUID } from "../sources";

describe("sources.js", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.removeItem("tasks.sources");
  });

  it("дефолт содержит main и dob", () => {
    const src = getTaskSources();
    expect(src.map((s) => s.id).sort()).toEqual(["dob", "main"]);
  });

  it("main enabled=true, dob enabled=true", () => {
    const src = getTaskSources();
    expect(src.find((s) => s.id === "main").enabled).toBe(true);
    expect(src.find((s) => s.id === "dob").enabled).toBe(true);
  });

  it("getSourceById возвращает корректный источник", () => {
    expect(getSourceById("main")?.clientKind).toBe("main");
    expect(getSourceById("dob")?.clientKind).toBe("dob");
    expect(getSourceById("unknown")).toBeNull();
  });

  it("override из localStorage мёржится поверх дефолта", () => {
    localStorage.setItem("tasks.sources", JSON.stringify({ dob: { enabled: false } }));
    const src = getTaskSources();
    expect(src.find((s) => s.id === "dob").enabled).toBe(false);
    expect(src.find((s) => s.id === "main").enabled).toBe(true);
  });

  it("resolveSourceListApi возвращает готовую строку для main", async () => {
    const main = DEFAULT_TASK_SOURCES.find((s) => s.id === "main");
    const api = await resolveSourceListApi(main);
    expect(api).toMatch(/^\/web\/lists\(guid'[A-F0-9-]+'\)$/);
  });

  it("main имеет listGuid и listTitle, dob — подтверждённый GUID списка RequestsTask", () => {
    const main = getSourceById("main");
    expect(main.listGuid).toBeTruthy();
    expect(main.listTitle).toBe("Tasks");

    const dob = getSourceById("dob");
    // GUID подтверждён рабочим запросом пользователя (см. ADR/доработку):
    //   /dob-api/sites/dob/doblogistic/_api/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')/items
    expect(dob.listGuid).toBe(DOB_TASKS_LIST_GUID);
    expect(dob.listGuid.toLowerCase()).toBe("03fc1b92-baff-44dc-b8a3-d04acbe329d3");
    expect(dob.listApi).toBe(`/web/lists(guid'${DOB_TASKS_LIST_GUID.toLowerCase()}')`);
    expect(dob.listTitle).toBe("RequestsTask"); // fallback-резолв, если GUID отличается
  });

  it("listApi источника — путь ОТНОСИТЕЛЬНО api-base (без /dob-api и без origin)", () => {
    const dob = getSourceById("dob");
    expect(dob.listApi.startsWith("/web/lists")).toBe(true);
    expect(dob.listApi).not.toContain("/dob-api");
    expect(dob.listApi).not.toContain("http");
  });
});
