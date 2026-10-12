// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/RequestCreateView.test.jsx
// Страница #dob_requests/new: типы контента берутся из списка, пока тип не
// выбран — создавать нечего (кнопка недоступна), поля формы появляются после
// выбора типа.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../../api/dobApi", () => ({
  getDobContentTypes: vi.fn(),
  getDobContentTypeFields: vi.fn(),
  createDobItem: vi.fn(),
}));
vi.mock("../../RichEditor", () => ({ default: () => <textarea data-testid="rich-editor" /> }));
vi.mock("../../../../tasks/components/PersonFieldAutocomplete", () => ({ default: () => <input data-testid="person-field" /> }));

import * as dobApi from "../../../api/dobApi";
import NotificationsProvider from "../../../../../NotificationsProvider";
import RequestCreateView from "../RequestCreateView";

const CT_A = "0x0100AAAA";
const text = () => document.body.textContent || "";
const byTestid = (id) => document.querySelector(`[data-testid="${id}"]`);

let root = null;
beforeEach(() => {
  vi.clearAllMocks();
  dobApi.getDobContentTypes.mockResolvedValue([
    { Id: CT_A, StringId: CT_A, Name: "Заявка на отгрузку" },
    { Id: "0x0100BBBB", StringId: "0x0100BBBB", Name: "Заявка на возврат" },
  ]);
  dobApi.getDobContentTypeFields.mockResolvedValue([
    { InternalName: "Title", Title: "Наименование", Required: true, Hidden: false, FieldTypeKind: 2, TypeAsString: "Text", Choices: { results: [] } },
  ]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <NotificationsProvider>
          <RequestCreateView />
        </NotificationsProvider>
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const tick = async (n = 12) => {
  for (let i = 0; i < n; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
};

describe("RequestCreateView", () => {
  it("страница создания заявки: заголовок, подсказка, кнопка недоступна без типа", async () => {
    expect(text()).toContain("Новая заявка");
    expect(byTestid("request-form-hint")).toBeTruthy();
    expect(byTestid("request-create-submit").disabled).toBe(true);
    await tick();
    expect(dobApi.getDobContentTypes).toHaveBeenCalledTimes(1);
    // поля не грузим, пока не выбран тип
    expect(dobApi.getDobContentTypeFields).not.toHaveBeenCalled();
  });

  it("в выборе типа — типы контента списка; после выбора появляются поля", async () => {
    await tick();
    // MUI Select: inputProps уходят в скрытый input, а сам кликабельный элемент —
    // соседний div[role="combobox"] (не предок, поэтому ищем в родителе).
    const input = byTestid("request-ct-select");
    const combo = input.parentElement.querySelector('[role="combobox"]');
    act(() => { combo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })); });
    await tick(3);
    const options = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent);
    expect(options).toContain("Заявка на отгрузку");
    expect(options).toContain("Заявка на возврат");

    act(() => {
      Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => o.textContent === "Заявка на отгрузку")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await tick();

    expect(dobApi.getDobContentTypeFields).toHaveBeenCalledWith(CT_A, expect.anything());
    expect(byTestid("request-field-Title")).toBeTruthy();
    expect(byTestid("request-create-submit").disabled).toBe(false);
  });
});
