// src/features/form/lib/__tests__/otherProblemConflict.test.js
//
// «Не найдена» против уже зарегистрированной проблемы по тому же ЕО на РЦ.
import { describe, it, expect } from "vitest";
import { eoCheckKindForProblems, eoCheckSignature, findOtherProblemRow, hasOtherProblems, otherProblemsLabel } from "../otherProblemConflict";

const row = (Id, problems, extra = {}) => ({ Id, THU: "808003003003003003", DC_THU: "8117", Problems: { results: problems }, ...extra });

describe("hasOtherProblems", () => {
  it("есть конкретная проблема — конфликт", () => {
    expect(hasOtherProblems(["Паллета повреждена"])).toBe(true);
    expect(hasOtherProblems(["Не найдена", "Паллета повреждена"])).toBe(true);
  });

  it("только «Не найдена» — конфликта нет", () => {
    expect(hasOtherProblems(["Не найдена"])).toBe(false);
    expect(hasOtherProblems([])).toBe(false);
    expect(hasOtherProblems(null)).toBe(false);
    expect(hasOtherProblems(undefined)).toBe(false);
  });

  it("пустые строки проблемой не считаем", () => {
    expect(hasOtherProblems(["", "   "])).toBe(false);
  });
});

describe("findOtherProblemRow", () => {
  it("находит заявку с другой проблемой по тому же ЕО", () => {
    const rows = [row(1, ["Не найдена"]), row(2, ["Паллета повреждена"])];
    const hit = findOtherProblemRow(rows);
    expect(hit).toBeTruthy();
    expect(hit.Id).toBe(2);
  });

  it("заявки только с «Не найдена» конфликтом не считаются", () => {
    expect(findOtherProblemRow([row(1, ["Не найдена"]), row(2, ["Не найдена"])])).toBeNull();
  });

  it("редактируемую заявку пропускаем", () => {
    const rows = [row(7, ["Паллета повреждена"])];
    expect(findOtherProblemRow(rows, { editingItemId: 7 })).toBeNull();
    expect(findOtherProblemRow(rows, { editingItemId: "7" })).toBeNull();
    expect(findOtherProblemRow(rows, { editingItemId: 8 })?.Id).toBe(7);
  });

  it("пусто/криво — null, не падаем", () => {
    expect(findOtherProblemRow([])).toBeNull();
    expect(findOtherProblemRow(null)).toBeNull();
    expect(findOtherProblemRow([null, undefined, {}])).toBeNull();
    expect(findOtherProblemRow([{ Id: 3 }])).toBeNull();
  });

  it("берёт первую подходящую", () => {
    const rows = [row(1, ["Не найдена"]), row(2, ["Брак упаковки"]), row(3, ["Недостача"])];
    expect(findOtherProblemRow(rows).Id).toBe(2);
  });
});

describe("otherProblemsLabel", () => {
  it("проблемы через запятую — для текста предупреждения", () => {
    expect(otherProblemsLabel(row(1, ["Брак упаковки", "Недостача"]))).toBe("Брак упаковки, Недостача");
  });

  it("нет проблем — пустая строка", () => {
    expect(otherProblemsLabel(null)).toBe("");
    expect(otherProblemsLabel(row(1, []))).toBe("");
  });
});

describe("eoCheckKindForProblems — какая проверка применяется", () => {
  it("выбрана «Не найдена» — проверка другой проблемы на РЦ", () => {
    expect(eoCheckKindForProblems(["Не найдена"])).toBe("notfound");
    expect(eoCheckKindForProblems(["Брак упаковки", "Не найдена"])).toBe("notfound");
  });

  it("любая другая проблема — старая проверка дубля", () => {
    expect(eoCheckKindForProblems(["Брак упаковки"])).toBe("duplicate");
    expect(eoCheckKindForProblems([])).toBe("duplicate");
    expect(eoCheckKindForProblems(null)).toBe("duplicate");
  });

  it("вид проверки один — одновременного срабатывания двух нет", () => {
    const kinds = ["Не найдена", "Брак упаковки"].map((p) => eoCheckKindForProblems([p]));
    expect(new Set(kinds).size).toBe(2);
    expect(kinds).toEqual(["notfound", "duplicate"]);
  });
});

describe("eoCheckSignature", () => {
  it("различает номер ЕО и тип проверки", () => {
    expect(eoCheckSignature("808003003003003003", ["Не найдена"]))
      .not.toBe(eoCheckSignature("808003003003003003", ["Брак упаковки"]));
    expect(eoCheckSignature("808003003003003003", ["Не найдена"]))
      .not.toBe(eoCheckSignature("808003003003003004", ["Не найдена"]));
  });

  it("одинаковый набор даёт одинаковую подпись — повторно не спрашиваем", () => {
    expect(eoCheckSignature("123", ["Не найдена"])).toBe(eoCheckSignature("123", ["Не найдена"]));
  });
});
