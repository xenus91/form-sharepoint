// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.readOnly.test.jsx
//
// Завершённую задачу править нельзя — НИ в таблице, НИ по прямой ссылке
// #dob_tasks/<id>?list=<GUID>. Форма открывается, но только на просмотр:
// полей не редактировать, «Сохранить» нет, вложения не удалить.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RESULT_CHECK_OOO_CT_ID } from "../../../tasks/contentTypeFields";

const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";

const FIELDS = [
  { InternalName: "Status", Title: "Status", TypeAsString: "Choice", Choices: { results: ["Не начата", "В работе", "Завершена"] } },
  { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен", "Брак"] } },
  { InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true },
  // разные типы полей: у завершённой задачи ВСЕ они должны быть закрыты
  { InternalName: "ErrorCountValidation", Title: "Кол-во ошибок", TypeAsString: "Number" },
  { InternalName: "CheckDate", Title: "Дата проверки", TypeAsString: "DateTime" },
  { InternalName: "Comment", Title: "Комментарий", TypeAsString: "Text" },
  { InternalName: "Reason", Title: "Причина", TypeAsString: "Choice", Choices: { results: ["Одна", "Две"] } },
  { InternalName: "Guilty", Title: "Виновный", TypeAsString: "User", AllowMultipleValues: true },
];

const ITEM = {
  Id: 906,
  Title: "Проверка ЕО (ООБ)",
  Body: "<p>Проверить партию ЕО.</p>",
  ContentTypeId: RESULT_CHECK_OOO_CT_ID,
};

// Статус задачи на «сервере» и журнал записей (MERGE).
const state = { status: "Завершена", percent: 1, saves: [] };

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => FIELDS),
  getDobContentTypeFields: vi.fn(async () => FIELDS),
  getDobItem: vi.fn(async () => ({ ...ITEM, Status: state.status, PercentComplete: state.percent })),
  updateDobItem: vi.fn(async (_id, body) => { state.saves.push(body); return { ok: true }; }),
  uploadDobAttachment: vi.fn(async (id, file) => ({ FileName: file?.name || "image.png", ServerRelativeUrl: `/sites/dob/Attachments/${id}/image.png` })),
  getDobAttachments: vi.fn(async () => [{ FileName: "photo.png", ServerRelativeUrl: "/sites/dob/Attachments/906/photo.png" }]),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
  getDobEntityType: vi.fn(async () => "SP.Data.TasksListItem"),
  takeDobTaskInWork: vi.fn(async () => ({ ok: false, reason: "completed" })),
}));

// Редактор показывает флаг readOnly — именно его мы проверяем.
vi.mock("../components/RichEditor", () => ({
  default: ({ value, onChange, readOnly, footer }) => (
    <div>
      <textarea
        data-testid="rich-editor"
        data-readonly={readOnly ? "1" : "0"}
        readOnly={!!readOnly}
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {/* блок вложений живёт внутри редактора — в просмотре у чипов нет крестика */}
      {footer ? <div data-testid="rich-editor-footer">{footer}</div> : null}
    </div>
  ),
}));

vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ label }) => <div>{label}</div>,
}));

vi.mock("../../../tasks/contentTypeFields", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchContentTypeFields: vi.fn(async () => FIELDS) };
});

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
            <DobTaskEditView id={906} listGuid={MAIN_GUID} onBackHash="#tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(150);
  return { host };
}

const buttons = (host) => [...host.querySelectorAll("button")];
const byText = (host, text) => buttons(host).find((b) => (b.textContent || "").trim() === text);

describe("DobTaskEditView — завершённая задача только для просмотра", () => {
  beforeEach(() => {
    state.status = "Завершена";
    state.percent = 1;
    state.saves.length = 0;
    document.body.innerHTML = "";
    window.location.hash = `#dob_tasks/906?list=${MAIN_GUID}`;
  });

  it("прямая ссылка на завершённую задачу: форма на просмотр, «Сохранить» нет", async () => {
    const { host } = await renderForm();

    // плашка и чип в шапке
    expect(host.querySelector('[data-testid="dob-readonly-banner"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="dob-readonly-chip"]')).toBeTruthy();
    // сохранять нечего
    expect(byText(host, "Сохранить")).toBeUndefined();
    expect(host.querySelector('[data-testid="ct-result-dialog-save"]')).toBeNull();
    // форма показана, но закрыта: редактор только на чтение
    expect(host.querySelector('[data-testid="rich-editor"]')?.getAttribute("data-readonly")).toBe("1");
  });

  it("кнопки результата и поля завершённой задачи недоступны, записи не уходит", async () => {
    const { host } = await renderForm();

    const goden = host.querySelector('[data-testid="ct-result-choice-Годен"]');
    expect(goden).toBeTruthy();
    expect(goden.disabled).toBe(true);

    // вложения: удалять нечем (крестика у чипа нет)
    const attachments = host.querySelector('[data-testid="dob-attachments"]');
    expect(attachments).toBeTruthy();
    expect(attachments.querySelectorAll(".MuiChip-deleteIcon")).toHaveLength(0);

    // клик по результату ничего не пишет
    await act(async () => {
      goden.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(state.saves).toHaveLength(0);
  });

  it("в завершённой задаче не остаётся НИ ОДНОГО редактируемого поля", async () => {
    const { host } = await renderForm();

    const controls = [...host.querySelectorAll("input, textarea, select")];
    // форма действительно отрисовалась (иначе проверка была бы пустой)
    expect(controls.length).toBeGreaterThan(4);
    const editable = controls
      .filter((el) => !el.disabled && !el.readOnly)
      .map((el) => `${el.tagName.toLowerCase()}[type=${el.getAttribute("type") || "-"}]`);
    expect(editable).toEqual([]);

    // рич-текст — тоже только чтение
    const rich = [...host.querySelectorAll('[data-testid="rich-editor"]')];
    expect(rich.length).toBeGreaterThan(0);
    expect(rich.every((el) => el.getAttribute("data-readonly") === "1")).toBe(true);
  });

  it("незавершённая задача редактируется как раньше (контроль)", async () => {
    state.status = "В работе";
    state.percent = 0;
    const { host } = await renderForm();

    expect(host.querySelector('[data-testid="dob-readonly-banner"]')).toBeNull();
    expect(host.querySelector('[data-testid="dob-readonly-chip"]')).toBeNull();
    expect(byText(host, "Сохранить")).toBeTruthy();
    const goden = host.querySelector('[data-testid="ct-result-choice-Годен"]');
    expect(goden.disabled).toBe(false);
  });
});
