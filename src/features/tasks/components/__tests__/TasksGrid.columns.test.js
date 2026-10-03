// src/features/tasks/components/__tests__/TasksGrid.columns.test.js
// Табличное представление #tasks:
//   • колонка «Кому назначено» = AssignedTo (заполняется и для dob-строк);
//   • колонка «Исполнитель» = Editor (кто взял), с фолбэком на AssignedTo;
//   • поля результата в таблице отсутствуют;
//   • колонка источника — только в debug-режиме.

import { describe, it, expect } from "vitest";
import { buildTaskColumns, statusCellStyle, TASK_GRID_DEFAULT_COL_DEF } from "../../lib/taskTableColumns";

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

  it("«Кому назначено» — всегда AssignedTo, «Исполнитель» — только тот, кто взял в работу", () => {
    const cols = buildTaskColumns();
    const assigned = colByHeader(cols, "Кому назначено");
    const taker = colByHeader(cols, "Исполнитель");

    // dob-строка: назначено на группу, никто ещё не взял → исполнителя нет
    const dobRow = { AssignedTo: "ООБ", EditorTitle: "", Editor: "" };
    expect(assigned.valueGetter({ data: dobRow })).toBe("ООБ");
    expect(taker.valueGetter({ data: dobRow })).toBe("");

    // задача взята в работу: исполнитель — Editor
    const inWork = { AssignedTo: "ООБ", Status: "В работе", EditorTitle: "Поршаков Сергей" };
    expect(taker.valueGetter({ data: inWork })).toBe("Поршаков Сергей");

    // не начата: Editor (автор задачи) НЕ должен считаться исполнителем
    const notStarted = { AssignedTo: "ООБ", Status: "Не начата", EditorTitle: "Автор Задачи" };
    expect(taker.valueGetter({ data: notStarted })).toBe("");

    // завершена: исполнитель — тот, кто выполнил
    const done = { AssignedTo: "ООБ", Status: "Завершена", PercentComplete: 1, EditorTitle: "Поршаков Сергей" };
    expect(taker.valueGetter({ data: done })).toBe("Поршаков Сергей");

    // пустая строка не падает
    expect(assigned.valueGetter({ data: undefined })).toBe("");
    expect(taker.valueGetter({ data: {} })).toBe("");
  });

  it("«Описание задачи» идёт сразу после «Заголовка» и показывает плоский текст", () => {
    const cols = buildTaskColumns();
    const headers = cols.map((c) => c.headerName);
    expect(headers.indexOf("Описание задачи")).toBe(headers.indexOf("Заголовок") + 1);

    const desc = colByHeader(cols, "Описание задачи");
    expect(desc.valueGetter({ data: { Body: "Просмотр видеоархива" } })).toBe("Просмотр видеоархива");
    // HTML из внешних списков — в плоский текст
    expect(desc.valueGetter({ data: { Body: "<p>Строка&nbsp;1</p><br/><b>Строка 2</b>" } })).toBe("Строка 1 Строка 2");
    expect(desc.valueGetter({ data: {} })).toBe("");
    expect(desc.valueGetter({ data: undefined })).toBe("");
  });

  it("колонка источника появляется только по флагу", () => {
    const withSource = buildTaskColumns({ showSourceColumn: true });
    expect(withSource.map((c) => c.headerName)).toContain("Источник");
    const src = colByHeader(withSource, "Источник");
    expect(src.valueGetter({ data: { sourceLabel: "DOB Logistic", sourceId: "dob" } })).toBe("DOB Logistic");
    expect(src.valueGetter({ data: { sourceId: "dob" } })).toBe("dob");
  });

  it("поиск общий над таблицей: строк фильтров под заголовками нет", () => {
    // Требование 2026-10-03: вместо floating-фильтров — один поиск над таблицей
    // (см. TasksGrid → quickFilterText), поэтому floatingFilter выключен.
    expect(TASK_GRID_DEFAULT_COL_DEF.floatingFilter).toBe(false);
  });

  it("«Заголовок» — узкий, «Описание задачи» — самая широкая колонка", () => {
    const cols = buildTaskColumns();
    const title = colByHeader(cols, "Заголовок");
    const desc = colByHeader(cols, "Описание задачи");
    expect(title.width).toBeLessThanOrEqual(180);
    expect(title.flex).toBeUndefined();
    // описание забирает всё свободное место таблицы
    expect(desc.flex).toBeGreaterThanOrEqual(1);
    expect(desc.minWidth).toBeGreaterThanOrEqual(300);
    expect(desc.minWidth).toBeGreaterThan(title.width);
  });

  it("у всех колонок включены сортировка и фильтрация (типы по данным)", () => {
    expect(TASK_GRID_DEFAULT_COL_DEF.sortable).toBe(true);
    expect(TASK_GRID_DEFAULT_COL_DEF.filter).toBe(true);

    const cols = buildTaskColumns();
    for (const c of cols) {
      expect(c.sortable).toBe(true);
      expect(typeof c.filter === "string" || c.filter === true || c.filter === undefined).toBe(true);
    }
    // Id — числовой фильтр, даты — календарь, текстовые — текст
    expect(colByHeader(cols, "Id").filter).toBe("agNumberColumnFilter");
    expect(colByHeader(cols, "Срок").filter).toBe("agDateColumnFilter");
    expect(colByHeader(cols, "Изменён").filter).toBe("agDateColumnFilter");
    expect(colByHeader(cols, "Заголовок").filter).toBe("agTextColumnFilter");
    expect(colByHeader(cols, "Описание задачи").filter).toBe("agTextColumnFilter");
    expect(colByHeader(cols, "Кому назначено").filter).toBe("agTextColumnFilter");
    expect(colByHeader(cols, "Исполнитель").filter).toBe("agTextColumnFilter");
  });

  it("статус подсвечивается только для известных значений", () => {
    expect(statusCellStyle({ value: "В работе" }).backgroundColor).toBeTruthy();
    expect(statusCellStyle({ value: "Не начата" })).toBeNull();
  });
});
