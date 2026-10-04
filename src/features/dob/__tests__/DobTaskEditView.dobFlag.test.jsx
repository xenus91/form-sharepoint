// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.dobFlag.test.jsx
//
// РАУНД 10: признак «задача ДОБ» приходит из TaskBehaviour — по имени типа контента
// (запись с IsDobTask = Да), а НЕ из колонки списка задач (значение по умолчанию
// колонки в списке одно на весь список и «расползается» по всем типам контента).
//
// Проверяем пользовательский сценарий: задача обычного типа контента, для которой
// в TaskBehaviour включён IsDobTask, открывается нашей формой — формой закрытия по
// колонкам типа контента; без признака та же задача показывается формой заявки.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";
const CT_ID = "0x01080011112222333344445555666677778888";
const CT_NAME = "Проверка качества приёмки";

const FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  { InternalName: "TaskStatus", Title: "Состояние задачи", TypeAsString: "Choice", Choices: { results: ["В работе"] } },
  { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Соответствует", "Не соответствует"] } },
  { InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true },
  { InternalName: "ErrorCountValidation", Title: "ErrorCountValidation", TypeAsString: "Number" },
];

const ITEM = {
  Id: 41,
  Title: "Задача приёмки",
  Body: "<p>Проверить партию по накладной.</p>",
  Status: "В работе",
  ContentTypeId: CT_ID,
  ContentType: { Name: CT_NAME },
};

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => FIELDS),
  getDobContentTypeFields: vi.fn(async () => FIELDS),
  getDobItem: vi.fn(async () => ITEM),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async () => ({})),
  getDobAttachments: vi.fn(async () => []),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
  getDobEntityType: vi.fn(async () => "SP.Data.TasksListItem"),
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

// Поля типа контента диалог запрашивает через fetchContentTypeFields (Tasks-сайт).
vi.mock("../../../tasks/contentTypeFields", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchContentTypeFields: vi.fn(async () => FIELDS) };
});

// Конфигурация TaskBehaviour: ровно то, что приходит из SharePoint
// (fetchTaskBehaviour → записи с полем isDobTask).
let behaviourMap = new Map();
vi.mock("../../tasks/hooks/useTaskConfiguration", () => ({
  useTaskConfiguration: () => ({
    data: { taskBehaviour: behaviourMap, ctMetaMap: new Map([[CT_ID, { name: CT_NAME }]]) },
    isLoading: false,
    error: null,
  }),
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

const settle = async (ms = 100) => {
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
            <DobTaskEditView id={41} listGuid={MAIN_GUID} onBackHash="#tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(140);
  return { host, root };
}

function behaviourRecord({ title, isDobTask }) {
  return {
    id: 1,
    title,
    enabled: true,
    behaviour: "",
    styling: "",
    stylingActions: "",
    isDobTask,
  };
}

describe("DobTaskEditView — задача ДОБ по записи TaskBehaviour", () => {
  beforeEach(() => {
    window.location.hash = `#dob_tasks/41?list=${MAIN_GUID}`;
    document.body.innerHTML = "";
    behaviourMap = new Map();
  });

  it("IsDobTask = Да в TaskBehaviour (по имени CT) → форма закрытия по колонкам типа контента", async () => {
    behaviourMap = new Map([[1, behaviourRecord({ title: CT_NAME, isDobTask: true })]]);
    const { host } = await renderForm();
    const text = host.textContent || "";

    // форму задачи собирает ContentTypeResultDialog: кнопки результирующего выбора
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(labels).toContain("Соответствует");
    expect(labels).toContain("Не соответствует");
    expect(host.querySelector('[data-testid="ct-result-block"]')).toBeTruthy();
    // поля — по колонкам типа контента, а не поля заявки
    expect(text).toContain("Кол-во ошибок");
    expect(text).not.toContain("Результат проверки — главное поле");
    // заголовок — реальное имя типа контента из задачи
    expect(text).toContain("Задача #41 · Задача приёмки");
  });

  it("признака нет → та же задача показывается формой заявки (поля списка, без кнопок CT)", async () => {
    behaviourMap = new Map([[1, behaviourRecord({ title: CT_NAME, isDobTask: false })]]);
    const { host } = await renderForm();
    const text = host.textContent || "";

    expect(host.querySelector('[data-testid="ct-result-block"]')).toBeNull();
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(labels).not.toContain("Соответствует");
    expect(text).toContain("Остальные поля");
  });

  it("без записи TaskBehaviour для типа контента форма остаётся обычной", async () => {
    behaviourMap = new Map([[1, behaviourRecord({ title: "Совсем другой тип", isDobTask: true })]]);
    const { host } = await renderForm();
    expect(host.querySelector('[data-testid="ct-result-block"]')).toBeNull();
  });
});
