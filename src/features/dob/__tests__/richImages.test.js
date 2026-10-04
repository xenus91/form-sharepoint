// src/features/dob/__tests__/richImages.test.js
// Картинки rich-текста → вложения: разбор src, имя файла, diff удалённых картинок.

import { describe, it, expect } from "vitest";
import { extractImgSrcs, fileNameFromSrc, removeImgByFileName, removedImgSrcs, removedImgSrcsByValues, mapImgSrcs, dataUrlSrcs, replaceImgSrc, dataUrlToFile } from "../lib/richImages";

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

  it("removeImgByFileName убирает картинку удалённого вложения (и /sites, и /dob-api)", () => {
    const html =
      '<p>отчёт</p>' +
      '<img src="/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/фото%201.png">' +
      '<img src="/dob-api/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/other.png">';
    const out = removeImgByFileName(html, "фото 1.png");
    expect(out).not.toContain("фото%201.png");
    expect(out).toContain("other.png");
    expect(out).toContain("<p>отчёт</p>");
    // чужое имя/пустое имя — текст не трогаем
    expect(removeImgByFileName(html, "нет-такого.png")).toBe(html);
    expect(removeImgByFileName(html, "")).toBe(html);
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

describe("richImages — base64 → вложение (материализация перед сохранением)", () => {
  it("mapImgSrcs меняет адреса только у <img>", () => {
    const html = '<p><a href="/x.png">a</a></p><img src="/a.png"><img src=\"/b.png\">';
    expect(mapImgSrcs(html, (src) => `pre${src}`)).toBe(
      '<p><a href="/x.png">a</a></p><img src="pre/a.png"><img src="pre/b.png">',
    );
    expect(mapImgSrcs("", () => "x")).toBe("");
  });

  it("dataUrlSrcs достаёт уникальные base64-картинки", () => {
    const html = '<img src="data:image/png;base64,AAA"><img src="/a.png"><img src="data:image/png;base64,AAA">';
    expect(dataUrlSrcs(html)).toEqual(["data:image/png;base64,AAA"]);
  });

  it("replaceImgSrc подменяет конкретный src", () => {
    const html = '<img src="data:image/png;base64,AAA"><img src="/a.png">';
    expect(replaceImgSrc(html, "data:image/png;base64,AAA", "/sites/x/a.png")).toBe(
      '<img src="/sites/x/a.png"><img src="/a.png">',
    );
  });

  it("dataUrlToFile превращает base64 в File с типом и именем", () => {
    const file = dataUrlToFile("data:image/png;base64,AQID", () => "image_1.png");
    expect(file).toBeTruthy();
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("image_1.png");
    expect(dataUrlToFile("/sites/a.png")).toBeNull();
  });
});
