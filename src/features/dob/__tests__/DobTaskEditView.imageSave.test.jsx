// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.imageSave.test.jsx
//
// РАУНД 9: при сохранении заявки изображения rich-текста уходят НЕ как base64, а
// ссылкой на вложение («/sites/…/Attachments/<id>/<file>»). Если в тексте остались
// data:image (например, загрузка не удалась или значение пришло из старой версии),
// форма перед MERGE сама загружает их вложениями и подставляет ссылки.
//
// Плюс проверяем обратное направление: сохранённая ссылка показывается в редакторе
// рабочим адресом (dev — через прокси «/dob-api»).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const LIST_GUID = "21b5b544-bd98-4b06-891f-c5a137331394";
const BASE64 = "data:image/png;base64,AQID";

const LIST_FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  { InternalName: "ChekResult", Title: "Результат проверки", TypeAsString: "Note", RichText: true },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["В работе", "Завершена"] } },
];

let itemValue = "";
let attachmentsValue = [];

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFields: vi.fn(async () => LIST_FIELDS),
  getDobItem: vi.fn(async () => ({
    Id: 77,
    Title: "Заявка ДОБ",
    ContentTypeId: "0x0100ABCDEF1234567890",
    Status: "В работе",
    ChekResult: itemValue,
  })),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async (id, file) => ({
    ServerRelativeUrl: `/sites/dob/doblogistic/Lists/DobLogistic/Attachments/${id}/${file.name}`,
    FileName: file.name,
    url: `/dob-api/sites/dob/doblogistic/Lists/DobLogistic/Attachments/${id}/${file.name}`,
    src: `/dob-api/sites/dob/doblogistic/Lists/DobLogistic/Attachments/${id}/${file.name}`,
  })),
  getDobAttachments: vi.fn(async () => attachmentsValue),
  deleteDobAttachment: vi.fn(async (_id, fileName) => {
    attachmentsValue = attachmentsValue.filter((a) => a.FileName !== fileName);
    return {};
  }),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
}));

vi.mock("../components/RichEditor", () => ({
  default: ({ value, onChange, footer }) => (
    <div>
      <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
      {footer}
    </div>
  ),
}));

vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({ default: () => null }));

const { updateDobItem, uploadDobAttachment, deleteDobAttachment } = await import("../api/dobApi");
const { default: DobTaskEditView } = await import("../DobTaskEditView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const settle = async (ms = 120) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

async function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={createTheme()}>
          <NotificationsProvider>
            <DobTaskEditView id={77} listGuid={LIST_GUID} onBackHash="#dob_tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(160);
  return { host, root };
}

function clickSave(host) {
  const btn = Array.from(host.querySelectorAll("button")).find((b) => /Сохранить/.test(b.textContent || ""));
  expect(btn).toBeTruthy();
  act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

describe("DobTaskEditView — сохранение картинок ссылкой на вложение", () => {
  beforeEach(() => {
    window.location.hash = `#dob_tasks/77?list=${LIST_GUID}`;
    document.body.innerHTML = "";
    updateDobItem.mockClear();
    uploadDobAttachment.mockClear();
    deleteDobAttachment.mockClear();
    itemValue = "";
    attachmentsValue = [];
  });

  it("base64 в тексте → загрузка вложением, в MERGE уходит ссылка /sites/…", async () => {
    itemValue = `<p>Проверено</p><img src="${BASE64}">`;
    const { host } = await renderForm();

    clickSave(host);
    await settle(200);

    expect(uploadDobAttachment).toHaveBeenCalledTimes(1);
    expect(updateDobItem).toHaveBeenCalled();
    const body = updateDobItem.mock.calls.at(-1)[1];
    const savedHtml = String(body.ChekResult ?? body.OData_ChekResult ?? "");
    expect(savedHtml).toContain("/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/");
    expect(savedHtml).not.toContain("data:image");
    expect(savedHtml).not.toContain("/dob-api/");
  });

  it("сохранённая ссылка показывается в редакторе рабочим адресом (dev — /dob-api)", async () => {
    itemValue = '<p>Проверено</p><img src="/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/a.png">';
    const { host } = await renderForm();
    const editor = host.querySelector('[data-testid="rich-editor"]');
    expect(editor.value).toContain("/dob-api/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/a.png");
  });

  it("если картинок нет — вложения не загружаются, текст сохраняется как есть", async () => {
    itemValue = "<p>Просто текст</p>";
    const { host } = await renderForm();
    clickSave(host);
    await settle(200);
    expect(uploadDobAttachment).not.toHaveBeenCalled();
  });

  it("картинку не удалось загрузить — сохранение НЕ выполняется (base64 в SharePoint не уходит)", async () => {
    itemValue = `<p>Проверено</p><img src="${BASE64}">`;
    uploadDobAttachment.mockRejectedValueOnce(new Error("нет прав"));
    const { host } = await renderForm();

    clickSave(host);
    await settle(260);

    expect(uploadDobAttachment).toHaveBeenCalledTimes(1);
    // В SharePoint не уходит ни base64, ни битая ссылка: форму можно сохранить
    // повторно, текст в редакторе остаётся нетронутым.
    expect(updateDobItem).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Изображение не удалось сохранить вложением");
    expect(host.querySelector('[data-testid="rich-editor"]').value).toContain(BASE64);
  });

  it("каскад: удалили вложение из блока → картинка уходит из rich-текста", async () => {
    const serverRelative = "/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/photo.png";
    itemValue = `<p>отчёт</p><img src="${serverRelative}">`;
    attachmentsValue = [{ FileName: "photo.png", ServerRelativeUrl: serverRelative }];
    const { host } = await renderForm();

    const chipDelete = host.querySelector(".MuiChip-deleteIcon");
    expect(chipDelete).toBeTruthy();
    await act(async () => {
      chipDelete.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    });
    await settle(160);

    expect(deleteDobAttachment).toHaveBeenCalledWith(77, "photo.png", LIST_GUID);
    // картинки в тексте больше нет — и в сохранённом значении тоже
    expect(host.querySelector('[data-testid="rich-editor"]').value).not.toContain("photo.png");
    clickSave(host);
    await settle(200);
    const body = updateDobItem.mock.calls.at(-1)[1];
    const savedHtml = String(body.ChekResult ?? body.OData_ChekResult ?? "");
    expect(savedHtml).not.toContain("<img");
    expect(savedHtml).toContain("отчёт");
  });

  it("каскад: убрали картинку из rich-текста → вложение тоже удаляется", async () => {
    const serverRelative = "/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/photo.png";
    itemValue = `<p>отчёт</p><img src="${serverRelative}">`;
    attachmentsValue = [{ FileName: "photo.png", ServerRelativeUrl: serverRelative }];
    const { host } = await renderForm();

    const editor = host.querySelector('[data-testid="rich-editor"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(editor, "<p>отчёт</p>");
      editor.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    });
    await settle(160);

    expect(deleteDobAttachment).toHaveBeenCalledWith(77, "photo.png", LIST_GUID);
  });

  it("в поле уходит ссылка /sites/… даже если картинка была вставлена через /dob-api", async () => {
    itemValue = '<p>x</p><img src="/dob-api/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/a.png">';
    const { host } = await renderForm();
    clickSave(host);
    await settle(200);

    expect(updateDobItem).toHaveBeenCalled();
    const body = updateDobItem.mock.calls.at(-1)[1];
    const savedHtml = String(body.ChekResult ?? body.OData_ChekResult ?? "");
    expect(savedHtml).toContain("/sites/dob/doblogistic/Lists/DobLogistic/Attachments/77/a.png");
    expect(savedHtml).not.toContain("/dob-api/");
    expect(savedHtml).not.toContain("data:image");
  });
});
