import { describe, expect, it, vi } from "vitest";
import { findOtherProblemsForEos } from "../bulkConflictCheck";

function getBatchResponse(resultBodies, boundary = "batchresponse_conflicts") {
  const lines = [];
  resultBodies.forEach((body) => {
    lines.push(
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-Transfer-Encoding: binary",
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json;odata=verbose",
      "",
      JSON.stringify({ d: { results: body } }),
    );
  });
  lines.push(`--${boundary}--`);
  return {
    status: 200,
    data: lines.join("\r\n"),
    headers: { "content-type": `multipart/mixed; boundary=${boundary}` },
  };
}

const conflict = {
  Id: 92,
  THU: "808117004022047365",
  RecipientId: 17,
  DC_THU: "8117",
  Created: "2026-10-09T09:00:00Z",
  Problems: { results: ["Повреждение"] },
  Location1: "Зона отгрузки",
  Author: { Title: "Оператор" },
};
const notFoundDuplicate = {
  Id: 93,
  THU: "808117004022047365",
  RecipientId: 17,
  DC_THU: "9999",
  Created: "2026-10-10T06:00:00Z",
  Problems: { results: ["Не найдена"] },
  Location1: "Зона отгрузки",
};

describe("findOtherProblemsForEos", () => {
  it("одним $batch проверяет конфликт и дубликат по паре ЕО-получатель", async () => {
    const client = {
      post: vi.fn(async () => getBatchResponse([[conflict, notFoundDuplicate], []])),
    };
    const rows = [
      { id: "row-1", eoNumber: "808117004022047365", recipientId: 17 },
      { id: "row-2", eoNumber: "808117004022002852", recipientId: 21 },
    ];
    const now = Date.parse("2026-10-10T12:00:00.000Z");

    const results = await findOtherProblemsForEos({ rows, dcThu: "8117", client, now });

    expect(client.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = client.post.mock.calls[0];
    expect(url).toBe("/$batch");
    expect((body.match(/(?:^|\r?\n)GET web\/lists\/getbytitle\('ProblemsPallet'\)\/items\?/g) || []).length).toBe(2);
    expect(body).not.toContain("Content-ID:");
    expect(body).toContain("808117004022047365");
    expect(body).toContain("Created%20ge%20datetime");
    expect(body).not.toContain("DC_THU%20eq");
    expect(config.headers.Accept).toBe("application/json;odata=verbose");
    expect(results.get("row-1")).toEqual({
      otherProblem: conflict,
      notFoundDuplicate,
    });
    expect(results.get("row-2")).toEqual({ otherProblem: null, notFoundDuplicate: null });
  });

  it("разбивает проверки на пакеты максимум по 15 ЕО", async () => {
    const client = {
      post: vi.fn(async (_url, body) => {
        const count = (body.match(/(?:^|\r?\n)GET web\/lists\/getbytitle\('ProblemsPallet'\)\/items\?/g) || []).length;
        return getBatchResponse(Array.from({ length: count }, () => []));
      }),
    };
    const rows = Array.from({ length: 16 }, (_, index) => ({
      id: `row-${index + 1}`,
      eoNumber: `808117004022047${String(index).padStart(3, "0")}`,
      recipientId: index + 1,
    }));

    const results = await findOtherProblemsForEos({ rows, dcThu: "8117", client });

    expect(client.post).toHaveBeenCalledTimes(2);
    expect(client.post.mock.calls.map(([, body]) => (
      body.match(/(?:^|\r?\n)GET web\/lists\/getbytitle\('ProblemsPallet'\)\/items\?/g) || []
    ).length)).toEqual([15, 1]);
    expect(results.size).toBe(16);
    expect([...results.values()].every((value) =>
      value.otherProblem === null && value.notFoundDuplicate === null,
    )).toBe(true);
  });

  it("не делает запрос без РЦ и не блокирует отправку при ошибке проверки", async () => {
    const client = { post: vi.fn(async () => { throw new Error("offline"); }) };
    const rows = [{ id: "row-1", eoNumber: "808117004022047365", recipientId: 17 }];
    const missingOffice = await findOtherProblemsForEos({ rows, dcThu: "", client });
    expect(client.post).not.toHaveBeenCalled();
    expect(missingOffice.get("row-1")).toEqual({ otherProblem: null, notFoundDuplicate: null });

    const result = await findOtherProblemsForEos({ rows, dcThu: "8117", client });
    expect(result.get("row-1")).toEqual({ otherProblem: null, notFoundDuplicate: null });
  });
});
