// @vitest-environment node
// src/features/dob/__tests__/proxyBinary.test.js
//
// Прокси-сервер SharePoint (proxy-server.cjs) различает JSON `_api`-запросы и
// ПРЯМЫЕ ссылки на файлы. Картинка из rich-текста открывается по прямой ссылке
// (`/sites/…/Lists/…/Attachments/<id>/<file>`), и если качать её как JSON, в
// браузер приезжает битый файл — в редакторе картинка выглядит «сломанной».
import { describe, it, expect } from "vitest";

const { isBinaryRequest } = await import("../../../../scripts/spProxyUrl.cjs");

describe("proxy: бинарные и JSON-запросы", () => {
  it("прямая ссылка на картинку/файл вложения — бинарь", () => {
    expect(isBinaryRequest("/sites/obrazceo/Lists/List/Attachments/737/image_1.png")).toBe(true);
    expect(isBinaryRequest("/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/a.jpg?v=1")).toBe(true);
    expect(isBinaryRequest("https://portal.lenta.com/sites/obrazceo/Lists/List/Attachments/737/pic.webp#x")).toBe(true);
    expect(isBinaryRequest("/sites/dob/doblogistic/Lists/DobLogistic/Attachments/7/act.pdf")).toBe(true);
  });

  it("REST-доступ к содержимому файла — бинарь", () => {
    expect(isBinaryRequest("/_api/web/getfilebyserverrelativeurl('/sites/dob/Lists/L/Attachments/7/a.png')/$value")).toBe(true);
    expect(isBinaryRequest("/_api/web/lists(guid'x')/items(7)/AttachmentFiles('a.png')/OpenBinaryStream")).toBe(true);
  });

  it("_api-запросы (метаданные) — не бинарь, даже если в URL есть имя файла", () => {
    expect(isBinaryRequest("/_api/web/lists(guid'x')/items(7)/AttachmentFiles('a.png')")).toBe(false);
    expect(isBinaryRequest("/_api/web/lists(guid'x')/items?$filter=FileLeafRef eq 'x.pdf'")).toBe(false);
    expect(isBinaryRequest("/_api/web/lists(guid'x')/items(7)/AttachmentFiles/add(FileName='a.png')")).toBe(false);
    expect(isBinaryRequest("/sites/dob/doblogistic/_api/web/lists(guid'x')/items(7)")).toBe(false);
  });

  it("папка и пустой путь — не бинарь", () => {
    expect(isBinaryRequest("/sites/obrazceo/Lists/List/Attachments/737/")).toBe(false);
    expect(isBinaryRequest("")).toBe(false);
  });

  it("прямая страница .aspx — тоже «файл»: ответ отдаётся как есть, с Content-Type", () => {
    expect(isBinaryRequest("/sites/obrazceo/SitePages/home.aspx")).toBe(true);
  });
});
