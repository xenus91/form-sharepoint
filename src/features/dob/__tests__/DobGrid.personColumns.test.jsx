// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.personColumns.test.jsx
//
// Требование 2026-10-15:
//   • «исправить отображение данных в типах User и UserMulti — корректное
//     отображение в таблице также как реализовано в таблице задач» (ФИО, а не
//     объект и не пусто, несколько человек — списком);
//   • «добавить в отображение тип контента».

import { describe, it, expect, beforeEach } from "vitest";
import { renderDobGrid, ROWS, textOf } from "./helpers/dobGridHarness";

/** Тексты ячеек колонки (строки продублированы в закреплённой и центральной части). */
function cellsOf(host, colId) {
  return [...new Set([...host.querySelectorAll(`[col-id="${colId}"]`)].map((c) => (c.textContent || "").trim()))];
}

function headerOf(host, colId) {
  return (host.querySelector(`.ag-header-cell[col-id="${colId}"]`)?.textContent || "").trim();
}

describe("DobGrid — люди и тип контента", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("User: в ячейке ФИО, а не объект", async () => {
    const { host } = await renderDobGrid({ stateScope: "person_user" });
    const texts = cellsOf(host, "Initiator");
    expect(texts.some((t) => t.includes("Иванов Иван Иванович"))).toBe(true);
    expect(texts.some((t) => t.includes("Сидоров Пётр"))).toBe(true);
    expect(textOf(host)).not.toContain("[object Object]");
    // иконка человека — как в таблице задач
    expect(host.querySelectorAll('[data-testid="dob-person-cell"]').length).toBeGreaterThan(0);
  });

  it("UserMulti: все участники через запятую", async () => {
    const { host } = await renderDobGrid({ stateScope: "person_multi" });
    const first = cellsOf(host, "Members").find((t) => t.includes("Петрова Анна")) || "";
    expect(first).toContain("Иванов Иван Иванович");
    expect(first).toContain("Петрова Анна");
    // пустое многозначное поле — прочерк, а не «[object Object]»
    expect(host.querySelectorAll('[data-testid="dob-person-empty"]').length).toBeGreaterThan(0);
  });

  it("нераскрытое поле людей: показываем Id, а не пустоту", async () => {
    const { host } = await renderDobGrid({ stateScope: "person_deferred" });
    // вторая строка: Initiator пришёл __deferred, рядом InitiatorId = 12
    expect(cellsOf(host, "Initiator")).toContain("12");
  });

  it("есть колонка «Тип контента» с именем типа из Description", async () => {
    const { host } = await renderDobGrid({ stateScope: "ct_column" });
    expect(headerOf(host, "dobContentType")).toBe("Тип контента");
    const texts = cellsOf(host, "dobContentType");
    expect(texts).toContain("Заявка на проверку");
    expect(texts).toContain("Претензия");
  });

  it("без списка типов контента колонка не появляется (ничего не выдумываем)", async () => {
    const { host } = await renderDobGrid({ stateScope: "ct_none", contentTypes: [] });
    expect(headerOf(host, "dobContentType")).toBe("");
  });

  it("тип контента наследника определяется по префиксу ContentTypeId", async () => {
    // ContentTypeId элемента длиннее Id типа контента
    expect(ROWS[0].ContentTypeId.startsWith("0x0100AA")).toBe(true);
    const { host } = await renderDobGrid({ stateScope: "ct_prefix" });
    expect(cellsOf(host, "dobContentType")).toContain("Заявка на проверку");
  });
});
