// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/useRequestForm.test.jsx
//
// Форма создания заявки строится по типу контента:
//   • выбрал тип → поля этого типа (RequestFormFields + RequestFieldControl);
//   • сменил тип → состав полей меняется;
//   • обязательные пустые → список не трогаем;
//   • «Создать» → createDobItem(поля + ContentTypeId).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../../api/dobApi", () => ({
  getDobContentTypeFields: vi.fn(),
  createDobItem: vi.fn(),
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
import { useRequestForm } from "../useRequestForm";
import RequestFormFields from "../RequestFormFields";

const CT_A = "0x0100AAAA";
const CT_B = "0x0100BBBB";

const f = (InternalName, TypeAsString, extra = {}) => ({
  InternalName, Title: `Поле ${InternalName}`, Required: false, Hidden: false, ReadOnlyField: false,
  FieldTypeKind: 2, TypeAsString, Choices: { results: [] }, ...extra,
});

const FIELDS_A = [
  f("Title", "Text", { Title: "Наименование", Required: true }),
  f("DueDate", "DateTime", { Title: "Срок" }),
  f("AssignedTo", "User", { Title: "Исполнитель" }),
  f("DobSearchResult", "Choice", { Title: "Результат проверки", Choices: { results: ["Найдена", "Не найдена"] } }),
];
const FIELDS_B = [
  f("Title", "Text", { Title: "Наименование", Required: true }),
  f("Note", "Note", { Title: "Примечание" }),
];

const names = () => (document.querySelector('[data-testid="names"]')?.textContent || "");
const problems = () => (document.querySelector('[data-testid="problems"]')?.textContent || "");
const field = (name) => document.querySelector(`[data-testid="request-field-${name}"]`);
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

function Harness() {
  const form = useRequestForm();
  window.__form = form;
  return (
    <div>
      <div data-testid="names">{form.controls.map((c) => c.internalName).join(",")}</div>
      <div data-testid="problems">{form.problems.join("|")}</div>
      <div data-testid="error">{form.error}</div>
      <button data-testid="pick-a" onClick={() => form.selectContentType(CT_A)}>A</button>
      <button data-testid="pick-b" onClick={() => form.selectContentType(CT_B)}>B</button>
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
beforeEach(() => {
  vi.clearAllMocks();
  dobApi.getDobContentTypeFields.mockImplementation((ctId) => Promise.resolve(ctId === CT_A ? FIELDS_A : FIELDS_B));
  dobApi.createDobItem.mockResolvedValue({ Id: 9001 });
  window.__form = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => {
    root.render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const waitForNames = async (expected) => {
  for (let i = 0; i < 30 && names() !== expected; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
  return names();
};

describe("форма создания заявки", () => {
  it("поля строятся по выбранному типу контента", async () => {
    click("pick-a");
    expect(await waitForNames("Title,DueDate,AssignedTo,DobSearchResult")).toBe("Title,DueDate,AssignedTo,DobSearchResult");
    expect(field("Title")).toBeTruthy();
    expect(field("DueDate")).toBeTruthy();
    expect(document.querySelector('[data-testid="person-field"]')).toBeTruthy();
    // поле результата при создании заявки — обычное поле выбора
    expect(field("DobSearchResult")).toBeTruthy();
    expect(dobApi.getDobContentTypeFields).toHaveBeenCalledWith(CT_A, expect.anything());
  });

  it("смена типа контента меняет состав полей", async () => {
    click("pick-a");
    await waitForNames("Title,DueDate,AssignedTo,DobSearchResult");

    click("pick-b");
    expect(await waitForNames("Title,Note")).toBe("Title,Note");
    expect(field("DueDate")).toBeFalsy();
    // Note — рич-текст: контрол рисует RichEditor (в тесте — мок)
    expect(document.querySelector('[data-testid="rich-editor"]')).toBeTruthy();
    // значения предыдущего типа не перетекают
    expect(window.__form.values).toEqual({});
  });

  it("обязательное поле пустое → заявку не создаём, показываем ошибку", async () => {
    click("pick-a");
    await waitForNames("Title,DueDate,AssignedTo,DobSearchResult");

    await act(async () => { await window.__form.submit(); });
    expect(problems()).toContain("Заполните «Наименование»");
    expect(window.__form.invalidNames).toContain("Title");
    expect(dobApi.createDobItem).not.toHaveBeenCalled();
  });

  it("«Создать» пишет заявку: поля + ContentTypeId выбранного типа", async () => {
    click("pick-a");
    await waitForNames("Title,DueDate,AssignedTo,DobSearchResult");

    // заполняем через тот же onChange, что и контролы формы
    act(() => { setInputValue(field("Title"), "Заявка №123 на отгрузку"); });
    act(() => { setInputValue(field("DueDate"), "2026-10-20"); });
    act(() => { window.__form.setValue("DobSearchResult", "Найдена"); });

    await act(async () => { await window.__form.submit(); });

    expect(dobApi.createDobItem).toHaveBeenCalledTimes(1);
    const [payload, listGuid] = dobApi.createDobItem.mock.calls[0];
    expect(payload.Title).toBe("Заявка №123 на отгрузку");
    expect(payload.DueDate).toBe("2026-10-20");
    expect(payload.DobSearchResult).toBe("Найдена");
    expect(payload.ContentTypeId).toBe(CT_A);
    expect(listGuid).toBeTruthy();
    expect(window.__form.created).toBe(9001);
  });

  it("ошибка SharePoint показывается в форме, а не молча глотается", async () => {
    click("pick-a");
    await waitForNames("Title,DueDate,AssignedTo,DobSearchResult");
    dobApi.createDobItem.mockRejectedValueOnce({ response: { data: { error: { message: { value: "Поле обязательно" } } } } });
    act(() => { setInputValue(field("Title"), "x"); });

    await act(async () => { await window.__form.submit(); });

    expect(document.querySelector('[data-testid="error"]').textContent).toContain("Поле обязательно");
  });
});
