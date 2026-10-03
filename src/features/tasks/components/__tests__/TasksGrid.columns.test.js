// src/features/tasks/components/__tests__/TasksGrid.columns.test.js
// Табличное представление #tasks:
//   • колонка «Кому назначено» = AssignedTo (заполняется и для dob-строк);
//   • колонка «Исполнитель» = Editor (кто взял), с фолбэком на AssignedTo;
//   • поля результата в таблице отсутствуют;
//   • колонка источника — только в debug-режиме.

import { describe, it, expect } from "vitest";
import { buildTaskColumns, statusCellStyle } from "../../lib/taskTableColumns";

function colByHeader(cols, header) {
  return cols.find((c) => c.headerName === header);
}

describe("TasksGrid.buildTaskColumns", () => {
  it("содержит «Кому назначено» и «Исполнитель» и не содержит полей результата", () => {
    const cols = buildTaskColumns();
    const headers = cols.map((c) => c.headerName);
    expect(headers).toContain("Кому назначено");
    expect(headers).toContain("Исполнитель");
    expect(headers).toContain("Статус");
    expect(headers).not.toContain("Источник");
    // никаких result-полей в таблице
    const json = JSON.stringify(cols);
    expect(json).not.toContain("ResultSearchTHU");
    expect(json).not.toContain("Location1");
  });

  it("«Кому назначено» читает AssignedTo, «Исполнитель» — Editor с фолбэком на AssignedTo", () => {
    const cols = buildTaskColumns();
    const assigned = colByHeader(cols, "Кому назначено");
    const taker = colByHeader(cols, "Исполнитель");

    // dob-строка: назначено на группу, никто ещё не взял
    const dobRow = { AssignedTo: "ООБ", EditorTitle: "", Editor: "" };
    expect(assigned.valueGetter({ data: dobRow })).toBe("ООБ");
    expect(taker.valueGetter({ data: dobRow })).toBe("ООБ"); // фолбэк, колонка не пустует

    // задача взята в работу: исполнитель — Editor
    const inWork = { AssignedTo: "ООБ", EditorTitle: "Поршаков Сергей" };
    expect(taker.valueGetter({ data: inWork })).toBe("Поршаков Сергей");

    // пустая строка не падает
    expect(assigned.valueGetter({ data: undefined })).toBe("");
    expect(taker.valueGetter({ data: {} })).toBe("");
  });

  it("колонка источника появляется только по флагу", () => {
    const withSource = buildTaskColumns({ showSourceColumn: true });
    expect(withSource.map((c) => c.headerName)).toContain("Источник");
    const src = colByHeader(withSource, "Источник");
    expect(src.valueGetter({ data: { sourceLabel: "DOB Logistic", sourceId: "dob" } })).toBe("DOB Logistic");
    expect(src.valueGetter({ data: { sourceId: "dob" } })).toBe("dob");
  });

  it("статус подсвечивается только для известных значений", () => {
    expect(statusCellStyle({ value: "В работе" }).backgroundColor).toBeTruthy();
    expect(statusCellStyle({ value: "Не начата" })).toBeNull();
  });
});
