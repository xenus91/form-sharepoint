import { describe, it, expect } from "vitest";
import { normalizeEONumberQuery, searchOpenTasksByEO } from "../eoSearch";

const EO = "808117004013738272";

const TASKS = [
  { Id: 1, Title: `Проверить ЕО ${EO}`, Status: "Не начата", PercentComplete: 0 },
  { Id: 2, THU: "808117004013738999", Status: "В процессе выполнения", PercentComplete: 0 },
  { Id: 3, Title: `Закрытая ЕО ${EO}`, Status: "Завершена", PercentComplete: 1 },
  { Id: 4, raw: { Body: "Завершённая задача с ЕО 808117004013738272" }, Status: "Не начата", PercentComplete: 0 },
  { Id: 5, Title: "Задача без ЕО", Status: "Не начата", PercentComplete: 0 },
];

describe("поиск активных задач по ЕО", () => {
  it("нормализует штрихкод, убирая пробелы и разделители", () => {
    expect(normalizeEONumberQuery("808 117-004 013738272")).toBe(EO);
  });

  it("ищет по всем открытым задачам, включая ЕО в связанных полях, но не завершённые", () => {
    expect(searchOpenTasksByEO(TASKS, EO).map((task) => task.Id)).toEqual([1, 4]);
  });

  it("сужает результаты по частичному номеру прямо во время сканирования", () => {
    expect(searchOpenTasksByEO(TASKS, "8081170040137389").map((task) => task.Id)).toEqual([2]);
  });

  it("пустой или не содержащий цифр запрос не показывает весь список", () => {
    expect(searchOpenTasksByEO(TASKS, "")).toEqual([]);
    expect(searchOpenTasksByEO(TASKS, "штрихкод")).toEqual([]);
  });

  it("без массива задач безопасно возвращает пустой список", () => {
    expect(searchOpenTasksByEO(null, EO)).toEqual([]);
  });
});
