// @vitest-environment jsdom
/* eslint-disable react/prop-types */
// src/features/dob/components/requestForm/__tests__/useRequestForm.test.jsx
//
// Форма создания заявки:
//   • показываем ТОЛЬКО обязательные поля типа контента;
//   • Title в форме нет — генерируется общим правилом; Status не отправляем;
//   • тип контента выбран ПО УМОЛЧАНИЮ (первый в списке) — форма открывается с полями;
//   • сменил тип → состав полей меняется;
//   • DC ← Office, InitiatingDepartment ← Department (из профиля пользователя);
//   • обязательные пустые → список не трогаем;
//   • «Создать» → createDobItem(обязательные поля + Title + ContentTypeId);
//   • rich-поле с картинкой → двухфазно: create → вложение → MERGE.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../../api/dobApi", () => ({
  getDobContentTypes: vi.fn(),
  getDobContentTypeFields: vi.fn(),
  createDobItem: vi.fn(),
  updateDobItem: vi.fn(),
  uploadDobAttachment: vi.fn(),
}));
vi.mock("../../../lib/dcEmailApi", () => ({
  findDcEmailItem: vi.fn(),
  ensureDcEmailLink: vi.fn(),
  buildOffDepKey: (office, department) => `${office || ""}${department || ""}`,
}));
vi.mock("../../RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));
vi.mock("../../../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ label, value, onChange }) => (
    <input
      data-testid="person-field"
      aria-label={label}
      value={Array.isArray(value) ? value.map((u) => u.Title).join(", ") : (value?.Title || "")}
      onChange={(e) => onChange?.(e.target.value ? [{ Id: 207, Title: e.target.value }] : [])}
    />
  ),
}));

import * as dobApi from "../../../api/dobApi";
import * as dcEmailApi from "../../../lib/dcEmailApi";
import { useRequestForm } from "../useRequestForm";
import RequestFormFields from "../RequestFormFields";

const CT_A = "0x0100AAAA";
const CT_B = "0x0100BBBB";
const CT_C = "0x0100CCCC";

const f = (InternalName, TypeAsString, extra = {}) => ({
  InternalName, Title: `Поле ${InternalName}`, Required: false, Hidden: false, ReadOnlyField: false,
  FieldTypeKind: 2, TypeAsString, Choices: { results: [] }, ...extra,
});

// Тип A: обязательные DueDate и Note (rich); Title и AssignedTo — не в форме.
const FIELDS_A = [
  f("Title", "Text", { Title: "Наименование", Required: true }),
  f("DueDate", "DateTime", { Title: "Срок", Required: true }),
  f("Note", "Note", { Title: "Описание", Required: true }),
  f("AssignedTo", "User", { Title: "Исполнитель" }),
];
const FIELDS_B = [
  f("DueDate", "DateTime", { Title: "Срок", Required: true }),
  f("Note", "Note", { Title: "Примечание" }),
];
// Тип, в котором обязательные поля заполняются из профиля
const FIELDS_C = [
  f("DC", "Text", { Title: "РЦ", Required: true }),
  f("InitiatingDepartment", "Text", { Title: "Подразделение-инициатор", Required: true }),
];

const PROFILE = { userOffice: "РЦ-8114", userDepartment: "Группа отгрузки РЦ" };

const names = () => (document.querySelector('[data-testid="names"]')?.textContent || "");
const problems = () => (document.querySelector('[data-testid="problems"]')?.textContent || "");
const field = (name) => document.querySelector(`[data-testid="request-field-${name}"]`);
// rich-контрол в тесте — мок RichEditor (свой data-testid, не request-field-*)
const richEditor = () => document.querySelector('[data-testid="rich-editor"]');

// controlled-инпут MUI: значение пишем нативным сеттером и диспатчим input —
// так событие проходит через событийную систему React, как от пользователя.
function setInputValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const click = (testid) => act(() => {
  document.querySelector(`[data-testid="${testid}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

function Harness({ userProfile = null }) {
  const form = useRequestForm({ userProfile });
  window.__form = form;
  return (
    <div>
      <div data-testid="names">{form.controls.map((c) => c.internalName).join(",")}</div>
      <div data-testid="values">{JSON.stringify(form.values)}</div>
      <div data-testid="problems">{form.problems.join("|")}</div>
      <div data-testid="error">{form.error}</div>
      <button data-testid="pick-b" onClick={() => form.selectContentType(CT_B)}>B</button>
      <button data-testid="pick-c" onClick={() => form.selectContentType(CT_C)}>C</button>
      <button data-testid="submit" onClick={() => form.submit()}>Создать</button>
      <RequestFormFields
        controls={form.controls}
        values={form.values}
        invalidNames={form.invalidNames}
        onChange={form.setValue}
      />
    </div>
  );
}

let root = null;
function mount(userProfile = null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => {
    root.render(<QueryClientProvider client={qc}><Harness userProfile={userProfile} /></QueryClientProvider>);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dobApi.getDobContentTypes.mockResolvedValue([
    { Id: CT_A, StringId: CT_A, Name: "Item", Description: "Заявка на отгрузку" },
    { Id: CT_B, StringId: CT_B, Name: "Return", Description: "Заявка на возврат" },
    { Id: CT_C, StringId: CT_C, Name: "Internal", Description: "Внутренняя заявка" },
  ]);
  dobApi.getDobContentTypeFields.mockImplementation((ctId) => Promise.resolve(
    ctId === CT_A ? FIELDS_A : ctId === CT_B ? FIELDS_B : FIELDS_C,
  ));
  dobApi.createDobItem.mockResolvedValue({ Id: 9001 });
  dobApi.updateDobItem.mockResolvedValue({});
  dobApi.uploadDobAttachment.mockResolvedValue({
    ServerRelativeUrl: "/sites/dob/doblogistic/Lists/DobLogistic/Attachments/9001/pic.png",
  });
  dcEmailApi.findDcEmailItem.mockResolvedValue({ Id: 7, OffDepKey: "РЦ-8114Группа отгрузки РЦ" });
  dcEmailApi.ensureDcEmailLink.mockResolvedValue({ created: true, item: { Id: 501 }, offDepKey: "РЦ-8114Группа отгрузки РЦ" });
  window.__form = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const waitForNames = async (expected) => {
  for (let i = 0; i < 40 && names() !== expected; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
  return names();
};

describe("форма создания заявки", () => {
  it("показывает только обязательные поля типа; Title в форму не попадает", async () => {
    mount();
    expect(await waitForNames("DueDate,Note")).toBe("DueDate,Note");
    expect(window.__form.ctId).toBe(CT_A);
    expect(field("Title")).toBeFalsy();
    expect(field("AssignedTo")).toBeFalsy();
    expect(field("DueDate")).toBeTruthy();
    expect(richEditor()).toBeTruthy();
  });

  it("смена типа контента меняет состав полей", async () => {
    mount();
    await waitForNames("DueDate,Note");

    click("pick-b");
    // В типе B обязателен только DueDate; Note — необязательный rich, не показываем.
    expect(await waitForNames("DueDate")).toBe("DueDate");
    expect(richEditor()).toBeFalsy();
    expect(window.__form.values).toEqual({});
  });

  it("DC и InitiatingDepartment подставляются из Office и Department профиля", async () => {
    mount(PROFILE);
    await waitForNames("DueDate,Note");

    click("pick-c");
    await waitForNames("DC,InitiatingDepartment");

    expect(window.__form.values.DC).toBe("РЦ-8114");
    expect(window.__form.values.InitiatingDepartment).toBe("Группа отгрузки РЦ");
    expect(field("DC").value).toBe("РЦ-8114");
  });

  it("обязательное поле пустое → заявку не создаём, показываем ошибку", async () => {
    mount();
    await waitForNames("DueDate,Note");

    await act(async () => { await window.__form.submit(); });
    expect(problems()).toContain("Заполните «Срок»");
    expect(window.__form.invalidNames).toContain("DueDate");
    expect(dobApi.createDobItem).not.toHaveBeenCalled();
  });

  it("«Создать»: Title сгенерирован, Status не отправляем, только обязательные поля", async () => {
    mount(PROFILE);
    await waitForNames("DueDate,Note");
    click("pick-c");
    await waitForNames("DC,InitiatingDepartment");

    await act(async () => { await window.__form.submit(); });

    expect(dobApi.createDobItem).toHaveBeenCalledTimes(1);
    const [payload] = dobApi.createDobItem.mock.calls[0];
    // Title сгенерирован из названия типа (Description), а не введён в форме
    expect(String(payload.Title).startsWith("Внутренняя заявка от ")).toBe(true);
    expect(payload.Status).toBeUndefined();
    expect(payload.ContentTypeId).toBe(CT_C);
    expect(payload.DC).toBe("РЦ-8114");
    expect(payload.InitiatingDepartment).toBe("Группа отгрузки РЦ");
    expect(window.__form.created).toBe(9001);
    // без картинок второй фазы нет
    expect(dobApi.updateDobItem).not.toHaveBeenCalled();
  });

  it("rich-поле с картинкой: создаём → грузим вложение → MERGE со ссылкой", async () => {
    mount();
    await waitForNames("DueDate,Note");

    act(() => { setInputValue(field("DueDate"), "2026-10-20"); });
    act(() => { setInputValue(richEditor(), '<p>см.</p><img src="data:image/png;base64,AAAA" />'); });

    await act(async () => { await window.__form.submit(); });

    // фаза 1 — создание без base64
    const [created] = dobApi.createDobItem.mock.calls[0];
    expect(created.Note).not.toContain("data:image");
    expect(created.DueDate).toBe("2026-10-20");
    // фаза 2 — вложение и MERGE со ссылкой
    expect(dobApi.uploadDobAttachment).toHaveBeenCalledTimes(1);
    expect(dobApi.updateDobItem).toHaveBeenCalledTimes(1);
    const [id, richPayload] = dobApi.updateDobItem.mock.calls[0];
    expect(id).toBe(9001);
    expect(richPayload.Note).toContain("Attachments/9001");
    expect(richPayload.Note).not.toContain("data:image");
  });

  it("ошибка SharePoint показывается в форме, а не молча глотается", async () => {
    mount();
    await waitForNames("DueDate,Note");
    dobApi.createDobItem.mockRejectedValueOnce({ response: { data: { error: { message: { value: "Поле обязательно" } } } } });
    act(() => { setInputValue(field("DueDate"), "2026-10-20"); });
    act(() => { setInputValue(richEditor(), "<p>x</p>"); });

    await act(async () => { await window.__form.submit(); });

    expect(document.querySelector('[data-testid="error"]').textContent).toContain("Поле обязательно");
  });
});

describe("гейт DcEmail (связка офиса и департамента с рассылкой)", () => {
  it("нет элемента DcEmail → заявку не создаём, просим указать рассылку", async () => {
    dcEmailApi.findDcEmailItem.mockResolvedValue(null);
    mount(PROFILE);
    await waitForNames("DueDate,Note");
    click("pick-c");
    await waitForNames("DC,InitiatingDepartment");

    await act(async () => { await window.__form.submit(); });

    expect(dcEmailApi.findDcEmailItem).toHaveBeenCalledWith("РЦ-8114", "Группа отгрузки РЦ");
    expect(window.__form.needsDcEmail).toBe(true);
    expect(dobApi.createDobItem).not.toHaveBeenCalled();
  });

  it("элемент DcEmail есть → создаём заявку сразу, диалог не открываем", async () => {
    mount(PROFILE);
    await waitForNames("DueDate,Note");
    click("pick-c");
    await waitForNames("DC,InitiatingDepartment");

    await act(async () => { await window.__form.submit(); });

    expect(window.__form.needsDcEmail).toBe(false);
    expect(dobApi.createDobItem).toHaveBeenCalledTimes(1);
  });

  it("профиль без офиса/департамента → гейт не мешает созданию", async () => {
    mount();
    await waitForNames("DueDate,Note");
    act(() => { setInputValue(field("DueDate"), "2026-10-20"); });
    act(() => { setInputValue(richEditor(), "<p>x</p>"); });

    await act(async () => { await window.__form.submit(); });

    expect(dcEmailApi.findDcEmailItem).not.toHaveBeenCalled();
    expect(dobApi.createDobItem).toHaveBeenCalledTimes(1);
  });

  it("saveDcEmailAndCreate: СНАЧАЛА элемент DcEmail, затем заявка", async () => {
    dcEmailApi.findDcEmailItem.mockResolvedValue(null);
    mount(PROFILE);
    await waitForNames("DueDate,Note");
    click("pick-c");
    await waitForNames("DC,InitiatingDepartment");
    await act(async () => { await window.__form.submit(); });
    expect(window.__form.needsDcEmail).toBe(true);

    const groups = [{ Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }];
    await act(async () => { await window.__form.saveDcEmailAndCreate(groups); });

    expect(dcEmailApi.ensureDcEmailLink).toHaveBeenCalledWith({
      office: "РЦ-8114", department: "Группа отгрузки РЦ", groups,
    });
    expect(dobApi.createDobItem).toHaveBeenCalledTimes(1);
    expect(window.__form.needsDcEmail).toBe(false);
    // порядок: DcEmail-элемент создаётся до заявки — проверяем по порядку вызовов
    const ensureOrder = dcEmailApi.ensureDcEmailLink.mock.invocationCallOrder[0];
    const createOrder = dobApi.createDobItem.mock.invocationCallOrder[0];
    expect(ensureOrder).toBeLessThan(createOrder);
  });

  it("ошибка создания DcEmail → заявку не создаём, показываем ошибку диалога", async () => {
    dcEmailApi.findDcEmailItem.mockResolvedValue(null);
    dcEmailApi.ensureDcEmailLink.mockRejectedValue(new Error("нет доступа к DcEmail"));
    mount(PROFILE);
    await waitForNames("DueDate,Note");
    click("pick-c");
    await waitForNames("DC,InitiatingDepartment");
    await act(async () => { await window.__form.submit(); });

    await act(async () => {
      await window.__form.saveDcEmailAndCreate([{ Id: 33, Title: "ООБ" }]);
    });

    expect(dobApi.createDobItem).not.toHaveBeenCalled();
    expect(window.__form.dcEmailError).toContain("нет доступа к DcEmail");
    expect(window.__form.needsDcEmail).toBe(true);
  });
});

describe("isFolderContentType", () => {
  it("системную «Папку» типом по умолчанию не берём", async () => {
    const { isFolderContentType } = await import("../useRequestForm");
    expect(isFolderContentType({ StringId: "0x012000ABC", Name: "Folder" })).toBe(true);
    expect(isFolderContentType({ StringId: "0x0100ABC", Name: "Папка" })).toBe(true);
    expect(isFolderContentType({ StringId: "0x0100ABC", Name: "Заявка" })).toBe(false);
  });
});
