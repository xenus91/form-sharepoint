// src/features/form/lib/__tests__/otherProblemConflict.test.js
//
// «Не найдена» против уже зарегистрированной проблемы по тому же ЕО на РЦ.
import { describe, it, expect } from "vitest";
import {
  NOT_FOUND_PROBLEM,
  OTHER_PROBLEM_DIALOG_TITLE,
  OTHER_PROBLEM_LOOKBACK_HOURS,
  eoCheckKindForProblems,
  eoCheckSignature,
  findOtherProblemRow,
  hasOtherProblems,
  otherProblemLocationLabel,
  otherProblemLookbackLabel,
  otherProblemSinceIso,
  otherProblemWarningSegments,
  otherProblemWarningText,
  otherProblemsLabel,
  pluralHours,
} from "../otherProblemConflict";

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

describe("окно поиска конфликта — 48 часов", () => {
  it("константа = 48", () => {
    expect(OTHER_PROBLEM_LOOKBACK_HOURS).toBe(48);
  });

  it("otherProblemSinceIso отсекает ровно 48 часов", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    expect(otherProblemSinceIso(now)).toBe("2026-10-19T12:00:00.000Z");
  });

  it("подпись окна склоняется: 48 часов", () => {
    expect(otherProblemLookbackLabel()).toBe("48 часов");
  });
});

describe("pluralHours — склонение «час»", () => {
  it.each([
    [1, "1 час"],
    [2, "2 часа"],
    [3, "3 часа"],
    [4, "4 часа"],
    [5, "5 часов"],
    [0, "0 часов"],
    [11, "11 часов"],
    [12, "12 часов"],
    [14, "14 часов"],
    [21, "21 час"],
    [22, "22 часа"],
    [24, "24 часа"],
    [25, "25 часов"],
    [48, "48 часов"],
    [101, "101 час"],
    [111, "111 часов"],
    [112, "112 часов"],
    [122, "122 часа"],
  ])("%i → %s", (n, expected) => {
    expect(pluralHours(n)).toBe(expected);
  });
});

describe("текст предупреждения", () => {
  it("заголовок — «По этой ЕО уже есть проблема»", () => {
    expect(OTHER_PROBLEM_DIALOG_TITLE).toBe("По этой ЕО уже есть проблема");
  });

  it("полный текст со списком проблем и «48 часов»", () => {
    expect(
      otherProblemWarningText({
        thu: "808003003005005005",
        problems: "Товар не примотан к поддону, Товар выступает за габариты поддона, Повреждение, Плохая обмотка",
      }),
    ).toBe(
      "По ЕО 808003003005005005 за последние 48 часов на этом РЦ уже зарегистрирована проблема в другой заявке: " +
        "Товар не примотан к поддону, Товар выступает за габариты поддона, Повреждение, Плохая обмотка. " +
        "Вы выбрали «Не найдена». Действительно подать заявку или ЕО всё-таки нашлась?",
    );
  });

  it("без списка проблем — двоеточия нет", () => {
    const text = otherProblemWarningText({ thu: "1", problems: "" });
    expect(text).toContain("в другой заявке. Вы выбрали");
    expect(text).not.toContain(":");
  });

  it("«Не найдена» — та же строка, что NOT_FOUND_PROBLEM", () => {
    expect(otherProblemWarningText({ thu: "1" })).toContain(NOT_FOUND_PROBLEM);
  });
});

describe("данные найденной заявки в сообщении", () => {
  const found = {
    Id: 25411,
    THU: "808003003005005005",
    Location1: "Не найдена в зоне отгрузки",
    Problems: { results: ["Повреждение", "Плохая обмотка"] },
  };

  it("Location1 пробрасывается в подпись локации", () => {
    expect(otherProblemLocationLabel(found)).toBe("Не найдена в зоне отгрузки");
    expect(otherProblemLocationLabel({ Location1: "  Рампа 5  " })).toBe("Рампа 5");
    expect(otherProblemLocationLabel({})).toBe("");
    expect(otherProblemLocationLabel(null)).toBe("");
  });

  it("текст содержит и проблемы, и локацию", () => {
    expect(
      otherProblemWarningText({
        thu: found.THU,
        problems: otherProblemsLabel(found),
        location: otherProblemLocationLabel(found),
      }),
    ).toBe(
      "По ЕО 808003003005005005 за последние 48 часов на этом РЦ уже зарегистрирована проблема в другой заявке: " +
        "Повреждение, Плохая обмотка. Локация: Не найдена в зоне отгрузки. " +
        "Вы выбрали «Не найдена». Действительно подать заявку или ЕО всё-таки нашлась?",
    );
  });

  it("проблемы и локация помечены как выделяемые", () => {
    const strong = otherProblemWarningSegments({
      thu: found.THU,
      problems: otherProblemsLabel(found),
      location: otherProblemLocationLabel(found),
    })
      .filter((seg) => seg.strong)
      .map((seg) => seg.text);
    expect(strong).toEqual(["Повреждение, Плохая обмотка", "Не найдена в зоне отгрузки"]);
  });

  it("нет локации — нет и предложения про локацию", () => {
    const segments = otherProblemWarningSegments({ thu: "1", problems: "Повреждение" });
    expect(segments.some((seg) => seg.strong && seg.text === "Повреждение")).toBe(true);
    expect(segments.map((seg) => seg.text).join("")).not.toContain("Локация");
  });

  it("строка и сегменты не разъезжаются", () => {
    const params = { thu: "1", problems: "Повреждение", location: "Рампа 5", lookbackHours: 3 };
    expect(otherProblemWarningText(params)).toBe(
      otherProblemWarningSegments(params).map((seg) => seg.text).join(""),
    );
  });
});
