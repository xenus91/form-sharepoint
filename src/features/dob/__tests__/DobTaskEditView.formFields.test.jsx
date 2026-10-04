// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.formFields.test.jsx
//
// Форма задачи ДОБ (не «Результат проверки ООБ») строится по колонкам СПИСКА, но
// состав ограничен типом контента, а вид поля — по типу колонки:
//   • выбор (Choice/MultiChoice) — настоящий select, а не текстовое поле;
//   • «Пользователь или группа» — автокомплит по учётной записи (имя+должность+департамент);
//   • значения-коллекции SharePoint ({ results: [...] }) не печатаются как «[object Object]»;
//   • колонок, которых нет в типе контента (AdditionalActions*), в форме нет.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const LIST_GUID = "21b5b544-bd98-4b06-891f-c5a137331394";

// Колонки списка (метаданные /fields): среди них есть то, чего нет в типе контента.
const LIST_FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  { InternalName: "DobSearchResult", Title: "Результат проверки", TypeAsString: "Choice", Choices: { results: ["Выполнена", "Не предоставляется возможным"] } },
  { InternalName: "ErrorTypeValidation", Title: "Тип ошибки", TypeAsString: "MultiChoice", FillInChoice: true, Choices: { results: ["Приёмка", "Порча"] } },
  { InternalName: "PriorityChoice", Title: "Приоритет", TypeAsString: "Choice", Choices: { results: ["Высокий", "Низкий"] } },
  { InternalName: "Guilty", Title: "Виновный", TypeAsString: "User", AllowMultipleValues: true },
  { InternalName: "ErrorCountValidation", Title: "Кол-во ошибок", TypeAsString: "Number" },
  { InternalName: "AdditionalActions", Title: "Доп. действия", TypeAsString: "MultiChoice", Choices: { results: ["Перебрать"] } },
  { InternalName: "AdditionalActionsRequired", Title: "Доп. действия обязательны", TypeAsString: "Boolean" },
];

// Состав типа контента (FieldLinks): AdditionalActions* сюда НЕ входят.
const CT_FIELDS = LIST_FIELDS.filter((f) => !f.InternalName.startsWith("AdditionalActions"));

const ITEM = {
  Id: 77,
  Title: "Заявка ДОБ",
  ContentTypeId: "0x0100ABCDEF1234567890",
  DobSearchResult: "Выполнена",
  PriorityChoice: "Высокий",
  ErrorTypeValidation: { __metadata: { type: "Collection(Edm.String)" }, results: [{ Value: "Приёмка" }] },
  Guilty: { results: [{ Id: 5, Title: "Иванов Иван" }] },
  ErrorCountValidation: 2,
};

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFields: vi.fn(async () => CT_FIELDS),
  getDobItem: vi.fn(async () => ITEM),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async () => ({})),
  getDobAttachments: vi.fn(async () => []),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobEntityType: vi.fn(async () => "SP.Data.DoblogisticListItem"),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
}));

vi.mock("../components/RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// Автокомплит людей подменяем: важно, что поле вообще рисуется этим контролом,
// а сам поиск (учётная запись, должность, департамент) проверяется отдельно.
vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ label, required, multiple, value }) => (
    <div data-testid="person-field" data-multiple={String(multiple)}>
      <span>{`${label}${required ? " *" : ""}`}</span>
      <span data-testid="person-value">{(Array.isArray(value) ? value : []).map((u) => u.Title).join(", ")}</span>
    </div>
  ),
}));

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

describe("DobTaskEditView — поля формы по типам колонок", () => {
  beforeEach(() => {
    window.location.hash = `#dob_tasks/77?list=${LIST_GUID}`;
    document.body.innerHTML = "";
  });

  it("выбор рисуется select'ом, а не текстом; значения-коллекции без «[object Object]»", async () => {
    const { host } = await renderForm();
    const text = host.textContent || "";
    // выбор — настоящий select (MUI combobox), а не input с текстом
    const comboboxes = host.querySelectorAll('[role="combobox"]');
    expect(comboboxes.length).toBeGreaterThanOrEqual(2);
    // выбранные значения видны
    expect(text).toContain("Выполнена");
    expect(text).toContain("Высокий");
    expect(text).toContain("Приёмка");
    // объект-коллекция SharePoint не превратилась в «[object Object]»
    expect(text).not.toContain("[object Object]");
    // числовое поле осталось числовым
    expect(host.querySelector('input[type="number"]')).toBeTruthy();
  });

  it("«Пользователь или группа» — автокомплит с именем, а не read-only текст", async () => {
    const { host } = await renderForm();
    const person = host.querySelector('[data-testid="person-field"]');
    expect(person).toBeTruthy();
    expect(person.getAttribute("data-multiple")).toBe("true");
    expect(host.querySelector('[data-testid="person-value"]').textContent).toContain("Иванов Иван");
  });

  it("колонок, которых нет в типе контента, в форме нет", async () => {
    const { host } = await renderForm();
    const text = host.textContent || "";
    expect(text).toContain("Тип ошибки");
    expect(text).not.toContain("Доп. действия");
    expect(text).not.toContain("AdditionalActions");
  });
});
