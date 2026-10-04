// @vitest-environment jsdom
// src/features/tasks/__tests__/ContentTypeResultDialog.test.jsx
//
// Диалог закрытия задачи строится строго по типу контента и типам колонок:
// кнопки результирующего выбора, рич-текст, число, автокомплит, «Пользователь или
// группа». Обязательные поля из SharePoint блокируют отправку.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RESULT_CHECK_OOO_CT_ID } from "../../../tasks/contentTypeFields";

// CKEditor в jsdom не поднимаем: рич-текст подменяем textarea с тем же контрактом.
vi.mock("../../dob/components/RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="rich-editor"
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

// Автокомплит людей проверяется отдельным тестом — здесь важна передача значения.
vi.mock("../components/PersonFieldAutocomplete", () => ({
  default: ({ label, required, multiple, onChange, value }) => (
    <div>
      <span>{`${label}${required ? " *" : ""}`}</span>
      <span data-testid="person-value">{Array.isArray(value) ? value.map((u) => u.Title).join(", ") : ""}</span>
      <button
        type="button"
        data-testid="pick-person"
        onClick={() => onChange?.(multiple
          ? [{ Id: 5, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov.ii@lenta.com" }]
          : { Id: 5, Title: "Иванов Иван" })}
      >
        pick
      </button>
    </div>
  ),
}));

const FIELDS = [
  { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен", "Брак"] } },
  { InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true },
  { InternalName: "ErrorTypeValidation", Title: "ErrorTypeValidation", TypeAsString: "Choice", FillInChoice: true, Choices: { results: ["Ошибка типа A"] } },
  { InternalName: "ErrorCountValidation", Title: "ErrorCountValidation", TypeAsString: "Number" },
  { InternalName: "Guilty", Title: "Guilty", TypeAsString: "User", AllowMultipleValues: true },
  { InternalName: "TaskStatus", Title: "TaskStatus", TypeAsString: "Choice" },
];

// Набор полей можно подменить в отдельном тесте (например, для MultiChoice).
let MOCK_FIELDS = FIELDS;

vi.mock("../../../tasks/contentTypeFields", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchContentTypeFields: vi.fn(async () => MOCK_FIELDS) };
});

const { default: ContentTypeResultDialog } = await import("../components/ContentTypeResultDialog");

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

const settle = async (ms = 60) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

function renderDialog(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSubmit = props.onSubmit || vi.fn();
  const onClose = props.onClose || vi.fn();
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={createTheme()}>
          <ContentTypeResultDialog
            open
            task={{ Id: 501, Title: "Результат проверки ООБ" }}
            contentTypeId={RESULT_CHECK_OOO_CT_ID}
            contentTypeName="Результат проверки ООБ"
            resultChoices={["Годен", "Брак"]}
            initialResult=""
            onSubmit={onSubmit}
            onClose={onClose}
            {...props}
          />
        </ThemeProvider>
      </QueryClientProvider>
    );
  });
  return { host, onSubmit, onClose, root };
}

const buttonByText = (text) => [...document.body.querySelectorAll("button")]
  .find((b) => (b.textContent || "").trim() === text);

const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

const typeInto = (el, value) => {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

describe("ContentTypeResultDialog — форма по типу контента", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    MOCK_FIELDS = FIELDS;
  });

  it("показывает кнопки результирующего выбора и поля по типам колонок", async () => {
    renderDialog();
    await settle(80);
    const text = document.body.textContent;
    expect(buttonByText("Годен")).toBeTruthy();
    expect(buttonByText("Брак")).toBeTruthy();
    // результирующий выбор — ГРУППА кнопок (ToggleButtonGroup → role="group")
    const group = document.body.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    expect(group.textContent).toContain("Годен");
    expect(group.textContent).toContain("Брак");
    expect(group.querySelectorAll("button").length).toBe(2);
    // поля — в секции «Остальные поля» (единый формат со страницей формы ДОБ)
    expect(text).toContain("Остальные поля");
    // подписи полей: из SharePoint/понятные, обязательные — со звёздочкой
    expect(text).toContain("Описание результата проверки *");
    expect(text).toContain("Тип ошибки");
    expect(text).toContain("Кол-во ошибок");
    expect(text).toContain("Виновный");
    expect(document.body.querySelector('[data-testid="rich-editor"]')).toBeTruthy();
    expect(document.body.querySelector('input[type="number"]')).toBeTruthy();
    // системные поля задачи (Title/TaskStatus) в форму не попали
    expect(text).not.toContain("TaskStatus");
  });

  it("обязательные поля SharePoint блокируют отправку и показывают, что заполнить", async () => {
    const { onSubmit } = renderDialog();
    await settle(80);
    await act(async () => { click(buttonByText("Сохранить")); await settle(20); });
    const alert = document.body.querySelector('[data-testid="ct-result-dialog-problems"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("Выберите результат проверки");
    expect(alert.textContent).toContain("Заполните «Описание результата проверки»");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("после заполнения отдаёт payload по колонкам (рич-текст, число, «Пользователь или группа»)", async () => {
    const { onSubmit } = renderDialog();
    await settle(80);
    await act(async () => { click(buttonByText("Годен")); await settle(10); });
    await act(async () => {
      typeInto(document.body.querySelector('[data-testid="rich-editor"]'), "<p>Проверено 12.09</p>");
      typeInto(document.body.querySelector('input[type="number"]'), "3");
      await settle(10);
    });
    await act(async () => { click(document.body.querySelector('[data-testid="pick-person"]')); await settle(10); });
    await act(async () => { click(buttonByText("Сохранить")); await settle(30); });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.result).toBe("Годен");
    expect(payload.values.DescriptionCheckResult).toContain("Проверено 12.09");
    expect(payload.values.ErrorCountValidation).toBe(3);
    expect(payload.values.Guilty).toEqual({ __userIds: [5], __userMulti: true });
    // необязательное пустое поле не отправляем
    expect("ErrorTypeValidation" in payload.values).toBe(false);
  });

it("«Тип ошибки» не показывает «[object Object]»: verbose-коллекция → пустое поле", async () => {
    // Ровно то, что приходит от SharePoint (odata=verbose) для MultiChoice:
    // { __metadata, results: [] } — раньше печаталось как «[object Object]».
    renderDialog({
      task: {
        Id: 501,
        Title: "Результат проверки ООБ",
        ErrorTypeValidation: { __metadata: { type: "Collection(Edm.String)" }, results: [] },
      },
      ErrorTypeValidation: undefined,
    });
    await settle(80);
    expect(document.body.textContent).not.toContain("[object Object]");
    const errInput = [...document.body.querySelectorAll("input")].find((i) => (i.value || "").includes("object"));
    expect(errInput).toBeUndefined();
  });

  it("MultiChoice с заполненными значениями: select-варианты без объектов и «;#» в payload", async () => {
    MOCK_FIELDS = [
      { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен"] } },
      { InternalName: "ErrorTypeValidation", Title: "ErrorTypeValidation", TypeAsString: "MultiChoice", FillInChoice: true, Choices: { results: ["Приёмка", "Порча"] } },
    ];
    const { onSubmit } = renderDialog({
      resultChoices: ["Годен"],
      task: {
        Id: 501,
        ErrorTypeValidation: { __metadata: { type: "Collection(Edm.String)" }, results: [{ Value: "Приёмка" }] },
      },
    });
    await settle(80);
    expect(document.body.textContent).not.toContain("[object Object]");
    // выбранное значение видно чипом/подписью, а не «[object Object]»
    expect(document.body.textContent).toContain("Приёмка");
    await act(async () => { click(buttonByText("Годен")); await settle(10); });
    await act(async () => { click(buttonByText("Сохранить")); await settle(30); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].values.ErrorTypeValidation).toBe("Приёмка");
  });

  it("подписи кнопок берутся из Behaviour (ok/no)", async () => {
    renderDialog({
      confirmTexts: { okText: "Закрыть задачу", cancelText: "Вернуться" },
      submitLabel: "Закрыть задачу",
      cancelLabel: "Вернуться",
    });
    await settle(80);
    expect(buttonByText("Закрыть задачу")).toBeTruthy();
    expect(buttonByText("Вернуться")).toBeTruthy();
    expect(document.body.textContent).toContain("Результат проверки ООБ");
  });
});
