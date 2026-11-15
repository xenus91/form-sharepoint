import { describe, expect, it } from "vitest";
import { EO_NUMBER_PATTERN, matchRecipientCode, parseBulkEoInput } from "../bulkEoParser";

describe("parseBulkEoInput", () => {
  it("разбирает пары код получателя/ЕО, пустые строки и bidi-символы", () => {
    const result = parseBulkEoInput(
      "\u202d0294\u202c\n\n808117004022047365\n\u202d0294\u202c\n808117004022002852\n\n0294\n808117005010002359",
    );

    expect(result.warnings).toEqual([]);
    expect(result.rows.map(({ recipientCode, eoNumber }) => [recipientCode, eoNumber])).toEqual([
      ["0294", "808117004022047365"],
      ["0294", "808117004022002852"],
      ["0294", "808117005010002359"],
    ]);
    expect(result.rows.every((row) => row.parseWarning === "")).toBe(true);
  });

  it("разбирает табличную вставку из Excel с табами и пустыми ячейками", () => {
    const result = parseBulkEoInput(
      "Получатель\tЕО\r\n0294\t\t808117004022047365\r\n\r\n0294\t808117004022002852",
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.eoNumber)).toEqual([
      "808117004022047365",
      "808117004022002852",
    ]);
  });

  it("оставляет неполные и некорректные пары в предпросмотре с ошибкой", () => {
    const result = parseBulkEoInput("0294\n8081170040220473\n0295");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      recipientCode: "0294",
      eoNumber: "8081170040220473",
    });
    expect(result.rows[0].parseWarning).toContain("17 или 18 цифр");
    expect(result.rows[1]).toMatchObject({ recipientCode: "0295", eoNumber: "" });
    expect(result.rows[1].parseWarning).toContain("не указан номер ЕО");
  });

  it("помечает ЕО без кода получателя и пустой ввод", () => {
    const result = parseBulkEoInput("808117004022047365");
    expect(result.rows[0]).toMatchObject({ recipientCode: "", eoNumber: "808117004022047365" });
    expect(result.rows[0].parseWarning).toContain("не найден код получателя");
    expect(parseBulkEoInput("   ").warnings).toContain("Вставьте пары: код получателя и номер ЕО.");
  });
});

describe("matchRecipientCode", () => {
  const recipients = [
    { id: 1, scNumberText: "0294", scNumber: "294", title: "Магазин на Невском" },
    { id: 2, scNumberText: "0081", scNumber: "81", title: "Магазин на Литейном" },
  ];

  it("точно сопоставляет код с ведущими нулями", () => {
    expect(matchRecipientCode("0294", recipients)).toMatchObject({
      status: "matched",
      recipient: recipients[0],
    });
  });

  it("использует числовое совпадение, если в SharePoint код хранится числом", () => {
    const options = [{ id: 4, scNumber: "294", title: "Получатель 294" }];
    expect(matchRecipientCode("0294", options)).toMatchObject({ status: "matched", recipient: options[0] });
  });

  it("не выбирает одного из нескольких получателей с одинаковым кодом", () => {
    const options = [
      ...recipients,
      { id: 3, scNumberText: "0294", title: "Другая точка 0294" },
    ];
    expect(matchRecipientCode("0294", options)).toMatchObject({ status: "ambiguous", recipient: null });
  });

  it("возвращает missing для неизвестного кода", () => {
    expect(matchRecipientCode("9999", recipients)).toMatchObject({ status: "missing", recipient: null, candidates: [] });
  });
});

it("принимает только 17- или 18-значную ЕО", () => {
  expect(EO_NUMBER_PATTERN.test("808117004022047365")).toBe(true);
  expect(EO_NUMBER_PATTERN.test("80811700402204736")).toBe(true);
  expect(EO_NUMBER_PATTERN.test("8081170040220473")).toBe(false);
});
