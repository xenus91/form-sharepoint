// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.checkTask.test.jsx
//
// Задача типа контента «Результат проверки ООБ» живёт в ОСНОВНОМ списке, но ведёт
// себя как задача сайта ДОБ: открывается формой DobTaskEditView (#dob_tasks/<id>?list=<основной>)
// и закрывается ТОЛЬКО через форму по колонкам типа контента — кнопки результата
// DobSearchResult + рич-текст/число/«Пользователь или группа», обязательные поля из SP.
// Проверяем, что отправка собирает MERGE (Status/PercentComplete + поля CT).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RESULT_CHECK_OOO_CT_ID } from "../../../tasks/contentTypeFields";

const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";

const FIELDS = [
  { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен", "Брак"] } },
  { InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true },
  { InternalName: "ErrorTypeValidation", Title: "ErrorTypeValidation", TypeAsString: "Choice", FillInChoice: true, Choices: { results: ["Ошибка типа A"] } },
  { InternalName: "ErrorCountValidation", Title: "ErrorCountValidation", TypeAsString: "Number" },
  { InternalName: "Guilty", Title: "Guilty", TypeAsString: "User", AllowMultipleValues: true },
  { InternalName: "TaskStatus", Title: "TaskStatus", TypeAsString: "Choice" },
];

const ITEM = {
  Id: 13,
  Title: "Проверка ЕО (ООБ)",
  Status: "В работе",
  ContentTypeId: RESULT_CHECK_OOO_CT_ID,
};

// DOB-API: список — основной, поэтому все вызовы должны уйти с MAIN_GUID.
vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => FIELDS),
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
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ label, required }) => (
    <div>
      <span>{`${label}${required ? " *" : ""}`}</span>
    </div>
  ),
}));

vi.mock("../../../tasks/contentTypeFields", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchContentTypeFields: vi.fn(async () => FIELDS) };
});

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

const settle = async (ms = 80) => {
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
            <DobTaskEditView id={13} listGuid={MAIN_GUID} onBackHash="#tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(120);
  return { host, root };
}

describe("DobTaskEditView — задача «Результат проверки ООБ»", () => {
  beforeEach(() => {
    updateDobItem.mockClear();
    window.location.hash = `#dob_tasks/13?list=${MAIN_GUID}`;
    document.body.innerHTML = "";
  });

  it("читает элемент основного списка и показывает форму закрытия по колонкам CT", async () => {
    const { host } = await renderForm();
    const text = host.textContent || "";
    // поля предмета — по колонкам типа контента
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(labels).toContain("Годен");
    expect(labels).toContain("Брак");
    expect(text).toContain("Описание результата проверки *");
    expect(text).toContain("Кол-во ошибок");
    expect(text).toContain("Тип ошибки");
    expect(text).toContain("Виновный");
    // системные колонки задачи в форму не попали
    expect(text).not.toContain("Состояние задачи");
    // и это НЕ поля заявки ДОБ (нет «Результат проверки — главное поле»)
    expect(text).not.toContain("Результат проверки — главное поле");
  });

  it("«Сохранить» без обязательного описания ничего не пишет (обязательность из SP)", async () => {
    const { host } = await renderForm();
    const buttons = [...host.querySelectorAll("button")];
    const result = buttons.find((b) => b.textContent.trim() === "Годен");
    expect(result).toBeTruthy();
    await act(async () => { mouseClick(result); await settle(40); });
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Сохранить");
    await act(async () => { mouseClick(save); await settle(60); });
    expect(updateDobItem).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Заполните «Описание результата проверки»");
  });

  it("после заполнения пишет результат и поля CT в основной список и возвращает в #tasks", async () => {
    const { host } = await renderForm();
    const buttons = [...host.querySelectorAll("button")];
    await act(async () => {
      mouseClick(buttons.find((b) => b.textContent.trim() === "Годен"));
      await settle(40);
    });
    const rich = host.querySelector("textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(rich, "<p>Проверено, замечаний нет</p>");
      rich.dispatchEvent(new window.Event("input", { bubbles: true }));
      await settle(40);
    });
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Сохранить");
    await act(async () => { mouseClick(save); await settle(120); });

    expect(updateDobItem).toHaveBeenCalledTimes(1);
    const [id, body, listGuid] = updateDobItem.mock.calls[0];
    expect(id).toBe(13);
    expect(listGuid).toBe(MAIN_GUID);
    expect(body.Status).toBe("Завершена");
    expect(body.PercentComplete).toBe(1);
    expect(body.DobSearchResult).toBe("Годен");
    expect(String(body.DescriptionCheckResult)).toContain("Проверено");
    // переходим назад в список задач основного сайта
    expect(window.location.hash).toBe("#tasks");
  });
});
