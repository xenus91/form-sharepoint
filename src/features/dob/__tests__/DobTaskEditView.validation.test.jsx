// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.validation.test.jsx
//
// Валидация формы заявки ДОБ (DobTaskEditView) ДО запроса в SharePoint:
//   • незаполненные обязательные поля (Required=true) акцентируются — поле краснеет
//     («Обязательное поле»), блок/секция подсвечиваются;
//   • пользователю показывается snackbar с предупреждением, а не 400 от сервера;
//   • MERGE в этом случае НЕ уходит; после заполнения — уходит;
//   • числовое поле («Кол-во ошибок») имеет ту же высоту, что и остальные поля.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FIELD_HEIGHT } from "../lib/formStyles";

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
vi.mock("../components/RichEditor", () => ({
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

const typeInto = (el, value) => {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

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

describe("DobTaskEditView — валидация обязательных полей формы заявки", () => {
  beforeEach(() => {
    window.location.hash = `#dob_tasks/77?list=${LIST_GUID}`;
    document.body.innerHTML = "";
    updateDobItem.mockClear();
  });

  it("пустое обязательное поле: акцент поля и блока, snackbar, MERGE не уходит", async () => {
    const { host } = await renderForm();
    const save = saveButton(host);
    expect(save).toBeTruthy();
    await act(async () => { click(save); await settle(30); });

    // в SharePoint ничего не ушло — сначала заполняем обязательные поля
    expect(updateDobItem).not.toHaveBeenCalled();
    // snackbar с предупреждением называет поле
    expect(document.body.textContent).toContain("Заполните обязательные поля");
    expect(document.body.textContent).toContain("Комментарий");
    // акцент поля: error + подпись «Обязательное поле»
    const field = host.querySelector('[data-dob-field="CommentRequired"]');
    expect(field).toBeTruthy();
    // MUI красит ИМЕННО инпут ошибки (error на TextField → .Mui-error внутри)
    expect(field.querySelector(".Mui-error")).toBeTruthy();
    expect(field.textContent).toContain("Обязательное поле");
    // акцент блока «Остальные поля»
    const section = host.querySelector(".dob-fields-section");
    expect(section.getAttribute("data-dob-invalid")).toBe("true");
  });

  it("после заполнения обязательного поля сохранение проходит (MERGE)", async () => {
    const { host } = await renderForm();
    const save = saveButton(host);
    await act(async () => { click(save); await settle(30); });
    expect(updateDobItem).not.toHaveBeenCalled();

    // пользователь заполнил поле — акцент снимается
    const input = host.querySelector('[data-dob-field="CommentRequired"] input');
    await act(async () => { typeInto(input, "проверено 04.10"); await settle(20); });
    expect(host.querySelector('[data-dob-field="CommentRequired"] .Mui-error')).toBe(null);

    await act(async () => { click(save); await settle(60); });
    expect(updateDobItem).toHaveBeenCalledTimes(1);
    const [id, body] = updateDobItem.mock.calls[0];
    expect(id).toBe(77);
    expect(body.CommentRequired).toBe("проверено 04.10");
  });

  it("числовое поле «Кол-во ошибок» — одной высоты с остальными полями", async () => {
    const { host } = await renderForm();
    const num = host.querySelector('input[type="number"]');
    expect(num).toBeTruthy();
    const root = num.closest(".MuiInputBase-root");
    expect(root).toBeTruthy();
    // высота зафиксирована стандартом формы (FIELD_HEIGHT), а не «своим» размером
    // <input type="number"> со спиннером
    expect(window.getComputedStyle(root).height).toBe(`${FIELD_HEIGHT}px`);
    expect(window.getComputedStyle(num).padding).toBe("8.5px 14px");
  });
});
