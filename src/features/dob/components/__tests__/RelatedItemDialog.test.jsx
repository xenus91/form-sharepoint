// @vitest-environment jsdom
// src/features/dob/components/__tests__/RelatedItemDialog.test.jsx
// Диалог «Связанная заявка»: поля связанного элемента показываются ТОЛЬКО для
// чтения, по типу контента элемента, без возможности что-то изменить.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  fields: [
    { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
    { InternalName: "Body", Title: "Описание", TypeAsString: "Note" },
    { InternalName: "Status", Title: "Статус", TypeAsString: "Choice" },
    { InternalName: "AssignedTo", Title: "Кому назначено", TypeAsString: "User" },
    { InternalName: "EmptyField", Title: "Пустое поле", TypeAsString: "Text" },
    { InternalName: "HiddenField", Title: "Служебное", TypeAsString: "Text", Hidden: true },
    { InternalName: "ContentType", Title: "Тип контента", TypeAsString: "Text" },
  ],
  item: {
    Id: 2,
    Title: "Заявка ООБ",
    Body: "<p>Просмотр видеоархива</p>",
    Status: "Не начата",
    AssignedTo: { Title: "Поршаков Сергей", Id: 207 },
    EmptyField: "",
    HiddenField: "секрет",
    ContentType: { Name: "Заявка ДОБ" },
    Author: { Title: "Иванов Пётр" },
    Editor: { Title: "Иванов Пётр" },
  },
}));

vi.mock("../../api/dobApi", () => ({
  getDobFields: vi.fn(async () => mocks.fields),
  getDobItemForView: vi.fn(async () => mocks.item),
}));

import { getDobItemForView } from "../../api/dobApi";
import RelatedItemDialog from "../RelatedItemDialog";

const LIST_ID = "21b5b544-bd98-4b06-891f-c5a137331394";

function render(node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={createTheme()}>{node}</ThemeProvider>
      </QueryClientProvider>
    );
  });
  return host;
}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe("RelatedItemDialog — просмотр связанной заявки", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("показывает заполненные поля связанного элемента только для чтения", async () => {
    // MUI Dialog рендерится в портал на document.body
    render(<RelatedItemDialog open onClose={() => {}} relatedRef={{ listId: LIST_ID, itemId: 2 }} />);
    await settle();

    expect(getDobItemForView).toHaveBeenCalledWith(2, LIST_ID);
    const text = document.body.textContent || "";
    expect(text).toContain("Связанная заявка #2");
    // значения полей
    expect(text).toContain("Просмотр видеоархива");
    expect(text).toContain("Поршаков Сергей");
    expect(text).toContain("Не начата");

    // Требование 2026-10-03: никаких чипов и поясняющих подписей над полями
    expect(text).not.toContain("Только просмотр");
    expect(text).not.toContain("Тип контента:");
    expect(text).not.toContain("Заполнено полей:");
    expect(text).not.toMatch(/данные связанной заявки/i);
    // и кнопки «Открыть форму заявки» в диалоге нет
    expect([...document.body.querySelectorAll("button")].some((b) => /Открыть форму заявки/.test(b.textContent || ""))).toBe(false);
    expect([...document.body.querySelectorAll("button")].map((b) => (b.textContent || "").trim())).toContain("Закрыть");

    // пустое и служебное поля не показываем
    expect(text).not.toContain("Пустое поле");
    expect(text).not.toContain("Служебное");
    expect(text).not.toContain("секрет");

    // read-only: ни одного редактируемого поля
    const fields = [...document.body.querySelectorAll('[data-testid="related-field"]')];
    expect(fields.length).toBeGreaterThanOrEqual(4);
    for (const f of fields) {
      expect(f.querySelectorAll('input[type="text"], textarea, select').length).toBe(0);
    }
    expect(document.body.querySelectorAll('input[type="text"]').length).toBe(0);
  });

  it("переключатель «Показать пустые поля» добавляет незаполненные поля", async () => {
    render(<RelatedItemDialog open onClose={() => {}} relatedRef={{ listId: LIST_ID, itemId: 2 }} />);
    await settle();
    expect(document.body.textContent).not.toContain("Пустое поле");

    const toggle = document.body.querySelector('input[type="checkbox"]');
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(document.body.textContent).toContain("Пустое поле");
    // служебные поля не показываем даже в этом режиме
    expect(document.body.textContent).not.toContain("Служебное");
  });

  it("если связи нет — сообщает об этом и не запрашивает элемент", async () => {
    render(<RelatedItemDialog open onClose={() => {}} relatedRef={null} />);
    await settle();
    expect(getDobItemForView).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("У задачи нет связанной заявки");
  });
});
