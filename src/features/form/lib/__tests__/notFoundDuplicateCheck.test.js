import { describe, expect, it, vi } from "vitest";
import { findRecentNotFoundRecipientDuplicate } from "../notFoundDuplicateCheck";

const duplicate = {
  Id: 55,
  THU: "808117004022047365",
  RecipientId: 17,
  DC_THU: "8117",
  Created: "2026-10-10T06:00:00.000Z",
  Problems: { results: ["Не найдена"] },
  Location1: "Зона отгрузки",
  Author: { Title: "Оператор" },
};

describe("findRecentNotFoundRecipientDuplicate", () => {
  it("запрашивает пару ЕО-получатель за последние 12 часов", async () => {
    const client = {
      get: vi.fn(async () => ({ data: { d: { results: [duplicate] } } })),
    };
    const now = Date.parse("2026-10-10T12:00:00.000Z");

    const result = await findRecentNotFoundRecipientDuplicate({
      eoNumber: duplicate.THU,
      recipientId: "17",
      client,
      now,
    });

    expect(client.get).toHaveBeenCalledTimes(1);
    const [url, config] = client.get.mock.calls[0];
    expect(url).toContain("RecipientId%20eq%2017");
    expect(url).toContain("Created%20ge%20datetime'2026-10-10T00%3A00%3A00.000Z'");
    expect(url).toContain("Problems");
    expect(config.headers.Accept).toBe("application/json;odata=verbose");
    expect(result).toEqual(duplicate);
  });

  it("не ищет записи без корректного получателя и сохраняет поведение при сбое чтения", async () => {
    const client = { get: vi.fn(async () => { throw new Error("offline"); }) };
    expect(await findRecentNotFoundRecipientDuplicate({
      eoNumber: duplicate.THU,
      recipientId: null,
      client,
    })).toBeNull();
    expect(client.get).not.toHaveBeenCalled();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await findRecentNotFoundRecipientDuplicate({
      eoNumber: duplicate.THU,
      recipientId: 17,
      client,
    })).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
