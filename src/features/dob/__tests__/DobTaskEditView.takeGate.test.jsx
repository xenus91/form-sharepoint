// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.takeGate.test.jsx
//
// Прямой переход по ссылке #dob_tasks/<id>?list=<GUID> открывает форму в обход
// списка/таблицы, где кнопка «Взять в работу» обязательна. Если задача ещё
// «Не начата», форма НЕ должна давать вносить данные: сначала — «Взять в работу»,
// и только после взятия — поля результата и «Сохранить».

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
];

const ITEM = {
  Id: 906,
  Title: "Проверка ЕО (ООБ)",
  Body: "<p>Проверить партию ЕО.</p>",
  ContentTypeId: RESULT_CHECK_OOO_CT_ID,
};

// Состояние «сервера»: статус задачи и журнал взятий в работу.
const state = { status: "Не начата", takeCalls: [] };

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => FIELDS),
  getDobContentTypeFields: vi.fn(async () => FIELDS),
  getDobItem: vi.fn(async () => ({ ...ITEM, Status: state.status })),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async (id, file) => ({
    FileName: file?.name || "image.png",
    ServerRelativeUrl: `/sites/dob/Lists/Tasks/Attachments/${id}/${file?.name || "image.png"}`,
  })),
  getDobAttachments: vi.fn(async () => []),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
  getDobEntityType: vi.fn(async () => "SP.Data.TasksListItem"),
  takeDobTaskInWork: vi.fn(async (id, listGuid, opts) => {
    state.takeCalls.push({ id, listGuid, choices: opts?.choices || null });
    if (state.status !== "Не начата") return { ok: false, reason: "already-taken", status: state.status };
    state.status = "В работе";
    return { ok: true, status: "В работе", previousStatus: "Не начата" };
  }),
}));

vi.mock("../components/RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ label, required }) => <div>{`${label}${required ? " *" : ""}`}</div>,
}));

vi.mock("../../../tasks/contentTypeFields", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchContentTypeFields: vi.fn(async () => FIELDS) };
});

const { default: DobTaskEditView } = await import("../DobTaskEditView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;
const { takeDobTaskInWork } = await import("../api/dobApi");

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
const mouseClick = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

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
  return { host, root };
}

const buttons = (host) => [...host.querySelectorAll("button")];
const saveButton = (host) => buttons(host).find((b) => b.textContent.trim() === "Сохранить");
const takeButton = (host) => buttons(host).find((b) => /Взять в работу/.test(b.textContent || ""));

describe("DobTaskEditView — шлюз «Взять в работу» для прямой ссылки", () => {
  beforeEach(() => {
    state.status = "Не начата";
    state.takeCalls.length = 0;
    takeDobTaskInWork.mockClear();
    document.body.innerHTML = "";
    window.location.hash = `#dob_tasks/906?list=${MAIN_GUID}`;
  });

  it("задача «Не начата»: вместо формы — шлюз, полей результата и «Сохранить» нет", async () => {
    const { host } = await renderForm();

    expect(host.querySelector('[data-testid="dob-take-gate"]')).toBeTruthy();
    // формы закрытия нет: ни кнопок результата, ни rich-текста, ни блока CT-формы
    expect(buttons(host).some((b) => b.textContent.trim() === "Годен")).toBe(false);
    expect(host.querySelector('[data-testid="rich-editor"]')).toBeNull();
    expect(host.querySelector('[data-testid="ct-main-field"]')).toBeNull();
    // сохранять нечего — кнопка «Сохранить» недоступна
    expect(saveButton(host)?.disabled).toBe(true);
  });

  it("«Взять в работу» из шлюза берёт задачу в её списке и открывает форму", async () => {
    const { host } = await renderForm();
    const btn = takeButton(host);
    expect(btn).toBeTruthy();

    await act(async () => { mouseClick(btn); await new Promise((r) => setTimeout(r, 50)); });
    await settle(200);

    // взятие ушло в тот же список, что и форма, и с choices поля Status
    expect(state.takeCalls).toHaveLength(1);
    expect(state.takeCalls[0].id).toBe(906);
    expect(state.takeCalls[0].listGuid).toBe(MAIN_GUID);
    expect(state.takeCalls[0].choices).toEqual(["Не начата", "В работе", "Завершена"]);

    // после взятия шлюз ушёл, форма доступна
    expect(host.querySelector('[data-testid="dob-take-gate"]')).toBeNull();
    expect(buttons(host).some((b) => b.textContent.trim() === "Годен")).toBe(true);
    expect(saveButton(host)?.disabled).toBe(false);
  });

  it("задача уже «В работе»: шлюза нет, форма открыта сразу", async () => {
    state.status = "В работе";
    const { host } = await renderForm();

    expect(host.querySelector('[data-testid="dob-take-gate"]')).toBeNull();
    expect(buttons(host).some((b) => b.textContent.trim() === "Годен")).toBe(true);
    expect(saveButton(host)?.disabled).toBe(false);
    expect(takeDobTaskInWork).not.toHaveBeenCalled();
  });
});
