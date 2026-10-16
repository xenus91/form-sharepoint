// src/features/tasks/__tests__/openTaskForm.test.js
// Переход из таблицы #tasks в форму редактирования: любая задача открывается
// карточкой #tasks/<Id>. Источник один, отдельных роутов для задач нет
// (заявки и задачи ДОБ — в приложении xenus91/dob-requests).

import { describe, it, expect } from "vitest";
import { buildTaskFormHash, isDialogResultTask } from "../lib/openTaskForm";
import { RESULT_CHECK_OOO_CT_ID, RESULT_CHECK_OOO_CT_FULL_ID } from "../../../tasks/contentTypeFields";

describe("buildTaskFormHash", () => {
  it("задача → #tasks/<id>", () => {
    expect(buildTaskFormHash("main:10")).toBe("#tasks/10");
  });

  it("«Результат проверки ООБ» — тот же роут, что у обычной задачи", () => {
    // Отдельной формы у типа больше нет: он rozpoётся для диалога закрытия.
    expect(buildTaskFormHash("main:13")).toBe("#tasks/13");
    expect(isDialogResultTask({ sourceId: "main", Id: 13, contentTypeId: RESULT_CHECK_OOO_CT_ID })).toBe(true);
    expect(isDialogResultTask({ Id: 13, ContentTypeId: RESULT_CHECK_OOO_CT_FULL_ID })).toBe(true);
    expect(isDialogResultTask({ Id: 8, raw: { ContentType: { Name: "Результат проверки ООБ" } } })).toBe(true);
    expect(isDialogResultTask({ sourceId: "main", Id: 10, contentTypeId: "0x0108AAAA" })).toBe(false);
  });

  it("compositeId чужого источника → null (переходить некуда)", () => {
    expect(buildTaskFormHash("dob:1")).toBeNull();
    expect(buildTaskFormHash("other:5")).toBeNull();
  });

  it("невалидный compositeId → null", () => {
    expect(buildTaskFormHash("")).toBeNull();
    expect(buildTaskFormHash("dob")).toBeNull();
    expect(buildTaskFormHash("dob:abc")).toBeNull();
    expect(buildTaskFormHash(null)).toBeNull();
  });
});
