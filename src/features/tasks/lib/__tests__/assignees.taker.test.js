import { describe, it, expect } from "vitest";
import { parseAssignees, parseEditors, takerPrincipalIdOf } from "../assignees";

/**
 * «Исполнитель» кнопкой — как «Кому назначено» (требование 2026-10-10).
 * Список тот же, что рисует resolveTaker, только в виде записей принципала:
 * Id нужен, чтобы кнопка открывала карточку пользователя на сайте источника.
 */
describe("parseEditors — список исполнителя", () => {
  it("задачу не взяли (не начата) → исполнителя нет, хотя AssignedTo заполнен", () => {
    const task = { Status: "Не начата", AssignedTo: "1", EditorId: 207, EditorTitle: "Поршаков Сергей" };
    expect(parseAssignees(task).length).toBe(1); // «Кому назначено» заполнено
    expect(parseEditors(task)).toEqual([]);
  });

  it("в работе → исполнитель из Editor/EditorId, «Кому назначено» не подмешивается", () => {
    const task = { Status: "В процессе выполнения", AssignedTo: "1", EditorId: 207, EditorTitle: "Поршаков Сергей" };
    expect(parseEditors(task)).toEqual([{ title: "Поршаков Сергей", id: 207 }]);
    expect(parseEditors(task)[0].id).not.toBe(1);
  });

  it("завершена → исполнитель остаётся (кто закрыл)", () => {
    const task = { Status: "Завершена", PercentComplete: 1, EditorId: 207, EditorTitle: "Поршаков Сергей" };
    expect(parseEditors(task)).toEqual([{ title: "Поршаков Сергей", id: 207 }]);
  });

  it("нет ни EditorId, ни EditorTitle → пустой список (кнопка покажет «—»)", () => {
    expect(parseEditors({ Status: "В процессе выполнения" })).toEqual([]);
  });

  it("Editor — строка-Id (пришёл Id вместо ФИО) → id из строки, а не Id задачи", () => {
    const list = parseEditors({ Id: 312, Status: "В процессе выполнения", Editor: "312" });
    expect(list).toEqual([{ title: "", id: 312 }]);
  });

  it("takerPrincipalIdOf — Id на сайте источника (без EditorId — null, карточку не открываем)", () => {
    expect(takerPrincipalIdOf({ EditorId: 207, EditorTitle: "Иванов И. И." })).toBe(207);
    expect(takerPrincipalIdOf({ EditorId: 207, Editor: "207" })).toBe(207);
    expect(takerPrincipalIdOf({ Editor: "207" })).toBe(207);
    expect(takerPrincipalIdOf({ EditorTitle: "Иванов И. И." })).toBeNull();
  });
});
