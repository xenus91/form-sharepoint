// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.closeDialog.test.jsx
//
// Закрытие задачи из RequestsTask идёт через форму ContentTypeResultDialog
// (тип «Результат проверки ООБ»). Две проблемы, которые здесь зафиксированы:
//   1) диалог читал состав полей НЕ detailed-функцией и молча рисовал форму по
//      ВСЕМ колонкам списка, когда состав типа контента получить не удалось
//      (в обычной форме заявки предупреждение ct-fallback-warning уже было, а в
//      форме закрытия — нет: «поля отображаются как будто вообще все»);
//   2) колонка результата при сохранении по умолчанию выдумывалась
//      ('DobSearchResult'), хотя в списке задачи её может не быть.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const OOB_GUID = "03fc1b92-baff-44dc-b8a3-d04acbe329d3"; // список RequestsTask (ООБ)
// Тип «Результат проверки ООБ» (фактический id с дочерним сегментом) — он
// включает форму закрытия вместо обычных полей заявки.
const OOO_CT_ID =
  "0x0108003365C4474CAE8C42BCE396314E88E51F00DDA2B3C73567D14D8127B2CBCC18DC1900EA27BBB7EC9C434BA049A0C60A2EA435";

const CT_FIELDS = [
  { InternalName: "Title", Title: "Имя задачи", TypeAsString: "Text" },
  { InternalName: "DescriptionCheckResult", Title: "Описание результата проверки", TypeAsString: "Note" },
  {
    InternalName: "ResultOOB", Title: "Результат проверки",
    TypeAsString: "OutcomeChoice", TypeDisplayName: "Результирующий выбор",
    Choices: { results: ["Годен", "Брак"] },
  },
];

// Колонки СПИСКА RequestsTask — их заметно больше, чем полей типа контента.
const LIST_FIELDS = [
  ...CT_FIELDS,
  { InternalName: "Predecessors", Title: "Предшественники", TypeAsString: "Text" },
  { InternalName: "PercentComplete", Title: "% завершения", TypeAsString: "Number" },
  { InternalName: "Priority", Title: "Приоритет", TypeAsString: "Choice", Choices: { results: ["1"] } },
];

const ITEM = { Id: 7, Title: "Проверка ЕО", Status: "В работе", ContentTypeId: OOO_CT_ID };

const state = { source: "list-fields", error: "404", ctFields: LIST_FIELDS, listFields: LIST_FIELDS };

const { updateDobItem } = vi.hoisted(() => ({ updateDobItem: vi.fn(async () => ({ ok: true })) }));

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => state.listFields),
  getDobContentTypeFields: vi.fn(async () => state.ctFields),
  getDobContentTypeFieldsDetailed: vi.fn(async () => ({
    fields: state.ctFields, source: state.source, ctId: OOO_CT_ID, error: state.error,
  })),
  getDobContentTypes: vi.fn(async () => []),
  getDobItem: vi.fn(async () => ({ ...ITEM })),
  updateDobItem,
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
const mouseClick = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

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
            <DobTaskEditView id={7} listGuid={OOB_GUID} onBackHash="#tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle();
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.source = "list-fields";
  state.error = "404";
  state.ctFields = LIST_FIELDS;
  state.listFields = LIST_FIELDS;
  document.body.innerHTML = "";
});

afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Форма закрытия задачи RequestsTask", () => {
  it("фолбэк «все колонки списка» виден и в форме закрытия, а не только в форме заявки", async () => {
    const host = await renderForm();
    const warning = host.querySelector('[data-testid="ct-fallback-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain("Состав полей типа контента");
  });

  it("когда состав типа получен — предупреждения нет, а источник полей подписан", async () => {
    state.source = "fieldlinks";
    state.ctFields = CT_FIELDS;
    const host = await renderForm();
    expect(host.querySelector('[data-testid="ct-fallback-warning"]')).toBeFalsy();
    const caption = host.querySelector('[data-testid="ct-source-caption"]');
    expect(caption).toBeTruthy();
    expect(caption.textContent).toContain("Результат проверки ООБ");
  });

  it("результат пишется в колонку из типа контента, а не в выдуманный DobSearchResult", async () => {
    state.source = "fieldlinks";
    state.ctFields = CT_FIELDS;
    state.listFields = LIST_FIELDS;
    const host = await renderForm();
    const good = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Годен");
    expect(good).toBeTruthy();
    await act(async () => { mouseClick(good); await settle(40); });
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Сохранить");
    await act(async () => { mouseClick(save); await settle(120); });

    expect(updateDobItem).toHaveBeenCalledTimes(1);
    const [id, body, listGuid] = updateDobItem.mock.calls[0];
    expect(id).toBe(7);
    expect(listGuid).toBe(OOB_GUID);
    expect(body.Status).toBe("Завершена");
    expect(body.PercentComplete).toBe(1);
    expect(body.ResultOOB).toBe("Годен");
    expect(body.DobSearchResult).toBeUndefined();
  });

  it("колонка результата есть только в СПИСКЕ — пишем в неё, а не в DobSearchResult", async () => {
    // В FieldLinks типа контента колонки результата нет, в списке — есть. Кнопки
    // результата берутся из метаданных списка, и раньше значение уезжало в
    // выдуманное поле DobSearchResult (в RequestsTask такой колонки нет).
    const noResult = [
      { InternalName: "Title", Title: "Имя задачи", TypeAsString: "Text" },
      { InternalName: "DescriptionCheckResult", Title: "Описание результата проверки", TypeAsString: "Note" },
    ];
    state.source = "fieldlinks";
    state.ctFields = noResult;
    state.listFields = [
      ...noResult,
      {
        InternalName: "ResultOOB", Title: "Результат проверки",
        TypeAsString: "OutcomeChoice", TypeDisplayName: "Результирующий выбор",
        Choices: { results: ["Годен", "Брак"] },
      },
    ];
    const host = await renderForm();
    const good = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Годен");
    expect(good).toBeTruthy();
    await act(async () => { mouseClick(good); await settle(40); });
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Сохранить");
    await act(async () => { mouseClick(save); await settle(120); });

    expect(updateDobItem).toHaveBeenCalledTimes(1);
    const body = updateDobItem.mock.calls[0][1];
    expect(body.ResultOOB).toBe("Годен");
    expect(body.DobSearchResult).toBeUndefined();
  });

  it("если колонки результата нет нигде — результат не выдумывается", async () => {
    const noResult = [
      { InternalName: "Title", Title: "Имя задачи", TypeAsString: "Text" },
      { InternalName: "DescriptionCheckResult", Title: "Описание результата проверки", TypeAsString: "Note" },
    ];
    state.source = "fieldlinks";
    state.ctFields = noResult;
    state.listFields = noResult;
    const host = await renderForm();
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Сохранить");
    await act(async () => { mouseClick(save); await settle(120); });

    expect(updateDobItem).toHaveBeenCalledTimes(1);
    const body = updateDobItem.mock.calls[0][1];
    expect(body.Status).toBe("Завершена");
    expect(body.DobSearchResult).toBeUndefined();
    // колонка результата не определена — ничего лишнего в payload не появилось
    // (пустой rich-текст в тело не попадает)
    expect(Object.keys(body).sort()).toEqual(["PercentComplete", "Status"]);
  });
});
