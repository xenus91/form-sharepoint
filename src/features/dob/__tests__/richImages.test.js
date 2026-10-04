// src/features/dob/__tests__/richImages.test.js
// Картинки rich-текста → вложения: разбор src, имя файла, diff удалённых картинок.

import { describe, it, expect } from "vitest";
import { extractImgSrcs, fileNameFromSrc, removedImgSrcs, removedImgSrcsByValues } from "../lib/richImages";

describe("richImages — картинки rich-текста и вложения", () => {
  it("достаёт все src картинок (их может быть несколько)", () => {
    const html = '<p>текст</p><img src="/sites/dob/Lists/L/Attachments/1/a.png"><p>x</p><img src="data:image/png;base64,AAA" alt="">';
    expect(extractImgSrcs(html)).toEqual([
      "/sites/dob/Lists/L/Attachments/1/a.png",
      "data:image/png;base64,AAA",
    ]);
  });

  it("имя вложения из src: без query/fragment и url-encoding; base64 — пусто", () => {
    expect(fileNameFromSrc("/sites/dob/Lists/L/Attachments/7/%D1%84%D0%BE%D1%82%D0%BE%201.png?x=1#y")).toBe("фото 1.png");
    expect(fileNameFromSrc("data:image/png;base64,AAA")).toBe("");
    expect(fileNameFromSrc("")).toBe("");
  });

  it("diff по тексту: только исчезнувшие картинки", () => {
    const before = '<img src="/a.png"><img src="/b.png">';
    const after = '<img src="/b.png"><img src="/c.png">';
    expect(removedImgSrcs(before, after)).toEqual(["/a.png"]);
    expect(removedImgSrcs(before, before)).toEqual([]);
  });

  it("diff по значениям формы: удалённые картинки из любого rich-поля", () => {
    const prev = {
      DescriptionCheckResult: '<p>x</p><img src="/sites/a.png">',
      ChekResult: '<img src="/sites/b.png">',
      ErrorCountValidation: 3,
    };
    const next = {
      DescriptionCheckResult: '<p>x</p>',
      ChekResult: '<img src="/sites/b.png">',
      ErrorCountValidation: 4,
    };
    expect(removedImgSrcsByValues(prev, next)).toEqual(["/sites/a.png"]);
  });
});
