// src/utils/__tests__/apiError.test.js
import { describe, it, expect } from "vitest";
import { describeApiError, extractFieldFromError, apiErrorStatus } from "../apiError";

describe("apiError", () => {
  it("достаёт статус и текст SharePoint", () => {
    const e = { response: { status: 400, data: { error: { message: { value: "Invalid field" } } } } };
    expect(apiErrorStatus(e)).toBe(400);
    expect(describeApiError(e)).toBe("HTTP 400 · Invalid field");
  });

  it("работает с odata.error и с обычной ошибкой", () => {
    expect(describeApiError({ response: { data: { "odata.error": { message: { value: "Nope" } } } } })).toBe("Nope");
    expect(describeApiError(new Error("network down"))).toBe("network down");
  });

  it("достаёт имя поля из английской и русской формулировки", () => {
    expect(
      extractFieldFromError({
        response: { data: { error: { message: { value: "Column 'Location1' does not exist" } } } },
      })
    ).toBe("Location1");
    expect(
      extractFieldFromError({
        response: { data: { error: { message: { value: "Поле «Body» отсутствует" } } } },
      })
    ).toBe("Body");
  });

  it("не падает на пустой ошибке", () => {
    expect(describeApiError(null)).toBe("");
    expect(extractFieldFromError(undefined)).toBe("");
  });
});
