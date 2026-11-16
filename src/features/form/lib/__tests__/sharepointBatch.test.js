import { describe, expect, it } from "vitest";
import {
  buildSharePointBatchBody,
  matchSharePointBatchResults,
  parseSharePointBatchResponse,
  SHAREPOINT_BATCH_SIZE,
} from "../sharepointBatch";

const multipartResponse = `--batchresponse_test
Content-Type: multipart/mixed; boundary="changesetresponse_one"

--changesetresponse_one
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: 1

HTTP/1.1 201 Created
Content-Type: application/json;odata=verbose

{"d":{"Id":501}}
--changesetresponse_one--
--batchresponse_test
Content-Type: multipart/mixed; boundary="changesetresponse_two"

--changesetresponse_two
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: 2

HTTP/1.1 400 Bad Request
Content-Type: application/json;odata=verbose

{"error":{"message":{"value":"Некорректный получатель"}}}
--changesetresponse_two--
--batchresponse_test--
`;

describe("SharePoint $batch", () => {
  it("строит отдельный changeset на каждую запись и относительные REST URI", () => {
    const request = buildSharePointBatchBody([
      {
        method: "POST",
        url: "/web/lists/getbytitle('ProblemsPallet')/items",
        changeSet: true,
        contentId: "1",
        headers: { "Content-Type": "application/json;odata=verbose" },
        body: { Title: "one" },
      },
      {
        method: "POST",
        url: "/web/lists/getbytitle('ProblemsPallet')/items",
        changeSet: true,
        contentId: "2",
        body: { Title: "two" },
      },
    ], { boundary: "batch_test" });

    expect(request.contentType).toBe("multipart/mixed; boundary=batch_test");
    expect(request.body).toContain("--batch_test_changeset_1");
    expect(request.body).toContain("--batch_test_changeset_2");
    expect(request.body).toContain("POST web/lists/getbytitle('ProblemsPallet')/items HTTP/1.1");
    expect(request.body.match(/Content-ID: /g)).toHaveLength(2);
    expect(request.body.match(/Content-Type: multipart\/mixed; boundary=/g)).toHaveLength(2);
    expect(request.body).toContain('{"Title":"one"}');
    expect(request.body).toContain('{"Title":"two"}');
  });

  it("оставляет GET-запросы верхнеуровневыми и задаёт предел 15 операций", () => {
    const request = buildSharePointBatchBody([
      {
        method: "GET",
        url: "web/lists/getbytitle('ProblemsPallet')/items?$filter=THU%20eq%20'123'",
        changeSet: false,
        includeContentId: false,
        contentId: "1",
        headers: { Accept: "application/json;odata=verbose" },
      },
    ], { boundary: "batch_get" });

    expect(SHAREPOINT_BATCH_SIZE).toBe(15);
    expect(request.body).toContain("Content-Type: application/http");
    expect(request.body).not.toContain("Content-ID:");
    expect(request.body).not.toContain("changeset");
    expect(request.body).toContain("GET web/lists/getbytitle('ProblemsPallet')/items?");
  });

  it("разбирает ответы вложенных changeset и сохраняет Content-ID и HTTP-статус", () => {
    const results = parseSharePointBatchResponse(
      multipartResponse,
      'multipart/mixed; boundary="batchresponse_test"',
    );

    expect(results).toEqual([
      expect.objectContaining({
        contentId: "1",
        status: 201,
        body: { d: { Id: 501 } },
      }),
      expect.objectContaining({
        contentId: "2",
        status: 400,
        body: { error: { message: { value: "Некорректный получатель" } } },
      }),
    ]);
  });

  it("сопоставляет ответы по Content-ID независимо от порядка, затем использует fallback по порядку", () => {
    const operations = [{ contentId: "1" }, { contentId: "2" }];
    const outOfOrder = [
      { contentId: "2", status: 400 },
      { contentId: "1", status: 201 },
    ];
    expect(matchSharePointBatchResults(outOfOrder, operations).map((result) => result.status))
      .toEqual([201, 400]);
    expect(matchSharePointBatchResults([{ status: 201 }, { status: 400 }], operations)
      .map((result) => result.status)).toEqual([201, 400]);
    // При неполном ответе без Content-ID нельзя безопасно определить,
    // к какой строке относится полученный результат.
    expect(matchSharePointBatchResults([{ status: 201 }], operations)).toEqual([null, null]);
  });
});
