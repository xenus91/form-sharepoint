// src/features/dob/components/requestForm/__tests__/requestTitle.test.js
// Общее правило заголовка заявки: «<Название типа> от <дд.мм.гггг чч:мм>».

import { describe, it, expect } from "vitest";
import { buildRequestTitle, formatRequestStamp } from "../requestTitle";

describe("requestTitle", () => {
  it("заголовок = описание типа + дата-время", () => {
    const date = new Date(2026, 9, 13, 16, 3); // 13.10.2026 16:03
    expect(buildRequestTitle({ contentType: { Name: "Request", Description: "Заявка на отгрузку" }, date }))
      .toBe("Заявка на отгрузку от 13.10.2026 16:03");
  });

  it("название типа берётся из Description, Name — только запасной вариант", () => {
    const date = new Date(2026, 0, 5, 9, 7);
    expect(buildRequestTitle({ contentType: { Name: "Return" }, date })).toBe("Return от 05.01.2026 09:07");
    expect(buildRequestTitle({ ctLabel: "Внутренняя заявка", date })).toBe("Внутренняя заявка от 05.01.2026 09:07");
  });

  it("без типа — просто «Заявка»", () => {
    expect(buildRequestTitle({ date: new Date(2026, 9, 13, 0, 0) })).toBe("Заявка от 13.10.2026 00:00");
  });

  it("formatRequestStamp: две цифры в дате и времени", () => {
    expect(formatRequestStamp(new Date(2026, 2, 4, 5, 6))).toBe("04.03.2026 05:06");
    expect(formatRequestStamp("не дата")).toBe("");
  });
});
