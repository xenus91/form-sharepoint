// @vitest-environment jsdom
// src/features/dob/components/__tests__/richUploadAdapter.test.js
// Адаптер загрузки CKEditor: в тексте должна остаться ССЫЛКА на вложение,
// а не base64 (иначе заявка сохраняется строкой data:image/…).
// Ссылка — в АДРЕСЕ ПОКАЗА: REST-запрос содержимого файла (`…/$value`), потому что
// прямой путь «/sites/…/Attachments/…» прокси отдавал как JSON, и картинка была битой.
import { describe, it, expect, vi, afterEach } from "vitest";

import { makeUploadAdapter, uploadedLink } from "../richUploadAdapter";

function loaderWith(file) {
  return { file: Promise.resolve(file) };
}

const FILE = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
const SAVED = {
  ServerRelativeUrl: "/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/photo.png",
  url: "/dob-api/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/photo.png",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("richUploadAdapter — картинки как вложения", () => {
  it("успешная загрузка → ссылка на вложение (не base64)", async () => {
    vi.stubEnv("DEV", true);
    const onUploadImage = vi.fn().mockResolvedValue(SAVED);
    const adapter = makeUploadAdapter(loaderWith(FILE), onUploadImage);

    const out = await adapter.upload();

    expect(onUploadImage).toHaveBeenCalledWith(FILE);
    expect(out.default).toBe(
      "/dob-api/sites/dob/doblogistic/_api/web/getfilebyserverrelativeurl(" +
      "'/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/photo.png')/$value",
    );
    expect(out.default).not.toMatch(/^data:/);
  });

  it("в prod ссылка — абсолютный адрес сайта", async () => {
    vi.stubEnv("DEV", false);
    const adapter = makeUploadAdapter(loaderWith(FILE), vi.fn().mockResolvedValue(SAVED));
    const out = await adapter.upload();
    expect(out.default).toBe(
      `${window.location.origin}/sites/dob/doblogistic/_api/web/getfilebyserverrelativeurl(` +
      "'/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/photo.png')/$value",
    );
  });

  it("страница может вернуть готовую строку-путь", () => {
    vi.stubEnv("DEV", true);
    expect(uploadedLink("/sites/dob/Lists/L/Attachments/1/a.png")).toBe(
      "/dob-api/sites/dob/_api/web/getfilebyserverrelativeurl(" +
      "'/sites/dob/Lists/L/Attachments/1/a.png')/$value",
    );
    expect(uploadedLink(null)).toBe("");
  });

  it("ошибка загрузки → base64 (текст не теряется)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = makeUploadAdapter(
      loaderWith(FILE),
      vi.fn().mockRejectedValue(new Error("нет прав")),
    );
    const out = await adapter.upload();
    expect(out.default.startsWith("data:image/png;base64,")).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("страница не дала ссылку (null) → base64", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = makeUploadAdapter(loaderWith(FILE), vi.fn().mockResolvedValue(null));
    const out = await adapter.upload();
    expect(out.default.startsWith("data:image/")).toBe(true);
  });
});
