// src/features/tasks/lib/__tests__/taskRowStatus.test.js
//
// Заливка строк табличного представления #tasks (требование 2026-10-10):
//   • Не начата                 → без заливки;
//   • В процессе выполнения     → бледно-оранжевый;
//   • Завершена                 → бледно-зелёный;
//   • просрочена и НЕ завершена → бледно-красный.

import { describe, it, expect } from "vitest";
import { taskRowStatus, taskRowClass, isTaskOverdue, ROW_STATUS, ROW_CLASS_BY_STATUS } from "../taskRowStatus";

const NOW = new Date("2026-10-10T12:00:00Z").getTime();
const FUTURE = "2026-10-13T12:00:00Z";
const PAST = "2026-10-08T12:00:00Z";

describe("taskRowStatus — статус строки таблицы задач", () => {
  it("«Не начата» — без заливки (класса нет)", () => {
    expect(taskRowStatus({ Status: "Не начата", DueDate: FUTURE }, NOW)).toBe(ROW_STATUS.NONE);
    expect(taskRowClass({ Status: "Не начата", DueDate: FUTURE }, NOW)).toBe("");
  });

  it("«В процессе выполнения» — в работе", () => {
    expect(taskRowStatus({ Status: "В процессе выполнения", DueDate: FUTURE }, NOW)).toBe(ROW_STATUS.PROGRESS);
    expect(taskRowClass({ Status: "В процессе выполнения", DueDate: FUTURE }, NOW)).toBe("tasks-row-progress");
    // «В работе» — та же категория (словарь статусов отличается у источников)
    expect(taskRowStatus({ Status: "В работе", DueDate: FUTURE }, NOW)).toBe(ROW_STATUS.PROGRESS);
  });

  it("«Завершена» — завершена (и по PercentComplete = 1 тоже)", () => {
    expect(taskRowStatus({ Status: "Завершена", DueDate: FUTURE }, NOW)).toBe(ROW_STATUS.COMPLETED);
    expect(taskRowClass({ Status: "Завершена", DueDate: FUTURE }, NOW)).toBe("tasks-row-completed");
    expect(taskRowStatus({ Status: "В процессе выполнения", PercentComplete: 1 }, NOW)).toBe(ROW_STATUS.COMPLETED);
  });

  it("просроченная незавершённая — важнее «в работе»", () => {
    expect(taskRowStatus({ Status: "В процессе выполнения", DueDate: PAST }, NOW)).toBe(ROW_STATUS.OVERDUE);
    expect(taskRowClass({ Status: "В процессе выполнения", DueDate: PAST }, NOW)).toBe("tasks-row-overdue");
    // и не начатая, но уже просроченная — тоже красная
    expect(taskRowStatus({ Status: "Не начата", DueDate: PAST }, NOW)).toBe(ROW_STATUS.OVERDUE);
  });

  it("просрочка не красит ЗАВЕРШЁННУЮ задачу", () => {
    expect(taskRowStatus({ Status: "Завершена", PercentComplete: 1, DueDate: PAST }, NOW)).toBe(ROW_STATUS.COMPLETED);
    expect(taskRowClass({ Status: "Завершена", PercentComplete: 1, DueDate: PAST }, NOW)).toBe("tasks-row-completed");
  });

  it("не падает на пустых/битых данных", () => {
    expect(taskRowStatus(null, NOW)).toBe(ROW_STATUS.NONE);
    expect(taskRowStatus({}, NOW)).toBe(ROW_STATUS.NONE);
    expect(taskRowClass({ Status: "В работе", DueDate: "не дата" }, NOW)).toBe("tasks-row-progress");
    expect(taskRowClass({ Status: "В работе", DueDate: null }, NOW)).toBe("tasks-row-progress");
  });

  it("isTaskOverdue: срок есть и прошёл", () => {
    expect(isTaskOverdue({ DueDate: PAST }, NOW)).toBe(true);
    expect(isTaskOverdue({ DueDate: FUTURE }, NOW)).toBe(false);
    expect(isTaskOverdue({ DueDate: null }, NOW)).toBe(false);
    expect(isTaskOverdue({}, NOW)).toBe(false);
    expect(isTaskOverdue(null, NOW)).toBe(false);
  });

  it("каждому статусу — свой класс, «нет статуса» — без класса", () => {
    expect(ROW_CLASS_BY_STATUS[ROW_STATUS.PROGRESS]).toBe("tasks-row-progress");
    expect(ROW_CLASS_BY_STATUS[ROW_STATUS.COMPLETED]).toBe("tasks-row-completed");
    expect(ROW_CLASS_BY_STATUS[ROW_STATUS.OVERDUE]).toBe("tasks-row-overdue");
    expect(ROW_CLASS_BY_STATUS[ROW_STATUS.NONE]).toBe("");
  });
});
