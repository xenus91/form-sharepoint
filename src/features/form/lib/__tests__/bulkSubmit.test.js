import { describe, expect, it, vi } from "vitest";
import { createBulkProblemsPalletItems } from "../bulkSubmit";
import { SHAREPOINT_BATCH_SIZE } from "../sharepointBatch";

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

function makeBatchResponse(items, boundary = "batchresponse_test") {
  const lines = [];
  items.forEach((item, index) => {
    const changesetBoundary = `changesetresponse_${index + 1}`;
    const statusText = item.status === 201 ? "Created" : item.status === 400 ? "Bad Request" : "Error";
    lines.push(
      `--${boundary}`,
      `Content-Type: multipart/mixed; boundary="${changesetBoundary}"`,
      "",
      `--${changesetBoundary}`,
      "Content-Type: application/http",
      "Content-Transfer-Encoding: binary",
      `Content-ID: ${item.contentId ?? index + 1}`,
      "",
      `HTTP/1.1 ${item.status} ${statusText}`,
      "Content-Type: application/json;odata=verbose",
      "",
      JSON.stringify(item.body),
      `--${changesetBoundary}--`,
    );
  });
  lines.push(`--${boundary}--`);
  return {
    status: 200,
    data: lines.join("\r\n"),
    headers: { "content-type": `multipart/mixed; boundary=${boundary}` },
  };
}

const successfulItem = (id) => ({ status: 201, body: { d: { Id: id } } });

describe("createBulkProblemsPalletItems", () => {
  it("создаёт каждую заявку в SharePoint $batch и задаёт итоговый статус при создании", async () => {
    const client = {
      post: vi.fn(async () => makeBatchResponse([successfulItem(100), successfulItem(101)])),
    };
    const onRowResult = vi.fn();

    const results = await createBulkProblemsPalletItems({ ...common, client, onRowResult });

    expect(client.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = client.post.mock.calls[0];
    expect(url).toBe("/$batch");
    expect(typeof body).toBe("string");
    expect(config.headers.Accept).toBe("application/json;odata=verbose");
    expect(config.headers["Content-Type"]).toMatch(/^multipart\/mixed; boundary=/);
    expect(config.transformRequest).toHaveLength(1);
    expect(body.match(/Content-ID: /g)).toHaveLength(2);
    expect(body.match(/Content-Type: multipart\/mixed; boundary=/g)).toHaveLength(2);
    expect(body).toContain("POST web/lists/getbytitle('ProblemsPallet')/items HTTP/1.1");

    const payloads = body.split(/\r?\n/)
      .filter((line) => line.startsWith("{") && line.endsWith("}"))
      .map((line) => JSON.parse(line));
    expect(payloads).toEqual([
      expect.objectContaining({
        Title: "8117_808117004022047365",
        THU: "808117004022047365",
        DC_THU: "8117",
        RecipientId: 17,
        Location1: "Не найдена в зоне отгрузки",
        OperationDate: common.operationDateIso,
        Status: "Выполнено",
        Problems: { __metadata: { type: "Collection(Edm.String)" }, results: ["Не найдена"] },
      }),
      expect.objectContaining({ Title: "8117_808117004022002852", RecipientId: 21, Status: "Выполнено" }),
    ]);
    expect(body).not.toContain("X-HTTP-Method: MERGE");
    expect(results.map((result) => result.status)).toEqual(["success", "success"]);
    expect(results.map((result) => result.itemId)).toEqual([100, 101]);
    expect(onRowResult).toHaveBeenCalledTimes(2);
  });

  it("сохраняет частичные результаты: 4xx одной операции можно безопасно повторить", async () => {
    const client = {
      post: vi.fn(async () => makeBatchResponse([
        successfulItem(200),
        { status: 400, body: { error: { message: { value: "Некорректный получатель" } } } },
      ])),
    };

    const results = await createBulkProblemsPalletItems({ ...common, client });

    expect(results).toEqual([
      expect.objectContaining({ rowId: "row-1", status: "success", itemId: 200, retryable: false }),
      expect.objectContaining({
        rowId: "row-2",
        status: "failed",
        itemId: null,
        retryable: true,
        message: "Некорректный получатель",
      }),
    ]);
  });

  it("делит отправку на пакеты максимум по 15 элементов", async () => {
    const rows = Array.from({ length: 17 }, (_, index) => ({
      id: `row-${index + 1}`,
      eoNumber: `808117004022047${String(index).padStart(3, "0")}`,
      recipientId: 17 + index,
    }));
    let nextId = 300;
    const client = {
      post: vi.fn(async (_url, body) => {
        const count = (body.match(/Content-ID: /g) || []).length;
        return makeBatchResponse(Array.from({ length: count }, () => successfulItem(nextId++)));
      }),
    };

    const results = await createBulkProblemsPalletItems({ ...common, rows, client });

    expect(SHAREPOINT_BATCH_SIZE).toBe(15);
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(client.post.mock.calls.map(([, body]) => (body.match(/Content-ID: /g) || []).length)).toEqual([15, 2]);
    expect(results).toHaveLength(17);
    expect(results.map((result) => result.itemId)).toEqual(Array.from({ length: 17 }, (_, index) => 300 + index));
    expect(results.every((result) => result.status === "success")).toBe(true);
  });

  it("не предлагает повторять строки, если результат всего пакета неоднозначен", async () => {
    const client = { post: vi.fn(async () => { throw new Error("timeout"); }) };

    const results = await createBulkProblemsPalletItems({ ...common, client });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "uncertain" && result.retryable === false)).toBe(true);
    expect(results[0].message).toContain("Проверьте список");
  });

  it("помечает отсутствующий ответ операции как неоднозначный", async () => {
    const client = {
      post: vi.fn(async () => makeBatchResponse([successfulItem(400)])),
    };

    const results = await createBulkProblemsPalletItems({ ...common, client });

    expect(results[0]).toMatchObject({ status: "success", itemId: 400 });
    expect(results[1]).toMatchObject({ status: "uncertain", retryable: false });
  });
});
