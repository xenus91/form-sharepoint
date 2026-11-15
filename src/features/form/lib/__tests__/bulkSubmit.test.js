import { describe, expect, it, vi } from "vitest";
import { createBulkProblemsPalletItems } from "../bulkSubmit";

const common = {
  rows: [
    { id: "row-1", eoNumber: "808117004022047365", recipientId: 17 },
    { id: "row-2", eoNumber: "808117004022002852", recipientId: 21 },
  ],
  dcThu: "8117",
  operationDateIso: "2026-10-10T00:00:00.000Z",
  problems: ["Не найдена"],
  location: "Не найдена в зоне отгрузки",
};

const digestResponse = {
  data: { d: { GetContextWebInformation: { FormDigestValue: "digest-value" } } },
};

describe("createBulkProblemsPalletItems", () => {
  it("создаёт отдельный элемент на каждую пару и выставляет финальный статус", async () => {
    let nextId = 100;
    const client = {
      post: vi.fn(async (url) => {
        if (url === "/contextinfo") return digestResponse;
        if (url.endsWith("/items")) return { data: { d: { Id: nextId++ } } };
        return { data: {} };
      }),
    };
    const onRowResult = vi.fn();

    const results = await createBulkProblemsPalletItems({ ...common, client, onRowResult });

    const creates = client.post.mock.calls.filter(([url]) => url.endsWith("/items"));
    expect(creates).toHaveLength(2);
    expect(creates.map(([, payload]) => payload)).toEqual([
      expect.objectContaining({
        Title: "8117_808117004022047365",
        THU: "808117004022047365",
        DC_THU: "8117",
        RecipientId: 17,
        Location1: "Не найдена в зоне отгрузки",
        OperationDate: common.operationDateIso,
        Problems: { __metadata: { type: "Collection(Edm.String)" }, results: ["Не найдена"] },
      }),
      expect.objectContaining({ Title: "8117_808117004022002852", RecipientId: 21 }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["success", "success"]);
    expect(results.map((result) => result.itemId)).toEqual([100, 101]);
    expect(onRowResult).toHaveBeenCalledTimes(2);

    const statusUpdates = client.post.mock.calls.filter(([, payload]) => payload?.Status === "Выполнено");
    expect(statusUpdates).toHaveLength(2);
    expect(statusUpdates[0][2].headers["X-HTTP-Method"]).toBe("MERGE");
  });

  it("возвращает результат по каждой строке, а не прерывает всю пачку при ошибке", async () => {
    let createCount = 0;
    const client = {
      post: vi.fn(async (url) => {
        if (url === "/contextinfo") return digestResponse;
        if (url.endsWith("/items")) {
          createCount += 1;
          if (createCount === 2) {
            const error = new Error("bad request");
            error.response = { status: 400, data: { error: { message: { value: "Некорректный получатель" } } } };
            throw error;
          }
          return { data: { d: { Id: 200 } } };
        }
        return { data: {} };
      }),
    };

    const results = await createBulkProblemsPalletItems({ ...common, client });

    expect(results).toEqual([
      expect.objectContaining({ rowId: "row-1", status: "success", itemId: 200 }),
      expect.objectContaining({ rowId: "row-2", status: "failed", retryable: true, message: "Некорректный получатель" }),
    ]);
  });

  it("не предлагает повторять запрос, если сетевой результат неоднозначен", async () => {
    const client = {
      post: vi.fn(async (url) => {
        if (url === "/contextinfo") return digestResponse;
        const error = new Error("timeout");
        throw error;
      }),
    };

    const [result] = await createBulkProblemsPalletItems({ ...common, rows: common.rows.slice(0, 1), client });

    expect(result).toMatchObject({ status: "uncertain", retryable: false });
    expect(result.message).toContain("Проверьте список");
  });
});
