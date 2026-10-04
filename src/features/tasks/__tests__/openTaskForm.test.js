// src/features/tasks/__tests__/openTaskForm.test.js
// Переход из таблицы #tasks в форму редактирования:
//   • main → существующий роут #tasks/<Id>;
//   • dob (внешний источник) → #dob_tasks/<Id>?list=<GUID списка источника>,
//     то есть та же форма, что dob_tasks/[id], но по списку задачи.

import { describe, it, expect } from "vitest";
import { buildTaskFormHash, isDialogResultTask } from "../lib/openTaskForm";
import { RESULT_CHECK_OOO_CT_ID } from "../../../tasks/contentTypeFields";

const MAIN = { id: "main", listGuid: "463B634E-A71A-4FEF-9A1F-B803431D8639" };
const DOB = { id: "dob", listGuid: "03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3" };

describe("buildTaskFormHash", () => {
  it("main-задача → #tasks/<id>", () => {
    expect(buildTaskFormHash("main:10", [MAIN, DOB])).toBe("#tasks/10");
  });

  it("задача dob → #dob_tasks/<id>?list=<guid источника> (нижний регистр)", () => {
    expect(buildTaskFormHash("dob:1", [MAIN, DOB])).toBe(
      "#dob_tasks/1?list=03fc1b92-baff-44dc-b8a3-d04acbe329d3",
    );
  });

  it("неизвестный источник без listGuid → null (переходить некуда)", () => {
    expect(buildTaskFormHash("dob:1", [MAIN])).toBeNull();
    expect(buildTaskFormHash("other:5", [MAIN, DOB])).toBeNull();
  });


  it("main-задача типа «Результат проверки ООБ» → форма ДОБ по основному списку", () => {
    // Тот же экран, что у задач dob (DobTaskEditView), но список — основной:
    // задача этого типа не открывается стандартной карточкой #tasks/<id>.
    const check = { sourceId: "main", Id: 13, contentTypeId: RESULT_CHECK_OOO_CT_ID };
    expect(isDialogResultTask(check)).toBe(true);
    expect(buildTaskFormHash("main:13", [MAIN, DOB], check)).toBe(
      "#dob_tasks/13?list=463b634e-a71a-4fef-9a1f-b803431d8639",
    );
    // задача обычного типа не меняется
    expect(isDialogResultTask({ sourceId: "main", Id: 10, contentTypeId: "0x0108AAAA" })).toBe(false);
    expect(buildTaskFormHash("main:10", [MAIN, DOB], { contentTypeId: "0x0108AAAA" })).toBe("#tasks/10");
  });

  it("невалидный compositeId → null", () => {
    expect(buildTaskFormHash("", [MAIN, DOB])).toBeNull();
    expect(buildTaskFormHash("dob", [MAIN, DOB])).toBeNull();
    expect(buildTaskFormHash("dob:abc", [MAIN, DOB])).toBeNull();
    expect(buildTaskFormHash(null, [MAIN, DOB])).toBeNull();
  });
});
