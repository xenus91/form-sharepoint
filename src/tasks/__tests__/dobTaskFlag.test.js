// src/tasks/__tests__/dobTaskFlag.test.js
// Детекция «нашей» формы по bool-полю IsDobTask типа контента задачи.
//
// Пользователь добавляет поле IsDobTask (Bool) в каждый тип контента задачи и
// задаёт значение по умолчанию — у новых задач флаг уже true. Все задачи с флагом
// ведёт форма ДОБ (DobTaskEditView, #dob_tasks/<id>?list=…), независимо от имени
// и id типа контента. Историческая детекция по CT «Результат проверки ООБ»
// сохраняется (обратная совместимость, пока поле не разошлось по всем спискам).

import { describe, it, expect } from "vitest";

import {
  hasDobTaskFlag,
  isDialogRequired,
  isResultCheckTask,
  RESULT_CHECK_OOO_CT_ID,
  RESULT_CHECK_OOO_CT_NAME,
} from "../contentTypeFields";
import { buildTaskListQuery, readSelectFields } from "../listQuery";
import { mapRawTask } from "../mapping";
import { buildTaskFormHash, isDialogResultTask } from "../../features/tasks/lib/openTaskForm";
import { isDobLikeTask } from "../../features/tasks/lib/cardTasks";

const MAIN = { id: "main", listGuid: "463B634E-A71A-4FEF-9A1F-B803431D8639" };
const DOB = { id: "dob", listGuid: "03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3" };

describe("hasDobTaskFlag — значение bool-поля SharePoint", () => {
  it("true/1/«Да» и verbose-обёртки считаются флагом", () => {
    expect(hasDobTaskFlag({ IsDobTask: true })).toBe(true);
    expect(hasDobTaskFlag({ IsDobTask: 1 })).toBe(true);
    expect(hasDobTaskFlag({ IsDobTask: "Да" })).toBe(true);
    expect(hasDobTaskFlag({ IsDobTask: "true" })).toBe(true);
    expect(hasDobTaskFlag({ IsDobTask: { Value: true } })).toBe(true);
    expect(hasDobTaskFlag({ IsDobTask: { results: [true] } })).toBe(true);
    expect(hasDobTaskFlag({ OData_IsDobTask: true })).toBe(true);
  });

  it("raw-объект SharePoint тоже читается (mapping хранит raw)", () => {
    expect(hasDobTaskFlag({ Id: 1, raw: { IsDobTask: true } })).toBe(true);
    expect(hasDobTaskFlag({ Id: 1, raw: { IsDobTask: false } })).toBe(false);
  });

  it("false/0/«Нет»/пусто — не флаг", () => {
    expect(hasDobTaskFlag({ IsDobTask: false })).toBe(false);
    expect(hasDobTaskFlag({ IsDobTask: 0 })).toBe(false);
    expect(hasDobTaskFlag({ IsDobTask: "Нет" })).toBe(false);
    expect(hasDobTaskFlag({ IsDobTask: "" })).toBe(false);
    expect(hasDobTaskFlag({ IsDobTask: { results: [] } })).toBe(false);
    expect(hasDobTaskFlag({})).toBe(false);
    expect(hasDobTaskFlag(null)).toBe(false);
    expect(hasDobTaskFlag("task")).toBe(false);
  });
});

describe("детекция ДОБ-задачи", () => {
  it("задача с флагом — ДОБ-задача, даже с неизвестным типом контента", () => {
    const task = { Id: 10, contentTypeId: "0x010800AAAA", IsDobTask: true };
    expect(isResultCheckTask(task)).toBe(true);
    expect(isDialogResultTask(task)).toBe(true);
    expect(isDobLikeTask({ ...task, sourceId: "main" })).toBe(true);
  });

  it("задача без флага обычного типа — не ДОБ-задача", () => {
    const task = { Id: 11, contentTypeId: "0x010800AAAA", IsDobTask: false };
    expect(isResultCheckTask(task)).toBe(false);
    expect(isDialogResultTask(task)).toBe(false);
    expect(isDobLikeTask({ ...task, sourceId: "main" })).toBe(false);
  });

  it("обратная совместимость: CT «Результат проверки ООБ» без поля работает как раньше", () => {
    expect(isResultCheckTask({ Id: 12, contentTypeId: RESULT_CHECK_OOO_CT_ID })).toBe(true);
    expect(isResultCheckTask({ Id: 12, contentTypeName: RESULT_CHECK_OOO_CT_NAME })).toBe(true);
  });

  it("«Изменить» ведёт на форму ДОБ по основному списку", () => {
    const task = { sourceId: "main", Id: 13, IsDobTask: true };
    expect(buildTaskFormHash("main:13", [MAIN, DOB], task)).toBe(
      "#dob_tasks/13?list=463b634e-a71a-4fef-9a1f-b803431d8639",
    );
  });
});

describe("isDialogRequired — приоритет флага", () => {
  it("флаг importantее правила Behaviour dlg:false (задачу всё равно ведёт наша форма)", () => {
    expect(isDialogRequired({ requiresDialog: false }, "", "", { IsDobTask: true })).toBe(true);
  });

  it("без флага правило dlg:false по-прежнему отключает диалог", () => {
    expect(
      isDialogRequired({ requiresDialog: false }, "", RESULT_CHECK_OOO_CT_NAME, { IsDobTask: false }),
    ).toBe(false);
  });

  it("dlg:true — диалог для любой задачи", () => {
    expect(isDialogRequired({ requiresDialog: true }, "0x0108AAA", "")).toBe(true);
  });
});

describe("поле IsDobTask доходит до UI (select + mapping)", () => {
  it("select основного списка запрашивает IsDobTask", () => {
    const url = buildTaskListQuery({
      selectProfile: "main",
      taskFieldNames: ["Id", "Title", "Status", "IsDobTask", "Location1"],
      assignedIds: [207],
      currentUserId: 207,
    });
    expect(readSelectFields(url)).toContain("IsDobTask");
  });

  it("внешнему источнику поле не навязывается", () => {
    const url = buildTaskListQuery({
      listApi: "/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')",
      selectProfile: "external",
      taskFieldNames: ["Id", "Title", "Status"],
      assignedIds: [207],
      currentUserId: 207,
    });
    expect(readSelectFields(url)).not.toContain("IsDobTask");
  });

  it("mapRawTask переносит флаг в задачу", () => {
    expect(mapRawTask({ Id: 1, Title: "T", IsDobTask: true }).IsDobTask).toBe(true);
    expect(mapRawTask({ Id: 1, Title: "T", IsDobTask: "Да" }).IsDobTask).toBe(true);
    expect(mapRawTask({ Id: 1, Title: "T" }).IsDobTask).toBe(false);
  });
});
