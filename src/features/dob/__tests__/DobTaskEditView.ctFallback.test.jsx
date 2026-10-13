// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.ctFallback.test.jsx
//
// Состав полей формы задачи берётся из типа контента элемента. Если тип не
// найден, fetchContentTypeFields уходит в фолбэк «все колонки списка» — раньше
// это происходило молча, и форма показывала чужой набор полей (например,
// стандартные поля «Задачи рабочего процесса» из списка RequestsTask).
// Теперь пользователь видит предупреждение, а при успешном разборе — какой тип
// контента лёг в основу формы.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const OOB_GUID = "03fc1b92-baff-44dc-b8a3-d04acbe329d3"; // RequestsTask ООБ
// Тип «Задача рабочего процесса» — обычный тип задачи, не «Результат проверки
// ООБ» (тот рендерит другую ветку формы — кнопки результата).
const TASK_CT_ID = "0x0108003E14AE2C66D8DF4E924C9E5F9F8DC0DC";

const LIST_FIELDS = [
  { InternalName: "Title", Title: "Имя задачи", TypeAsString: "Text", Required: true },
  { InternalName: "Predecessors", Title: "Предшественники", TypeAsString: "Text" },
  { InternalName: "PercentComplete", Title: "% завершения", TypeAsString: "Number" },
  { InternalName: "TaskOutcome", Title: "Результат задачи", TypeAsString: "Choice", Choices: { results: ["Годен", "Брак"] } },
];

// «В работе» — чтобы форма показывала поля, а не гейт «взять в работу»
const ITEM = { Id: 2, Title: "Проверка ЕО", Status: "В работе", ContentTypeId: TASK_CT_ID };

const state = { source: "list-fields", error: "404", contentTypes: [] };

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFieldsDetailed: vi.fn(async () => ({
    fields: LIST_FIELDS, source: state.source, ctId: TASK_CT_ID, error: state.error,
  })),
  getDobContentTypes: vi.fn(async () => state.contentTypes),
  getDobItem: vi.fn(async () => ({ ...ITEM })),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async () => ({})),
  getDobAttachments: vi.fn(async () => []),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
  getDobEntityType: vi.fn(async () => "SP.Data.RequestsTaskListItem"),
  takeDobTaskInWork: vi.fn(async () => ({ ok: false })),
}));

vi.mock("../components/RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));
vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({ default: ({ label }) => <div>{label}</div> }));

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

let root = null;
async function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={createTheme()}>
          <NotificationsProvider>
            <DobTaskEditView id={2} listGuid={OOB_GUID} onBackHash="#tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle();
}

beforeEach(() => {
  state.source = "list-fields";
  state.error = "404";
  state.contentTypes = [];
  document.body.innerHTML = "";
});

describe("DobTaskEditView — состав полей по типу контента", () => {
  it("фолбэк «все поля списка» больше не молчит: показываем предупреждение", async () => {
    await renderForm();
    const warning = document.querySelector('[data-testid="ct-fallback-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain("Состав типа контента");
    expect(warning.textContent).toContain("показаны все поля списка");
    expect(warning.textContent).toContain("404");

    // главного ради чего тест: секции «Результат проверки» быть не должно —
    // такой колонки нет ни в типе контента, ни в списке
    expect(document.body.textContent).not.toContain("Результат проверки");
    expect(document.querySelector('[data-testid="rich-editor"]')).toBeFalsy();
    act(() => root.unmount());
  });

  it("когда тип найден — предупреждения нет и видно, по какому типу форма", async () => {
    state.source = "fieldlinks";
    state.contentTypes = [{
      StringId: TASK_CT_ID,
      Name: "Результат проверки ООБ",
      Description: "Проверка ЕО (ООБ)",
    }];

    await renderForm();

    expect(document.querySelector('[data-testid="ct-fallback-warning"]')).toBeFalsy();
    const caption = document.querySelector('[data-testid="ct-source-caption"]');
    expect(caption).toBeTruthy();
    // название типа — из его Описания
    expect(caption.textContent).toContain("Проверка ЕО (ООБ)");
    act(() => root.unmount());
  });
});
