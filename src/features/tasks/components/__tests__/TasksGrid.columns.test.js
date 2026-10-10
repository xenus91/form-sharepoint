// src/features/tasks/components/__tests__/TasksGrid.columns.test.js
// Табличное представление #tasks:
//   • колонка «Кому назначено» = AssignedTo (заполняется и для dob-строк);
//   • колонка «Исполнитель» = Editor (кто взял), с фолбэком на AssignedTo;
//   • поля результата в таблице отсутствуют;
//   • колонка источника — только в debug-режиме.

import { describe, it, expect } from "vitest";
import {
  buildTaskColumns,
  statusCellStyle,
  dueCellStyle,
  dueCellText,
  dueCellTooltip,
  TASK_GRID_DEFAULT_COL_DEF,
} from "../../lib/taskTableColumns";

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

// Требование 2026-10-10: «Срок» в таблице — в том же формате, что и в карточке
// («Осталось …» / «Просрочено … назад»), а подсветка статуса совпадает с
// заливкой строки (см. lib/taskRowStatus.js).
describe("TasksGrid — колонка «Срок» как в карточке", () => {
  const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  it("показывает «Осталось …» до срока и «Просрочено … назад» после", () => {
    const cols = buildTaskColumns();
    const due = colByHeader(cols, "Срок");
    expect(due.valueFormatter({ data: { DueDate: inDays(3) } })).toMatch(/^Осталось \d+д \d+ч$/);
    expect(due.valueFormatter({ data: { DueDate: inDays(-3) } })).toMatch(/^Просрочено \d+д \d+ч назад$/);
    expect(due.valueFormatter({ data: { DueDate: inDays(-3) } })).not.toContain("Осталось");
    // срока нет — как в карточке
    expect(due.valueFormatter({ data: {} })).toBe("Без срока");
    expect(due.valueFormatter({ data: { DueDate: null } })).toBe("Без срока");
  });

  it("в подсказке остаётся точная дата и время", () => {
    const due = colByHeader(buildTaskColumns(), "Срок");
    const tip = due.tooltipValueGetter({ data: { DueDate: "2026-10-13T09:30:00" } });
    expect(tip).toContain("2026");
    expect(due.tooltipValueGetter({ data: {} })).toBeUndefined();
  });

  it("сортировка и фильтр — по-прежнему по дате (field = DueDate)", () => {
    const due = colByHeader(buildTaskColumns(), "Срок");
    expect(due.field).toBe("DueDate");
    expect(due.filter).toBe("agDateColumnFilter");
  });

  it("dueCellText/dueCellStyle: цвет как у чипа карточки", () => {
    // просрочена и НЕ завершена → красный и жирный
    const open = dueCellStyle({ data: { Status: "В процессе выполнения", DueDate: inDays(-2) } });
    expect(open.color).toBe("#c62828");
    expect(open.fontWeight).toBe(700);
    // ещё не просрочена → не красный
    const fresh = dueCellStyle({ data: { Status: "В процессе выполнения", DueDate: inDays(5) } });
    expect(fresh.color).not.toBe("#c62828");
    expect(dueCellStyle({ data: {} }).color).toBe("inherit");
    expect(dueCellText({ DueDate: inDays(3) })).toMatch(/^Осталось /);
  });

  it("завершённая задача — время решения (как чип в карточке), а не «просрочено»", () => {
    const done = { Status: "Завершена", PercentComplete: 1, Created: inDays(-4), Modified: inDays(-1), DueDate: inDays(-2) };
    // в карточке на месте чипа срока — formatSolveTime
    expect(dueCellText(done)).toMatch(/^Решено( за \d+д \d+ч)?$/);
    expect(dueCellText(done)).not.toContain("Просрочено");
    // нейтральный цвет: это факт, а не предупреждение
    expect(dueCellStyle({ data: done }).color).toBe("#455a64");
    // в подсказке — когда создана, когда закрыта и сколько заняла
    const tip = dueCellTooltip(done) || "";
    expect(tip).toContain("Создана");
    expect(tip).toContain("Завершена");
    // колонка рисует именно этот текст
    const due = colByHeader(buildTaskColumns(), "Срок");
    expect(due.valueFormatter({ data: done })).toMatch(/^Решено/);
    // у открытой задачи в подсказке — точный срок
    expect(dueCellTooltip({ DueDate: "2026-10-13T09:30:00" })).toContain("2026");
    expect(dueCellTooltip({})).toBeUndefined();
    expect(dueCellTooltip(null)).toBeUndefined();
  });

  it("у колонки «Исполнитель» есть colId для кнопки (как у «Кому назначено»)", () => {
    const cols = buildTaskColumns();
    expect(colByHeader(cols, "Кому назначено").colId).toBe("assignedTo");
    expect(colByHeader(cols, "Исполнитель").colId).toBe("taker");
  });
});

describe("TasksGrid — подсветка ячейки «Статус» = заливка строки", () => {
  it("в работе — оранжевая, завершена — зелёная, просрочена — красная", () => {
    const progress = statusCellStyle({ value: "В процессе выполнения", data: { Status: "В процессе выполнения", DueDate: null } });
    const completed = statusCellStyle({ value: "Завершена", data: { Status: "Завершена", PercentComplete: 1 } });
    const overdue = statusCellStyle({
      value: "В процессе выполнения",
      data: { Status: "В процессе выполнения", DueDate: new Date(Date.now() - 86400000).toISOString() },
    });
    expect(progress.backgroundColor).toBe("#fff3e0");
    expect(completed.backgroundColor).toBe("#e8f5e9");
    expect(overdue.backgroundColor).toBe("#ffebee");
  });

  it("«Не начата» в срок — без подсветки", () => {
    expect(statusCellStyle({ value: "Не начата", data: { Status: "Не начата" } })).toBeNull();
  });

  it("работает и без data (только по значению ячейки)", () => {
    expect(statusCellStyle({ value: "Завершена" }).backgroundColor).toBe("#e8f5e9");
    expect(statusCellStyle({ value: "Отменена" }).backgroundColor).toBeTruthy();
    expect(statusCellStyle({ value: "" })).toBeNull();
  });
});
