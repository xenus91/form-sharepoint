// @vitest-environment jsdom
// src/features/dob/__tests__/attachmentUrl.test.js
// Разные адреса для ХРАНЕНИЯ и для ПОКАЗА картинок-вложений.
//
// В SharePoint уходит серверный путь («/sites/…»), а в браузере картинка должна
// открываться: в dev — через прокси «/dob-api», в prod — абсолютным origin.
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
  it("в dev показывает серверный путь через прокси /dob-api", () => {
    vi.stubEnv("DEV", true);
    expect(attachmentDisplayUrl("/sites/dob/Lists/L/Attachments/5/a.png")).toBe(
      "/dob-api/sites/dob/Lists/L/Attachments/5/a.png",
    );
  });

  it("в prod показывает серверный путь абсолютным адресом (origin)", () => {
    vi.stubEnv("DEV", false);
    expect(attachmentDisplayUrl("/sites/dob/Lists/L/Attachments/5/a.png")).toBe(
      `${window.location.origin}/sites/dob/Lists/L/Attachments/5/a.png`,
    );
  });

  it("готовые адреса не переписывает (прокси, абсолютные, data:)", () => {
    vi.stubEnv("DEV", true);
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
    expect(toDisplayImages('<img src="/sites/a.png">')).toBe('<img src="/dob-api/sites/a.png">');
  });
});
