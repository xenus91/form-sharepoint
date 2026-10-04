// @vitest-environment jsdom
// src/features/dob/__tests__/attachmentUrl.test.js
// Разные адреса для ХРАНЕНИЯ и для ПОКАЗА картинок-вложений.
//
// В SharePoint уходит серверный путь («/sites/…»), а в браузере картинка должна
// открываться: адрес показа — REST-запрос содержимого файла
// («…/_api/web/getfilebyserverrelativeurl('<путь>')/$value»), в dev через прокси
// «/dob-api», в prod с origin страницы. Именно `$value` качается бинарём: прямой
// путь «/sites/…/Attachments/…» прокси отдавал как JSON, и картинка была битой.
import { describe, it, expect, afterEach, vi } from "vitest";

import {
  attachmentDisplayUrl,
  attachmentStorageUrl,
  attachmentServerPath,
  toDisplayImages,
  toStorageImages,
} from "../lib/attachmentUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("attachmentUrl — хранение vs показ", () => {
  it("в dev показывает вложение REST-запросом содержимого через прокси /dob-api", () => {
    vi.stubEnv("DEV", true);
    expect(attachmentDisplayUrl("/sites/dob/doblogistic/Lists/DobLogistic/Attachments/5/a.png")).toBe(
      "/dob-api/sites/dob/doblogistic/_api/web/getfilebyserverrelativeurl(" +
      "'/sites/dob/doblogistic/Lists/DobLogistic/Attachments/5/a.png')/$value",
    );
  });

  it("в prod показывает вложение абсолютным адресом (origin) с $value", () => {
    vi.stubEnv("DEV", false);
    expect(attachmentDisplayUrl("/sites/obrazceo/Lists/List/Attachments/737/a.png")).toBe(
      `${window.location.origin}/sites/obrazceo/_api/web/getfilebyserverrelativeurl(` +
      "'/sites/obrazceo/Lists/List/Attachments/737/a.png')/$value",
    );
  });

  it("имена с пробелами/кириллицей кодируются по сегментам (без « и # в пути)", () => {
    vi.stubEnv("DEV", true);
    const url = attachmentDisplayUrl("/sites/obrazceo/Lists/List/Attachments/737/фото 1.png");
    expect(url).toContain("getfilebyserverrelativeurl(");
    expect(url).toContain("%D1%84%D0%BE%D1%82%D0%BE%201.png");
    expect(url.endsWith(")/$value")).toBe(true);
    // обратная операция возвращает исходный серверный путь
    expect(attachmentStorageUrl(url)).toBe("/sites/obrazceo/Lists/List/Attachments/737/фото 1.png");
  });

  it("REST-адрес $value приводится обратно к серверному пути (несколько раз подряд)", () => {
    vi.stubEnv("DEV", true);
    const stored = "/sites/dob/Lists/L/Attachments/5/a.png";
    const shown = attachmentDisplayUrl(stored);
    expect(attachmentStorageUrl(shown)).toBe(stored);
    expect(attachmentStorageUrl(attachmentDisplayUrl(shown))).toBe(stored);
  });

  it("готовые адреса не переписывает (прокси, абсолютные, data:)", () => {
    vi.stubEnv("DEV", true);
    const viaProxy = "/dob-api/sites/dob/doblogistic/_api/web/getfilebyserverrelativeurl('/sites/dob/doblogistic/Lists/L/Attachments/5/a.png')/$value";
    expect(attachmentDisplayUrl(viaProxy)).toBe(viaProxy);
    expect(attachmentDisplayUrl("/dob-api/sites/x/a.png")).toBe("/dob-api/sites/x/a.png");
    expect(attachmentDisplayUrl("https://portal.lenta.com/sites/x/a.png")).toBe(
      "https://portal.lenta.com/sites/x/a.png",
    );
    expect(attachmentDisplayUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(attachmentDisplayUrl("")).toBe("");
  });

  it("в хранилище остаётся серверный путь без прокси и origin", () => {
    vi.stubEnv("DEV", true);
    expect(attachmentStorageUrl("/dob-api/sites/dob/Lists/L/Attachments/5/a.png")).toBe(
      "/sites/dob/Lists/L/Attachments/5/a.png",
    );
    expect(attachmentStorageUrl("/sites/dob/Lists/L/Attachments/5/a.png")).toBe(
      "/sites/dob/Lists/L/Attachments/5/a.png",
    );
    expect(attachmentStorageUrl(`${window.location.origin}/sites/dob/a.png`)).toBe(
      "/sites/dob/a.png",
    );
    expect(attachmentStorageUrl("https://portal.lenta.com/sites/dob/a.png")).toBe(
      "https://portal.lenta.com/sites/dob/a.png",
    );
    expect(attachmentStorageUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
  });

  it("attachmentServerPath берёт ServerRelativeUrl, иначе src", () => {
    expect(
      attachmentServerPath({ ServerRelativeUrl: "/sites/dob/Lists/L/Attachments/5/a.png" }),
    ).toBe("/sites/dob/Lists/L/Attachments/5/a.png");
    expect(attachmentServerPath({ src: "/dob-api/sites/dob/Lists/L/Attachments/5/b.png" })).toBe(
      "/sites/dob/Lists/L/Attachments/5/b.png",
    );
    expect(attachmentServerPath(null)).toBe("");
  });

  it("toStorageImages/toDisplayImages проходят по всем <img> текста", () => {
    vi.stubEnv("DEV", true);
    const html = '<p>x</p><img src="/dob-api/sites/a.png"><img src="/sites/b.png">';
    expect(toStorageImages(html)).toBe('<p>x</p><img src="/sites/a.png"><img src="/sites/b.png">');
    const stored = "/sites/dob/Lists/L/Attachments/5/a.png";
    const expected = `<img src="/dob-api/sites/dob/_api/web/getfilebyserverrelativeurl('${stored}')/$value">`;
    expect(toDisplayImages(`<img src="${stored}">`)).toBe(expected);
  });
});
