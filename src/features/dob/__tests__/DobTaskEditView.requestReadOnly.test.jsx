// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.requestReadOnly.test.jsx
//
//   • баннер объясняет, что изменение заявок отключено;
//   • кнопки «Сохранить» нет, поля недоступны для ввода;
//   • в SharePoint не уходит ни одного MERGE;
//   • шлюза «Взять в работу» для заявки нет.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Заявка (#dob_requests/<id>) с 2026-10-15 открывается ТОЛЬКО на просмотр:
// требование «убрать из #dob_requests возможность изменения заявок совсем».
const LIST_GUID = "21b5b544-bd98-4b06-891f-c5a137331394";

const LIST_FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  // обязательное текстовое поле — пустое (главный герой проверки валидации)
  { InternalName: "CommentRequired", Title: "Комментарий", TypeAsString: "Text", Required: true },
  { InternalName: "ErrorCountValidation", Title: "Кол-во ошибок", TypeAsString: "Number" },
  { InternalName: "DobSearchResult", Title: "Результат проверки", TypeAsString: "Choice", Choices: { results: ["Выполнена"] } },
];

const ITEM = {
  Id: 77,
  Title: "Заявка ДОБ",
  ContentTypeId: "0x0100ABCDEF1234567890",
  CommentRequired: "",
  ErrorCountValidation: 2,
  DobSearchResult: "Выполнена",
};

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFields: vi.fn(async () => LIST_FIELDS),
  // форма читает подробный вариант: поля + признак источника
  getDobContentTypeFieldsDetailed: vi.fn(async () => ({
    fields: LIST_FIELDS, source: 'fieldlinks', ctId: '0x0100TEST', error: '',
  })),
  getDobItem: vi.fn(async () => ITEM),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async () => ({})),
  getDobAttachments: vi.fn(async () => []),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobEntityType: vi.fn(async () => "SP.Data.DoblogisticListItem"),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
}));

// Редактор: отдаём наружу footer (блок вложений) и invalid (акцент обязательного поля).
vi.mock("../../tasks/components/RichEditor", () => ({
  default: ({ value, onChange, footer, invalid }) => (
    <div data-testid="rich-editor-box" data-invalid={invalid ? "1" : "0"}>
      <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
      {footer ? <div data-testid="rich-editor-footer">{footer}</div> : null}
    </div>
  ),
}));

const { default: DobTaskEditView } = await import("../DobTaskEditView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;
const { updateDobItem } = await import("../api/dobApi");

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

const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

const saveButton = (host) => [...host.querySelectorAll("button")]
  .find((b) => /^(Сохранить|Сохранение…)$/.test((b.textContent || "").trim()));

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
            <DobTaskEditView id={77} listGuid={LIST_GUID} onBackHash="#dob_requests" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(160);
  return { host, root };
}

describe("DobTaskEditView — заявка только для просмотра", () => {
  beforeEach(() => {
    window.location.hash = `#dob_requests/77`;
    document.body.innerHTML = "";
    updateDobItem.mockClear();
  });

  it("есть баннер «только просмотр», кнопки «Сохранить» нет", async () => {
    const { host } = await renderForm();
    const banner = host.querySelector('[data-testid="dob-readonly-banner"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("Заявка открыта только для просмотра");

    const save = saveButton(host);
    expect(save).toBeFalsy();
  });

  it("поля заявки недоступны для ввода", async () => {
    const { host } = await renderForm();
    const field = host.querySelector('[data-dob-field="CommentRequired"]');
    expect(field).toBeTruthy();
    const input = field.querySelector("input");
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(true);
  });

  it("в SharePoint ничего не уходит, даже если очень нажать на всё подряд", async () => {
    const { host } = await renderForm();
    for (const button of [...host.querySelectorAll("button")]) {
      await act(async () => { click(button); await settle(10); });
    }
    expect(updateDobItem).not.toHaveBeenCalled();
  });

  it("шлюза «Взять в работу» для заявки нет", async () => {
    const { host } = await renderForm();
    expect(host.querySelector('[data-testid="dob-take-gate"]')).toBe(null);
    expect((host.textContent || "")).not.toContain("Взять в работу");
  });
});
