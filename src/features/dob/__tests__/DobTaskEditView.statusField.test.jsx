// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.statusField.test.jsx
//
// Селект Status должен быть в форме ВСЕГДА, даже когда FieldLinks типа контента
// его не содержат (раньше из-за этого в части форм статуса не было вовсе).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Заявка (#dob_requests/<id>) с 2026-10-15 открывается ТОЛЬКО на просмотр:
// требование «убрать из #dob_requests возможность изменения заявок совсем».
const LIST_GUID = "21b5b544-bd98-4b06-891f-c5a137331394";

const LIST_FIELDS = [
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["Открыт", "В работе", "Завершена"] } },
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  // обязательное текстовое поле — пустое (главный герой проверки валидации)
  { InternalName: "CommentRequired", Title: "Комментарий", TypeAsString: "Text", Required: true },
  { InternalName: "ErrorCountValidation", Title: "Кол-во ошибок", TypeAsString: "Number" },
  { InternalName: "DobSearchResult", Title: "Результат проверки", TypeAsString: "Choice", Choices: { results: ["Выполнена"] } },
];

// В типе контента статуса нет — а в списке и в элементе он есть.
const CT_FIELDS = LIST_FIELDS.filter((f) => f.InternalName !== "Status");

const ITEM = {
  Id: 77,
  Title: "Заявка ДОБ",
  ContentTypeId: "0x0100ABCDEF1234567890",
  Status: "Открыт",
  CommentRequired: "",
  ErrorCountValidation: 2,
  DobSearchResult: "Выполнена",
};

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFields: vi.fn(async () => CT_FIELDS),
  // состав типа контента БЕЗ статуса — именно так статус и терялся из формы
  getDobContentTypeFieldsDetailed: vi.fn(async () => ({
    fields: CT_FIELDS, source: 'fieldlinks', ctId: '0x0100TEST', error: '',
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

async function renderForm({ listGuid = LIST_GUID } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={createTheme()}>
          <NotificationsProvider>
            <DobTaskEditView id={77} listGuid={listGuid} onBackHash="#dob_requests" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(160);
  return { host, root };
}

describe("DobTaskEditView — селект Status в форме", () => {
  beforeEach(() => {
    window.location.hash = "#dob_requests/77";
    document.body.innerHTML = "";
    updateDobItem.mockClear();
  });

  it("в форме заявки статус есть, даже когда тип контента его не содержит", async () => {
    const { host } = await renderForm();
    const field = host.querySelector('[data-dob-field="Status"]');
    expect(field).toBeTruthy();
    // это именно select, а не текст
    expect(field.querySelector(".MuiSelect-select")).toBeTruthy();
    expect(field.textContent).toContain("Открыт");
  });

  it("в форме задачи того же списка статус тоже показывается", async () => {
    const { host } = await renderForm({ listGuid: "463b634e-a71a-4fef-9a1f-b803431d8639" });
    const field = host.querySelector('[data-dob-field="Status"]');
    expect(field).toBeTruthy();
    expect(field.textContent).toContain("Открыт");
  });
});
