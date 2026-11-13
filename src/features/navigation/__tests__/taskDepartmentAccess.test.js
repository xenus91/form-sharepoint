import { describe, expect, it } from "vitest";
import { canSwitchTaskDepartment } from "../taskDepartmentAccess";

describe("доступ к переключателю подразделения задач", () => {
  it("разрешает Поршакову Сергею (включая полное имя и обратный порядок)", () => {
    expect(canSwitchTaskDepartment("Поршаков Сергей")).toBe(true);
    expect(canSwitchTaskDepartment("  ПОРШАКОВ   Сергей Александрович ")).toBe(true);
    expect(canSwitchTaskDepartment("Сергей Поршаков")).toBe(true);
  });

  it("не разрешает переключатель другим пользователям", () => {
    expect(canSwitchTaskDepartment("Поршаков Дмитрий")).toBe(false);
    expect(canSwitchTaskDepartment("Иванов Сергей")).toBe(false);
    expect(canSwitchTaskDepartment("")).toBe(false);
    expect(canSwitchTaskDepartment(null)).toBe(false);
  });
});
