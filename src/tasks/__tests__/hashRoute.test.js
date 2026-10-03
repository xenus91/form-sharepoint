// src/tasks/__tests__/hashRoute.test.js
// #tasks/<n> — сначала задача с Id = n, и только потом элемент ProblemsPallet.
// Регрессия 2026-10-03: клик по строке таблицы ставил #tasks/<TaskId>, а роут
// трактовал число как Id элемента → «Связанная задача для элемента #N не найдена».

import { describe, it, expect, vi } from "vitest";
import { resolveHashTarget, findTaskByIdInList, isThuValue } from "../hashRoute";

const TASKS = [
  { Id: 10, Title: "Основная задача" },
  { Id: 688, Title: "Задача с Id 688" },
];

describe("isThuValue", () => {
  it("17–18 цифр — это ЕО/THU, обычные Id — нет", () => {
    expect(isThuValue("808117004013738272")).toBe(true);
    expect(isThuValue("12345678901234567")).toBe(true);
    expect(isThuValue("688")).toBe(false);
    expect(isThuValue(688)).toBe(false);
    expect(isThuValue("")).toBe(false);
  });
});

describe("findTaskByIdInList", () => {
  it("находит задачу по числу и по строке", () => {
    expect(findTaskByIdInList(TASKS, "688").Title).toBe("Задача с Id 688");
    expect(findTaskByIdInList(TASKS, 10).Title).toBe("Основная задача");
  });
  it("не путает с RelatedItems.ItemId", () => {
    // задача, у которой RelatedItems ссылается на элемент 688, но Id другой
    const tasks = [{ Id: 500, RelatedItems: JSON.stringify([{ ItemId: 688, ListId: "x" }]) }];
    expect(findTaskByIdInList(tasks, "688")).toBeNull();
  });
  it("нет задач / мусорный Id → null", () => {
    expect(findTaskByIdInList([], "688")).toBeNull();
    expect(findTaskByIdInList(TASKS, "abc")).toBeNull();
    expect(findTaskByIdInList(null, "688")).toBeNull();
  });
});

describe("resolveHashTarget", () => {
  it("задача есть в списке → режим task, без запроса на сервер", async () => {
    const fetchTaskById = vi.fn();
    const res = await resolveHashTarget("688", { tasks: TASKS, fetchTaskById });
    expect(res).toEqual({ task: TASKS[1], mode: "task", source: "list" });
    expect(fetchTaskById).not.toHaveBeenCalled();
  });

  it("задачи нет в списке → догружаем по Id с сервера", async () => {
    const fetched = { Id: 700, Title: "Задача из другого фильтра" };
    const fetchTaskById = vi.fn(async () => fetched);
    const res = await resolveHashTarget("700", { tasks: TASKS, fetchTaskById });
    expect(res).toEqual({ task: fetched, mode: "task", source: "fetch" });
    expect(fetchTaskById).toHaveBeenCalledWith("700");
  });

  it("задачи нет и на сервере → элементный путь (фолбэк)", async () => {
    const fetchTaskById = vi.fn(async () => null);
    const res = await resolveHashTarget("688", { tasks: [], fetchTaskById });
    expect(res).toEqual({ task: null, mode: "element" });
  });

  it("ошибка догрузки → элементный путь, без падения", async () => {
    const fetchTaskById = vi.fn(async () => { throw new Error("network"); });
    const res = await resolveHashTarget("688", { tasks: [], fetchTaskById });
    expect(res.mode).toBe("element");
  });

  it("явный элементный вид ссылки (#tasks/id=688) не ищет задачу", async () => {
    const fetchTaskById = vi.fn();
    const res = await resolveHashTarget("688", { tasks: TASKS, fetchTaskById, kind: "element" });
    expect(res).toEqual({ task: null, mode: "element" });
    expect(fetchTaskById).not.toHaveBeenCalled();
  });

  it("THU сразу идёт в элементный путь (поиск по ЕО)", async () => {
    const fetchTaskById = vi.fn();
    const res = await resolveHashTarget("808117004013738272", { tasks: TASKS, fetchTaskById });
    expect(res.mode).toBe("element");
    expect(fetchTaskById).not.toHaveBeenCalled();
  });

  it("пустой id → ничего не открываем", async () => {
    expect(await resolveHashTarget("", { tasks: TASKS })).toEqual({ task: null, mode: null });
  });
});
