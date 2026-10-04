// @vitest-environment jsdom
// src/features/dob/__tests__/materializeRichImages.test.js
// Материализация картинок rich-текста перед сохранением: base64 превращается в
// ВЛОЖЕНИЕ, в тексте остаётся ссылка «/sites/…/Attachments/<id>/<file>».
import { describe, it, expect, vi } from "vitest";

import {
  fieldsWithBase64,
  materializeRichHtml,
  materializeRichValues,
} from "../lib/materializeRichImages";

const DATA_1 = "data:image/png;base64,AQID";
const DATA_2 = "data:image/jpeg;base64,BAUG";
const LINK_1 = "/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/image_1.png";
const LINK_2 = "/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/image_2.jpg";

describe("materializeRichHtml — base64 → вложение", () => {
  it("загружает каждую base64-картинку и подставляет ссылку вложения", async () => {
    const upload = vi.fn(async (file) => ({
      ServerRelativeUrl: `/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/${file.name}`,
      FileName: file.name,
    }));
    const uploaded = [];
    const html = `<p>текст</p><img src="${DATA_1}"><img src="${DATA_2}">`;

    const out = await materializeRichHtml(html, {
      upload,
      onUploaded: (saved, link) => uploaded.push(link),
    });

    expect(upload).toHaveBeenCalledTimes(2);
    expect(out).not.toContain("data:image");
    expect(out).toContain("/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/");
    expect(out.match(/<img/g)).toHaveLength(2);
    expect(uploaded).toHaveLength(2);
    expect(uploaded[0]).toMatch(/^\/sites\/dob\//);
  });

  it("адрес dev-прокси приводится к серверному пути (без base64)", async () => {
    const out = await materializeRichHtml(
      '<img src="/dob-api/sites/dob/Lists/L/Attachments/1/a.png">',
      { upload: vi.fn() },
    );
    expect(out).toBe('<img src="/sites/dob/Lists/L/Attachments/1/a.png">');
  });

  it("ошибка загрузки: base64 остаётся, приходит предупреждение (текст не теряется)", async () => {
    const onError = vi.fn();
    const out = await materializeRichHtml(`<img src="${DATA_1}">`, {
      upload: vi.fn().mockRejectedValue(new Error("нет прав")),
      onError,
    });
    expect(out).toContain(DATA_1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("текст без картинок не трогаем", async () => {
    const upload = vi.fn();
    expect(await materializeRichHtml("<p>просто текст</p>", { upload })).toBe("<p>просто текст</p>");
    expect(upload).not.toHaveBeenCalled();
  });

  it("без загрузчика base64 остаётся как есть (ничего не теряем)", async () => {
    const out = await materializeRichHtml(`<img src="${DATA_1}">`, {});
    expect(out).toContain(DATA_1);
  });
});

describe("materializeRichValues — словарь значений формы", () => {
  it("обрабатывает только rich-значения с картинками", async () => {
    const upload = vi.fn();
    const values = {
      Title: "Заголовок",
      DescriptionCheckResult: `<p>описание</p><img src="${DATA_1}">`,
      ErrorCount: "3",
    };
    const out = await materializeRichValues(values, { upload: vi.fn(async (file) => ({ ServerRelativeUrl: LINK_1, FileName: file.name })) });
    expect(out.Title).toBe("Заголовок");
    expect(out.ErrorCount).toBe("3");
    expect(out.DescriptionCheckResult).toContain(LINK_1);
    expect(out.DescriptionCheckResult).not.toContain("data:image");
    expect(upload).not.toHaveBeenCalled();
  });

  it("если менять нечего — возвращает исходный объект", async () => {
    const values = { Title: "T", DescriptionCheckResult: "<p>x</p>" };
    expect(await materializeRichValues(values, {})).toBe(values);
  });

  it("адреса картинок через dev-прокси приводятся к серверному виду", async () => {
    const values = {
      Title: "T",
      ChekResult: '<IMG SRC="/dob-api/sites/dob/Lists/L/Attachments/1/a.png">',
    };
    const out = await materializeRichValues(values, {});
    expect(out.ChekResult).toBe('<IMG SRC="/sites/dob/Lists/L/Attachments/1/a.png">');
  });
});

describe("fieldsWithBase64 — где остался base64", () => {
  it("находит поля с data:image и игнорирует остальные", () => {
    const values = {
      Title: "Заявка",
      ChekResult: `<p>x</p><img src="${DATA_1}">`,
      DescriptionCheckResult: `<p>текст</p><img src="${LINK_1}">`,
      ErrorCount: "2",
    };
    expect(fieldsWithBase64(values)).toEqual(["ChekResult"]);
  });

  it("после успешной материализации base64 не остаётся", async () => {
    const values = { ChekResult: `<p>x</p><img src="${DATA_1}">` };
    const out = await materializeRichValues(values, {
      upload: vi.fn(async (file) => ({ ServerRelativeUrl: LINK_1, FileName: file.name })),
    });
    expect(fieldsWithBase64(out)).toEqual([]);
  });

  it("если загрузка не удалась — поле с base64 видно вызывающему", async () => {
    const values = { ChekResult: `<p>x</p><img src="${DATA_1}">` };
    const out = await materializeRichValues(values, {
      upload: vi.fn(async () => { throw new Error("нет прав"); }),
      onError: vi.fn(),
    });
    expect(fieldsWithBase64(out)).toEqual(["ChekResult"]);
  });

  it("пустой/некорректный словарь — пустой список", () => {
    expect(fieldsWithBase64()).toEqual([]);
    expect(fieldsWithBase64({ A: null, B: 5 })).toEqual([]);
  });

  it("две картинки в одном поле — два вложения", async () => {
    const upload = vi.fn(async (file) => ({ ServerRelativeUrl: file.type === "image/png" ? LINK_1 : LINK_2, FileName: file.name }));
    const html = `<p>x</p><img src="${DATA_1}"><img src="${DATA_2}">`;
    const out = await materializeRichValues(
      { DescriptionCheckResult: html },
      { upload: async (file) => upload(await file) },
    );
    expect(out.DescriptionCheckResult).toContain(LINK_1);
    expect(out.DescriptionCheckResult).toContain(LINK_2);
    expect(out.DescriptionCheckResult).not.toContain("data:image");
  });
});
