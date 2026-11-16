import { describe, expect, it } from "vitest";
import {
  findNotFoundRecipientDuplicate,
  hasNotFoundProblem,
  notFoundDuplicateSinceIso,
  NOT_FOUND_DUPLICATE_LOOKBACK_HOURS,
} from "../notFoundDuplicate";

const row = (overrides = {}) => ({
  Id: 7,
  THU: "808117004022047365",
  RecipientId: 17,
  Created: "2026-10-10T06:00:00.000Z",
  Problems: { results: ["Не найдена"] },
  ...overrides,
});

describe("проверка дубликата «Не найдена» по ЕО и получателю", () => {
  it("использует окно ровно 12 часов", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    expect(NOT_FOUND_DUPLICATE_LOOKBACK_HOURS).toBe(12);
    expect(notFoundDuplicateSinceIso(now)).toBe("2026-10-10T00:00:00.000Z");
  });

  it("считает совпадением ту же ЕО, получателя и проблему «Не найдена»", () => {
    expect(hasNotFoundProblem(row())).toBe(true);
    expect(findNotFoundRecipientDuplicate([row()], {
      eoNumber: "808117004022047365",
      recipientId: "17",
      sinceIso: "2026-10-10T00:00:00.000Z",
    })).toEqual(row());
  });

  it.each([
    ["другой номер ЕО", row({ THU: "808117004022047366" })],
    ["другой получатель", row({ RecipientId: 18 })],
    ["другая проблема", row({ Problems: { results: ["Повреждение"] } })],
    ["старше 12 часов", row({ Created: "2026-10-09T23:59:59.999Z" })],
  ])("не считает дубликатом: %s", (_label, candidate) => {
    expect(findNotFoundRecipientDuplicate([candidate], {
      eoNumber: "808117004022047365",
      recipientId: 17,
      sinceIso: "2026-10-10T00:00:00.000Z",
    })).toBeNull();
  });

  it("не считает текущую редактируемую запись дубликатом", () => {
    expect(findNotFoundRecipientDuplicate([row()], {
      eoNumber: "808117004022047365",
      recipientId: 17,
      editingItemId: "7",
      sinceIso: "2026-10-10T00:00:00.000Z",
    })).toBeNull();
  });
});
