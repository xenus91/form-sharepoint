// src/tasks/__tests__/hashRoute.test.js
// #tasks/<n> — сначала задача с Id = n, и только потом элемент ProblemsPallet.
// Регрессия 2026-10-03: клик по строке таблицы ставил #tasks/<TaskId>, а роут
// трактовал число как Id элемента → «Связанная задача для элемента #N не найдена».

import { describe, it, expect } from "vitest";
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
  // Id из #tasks/<n> — это Id элемента ProblemsPallet. Догрузки задачи по Id
  // больше нет: на элементной ссылке items(<n>) всегда отдавал 404.
  it("id уже есть в загруженном списке → режим task, локально и без запроса", async () => {
    const res = await resolveHashTarget("688", { tasks: TASKS });
    expect(res).toEqual({ task: TASKS[1], mode: "task", source: "list" });
  });

  it("id нет в списке → элементный путь (GetItems по RelatedItems)", async () => {
    expect(await resolveHashTarget("25393", { tasks: TASKS })).toEqual({ task: null, mode: "element" });
  });

  it("пустой список → элементный путь", async () => {
    expect(await resolveHashTarget("688", { tasks: [] })).toEqual({ task: null, mode: "element" });
  });

  it("явный элементный вид ссылки не ищет задачу даже если Id есть в списке", async () => {
    const res = await resolveHashTarget("688", { tasks: TASKS, kind: "element" });
    expect(res).toEqual({ task: null, mode: "element" });
  });

  it("THU сразу идёт в элементный путь (поиск по ЕО)", async () => {
    expect((await resolveHashTarget("808117004013738272", { tasks: TASKS })).mode).toBe("element");
  });

  it("пустой id → ничего не открываем", async () => {
    expect(await resolveHashTarget("", { tasks: TASKS })).toEqual({ task: null, mode: null });
  });
});
