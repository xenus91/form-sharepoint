// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/RequestCreateView.test.jsx
// Страница #dob_requests/new:
//   • тип контента выбран по умолчанию, поля видны сразу;
//   • в списке типов — их ОПИСАНИЯ (Description), а не внутренние имена;
//   • если типов нет — создавать нечего (кнопка недоступна) и это видно.

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
const PROFILE = { userOffice: "РЦ-8114", userDepartment: "Группа отгрузки РЦ" };
const text = () => document.body.textContent || "";
const byTestid = (id) => document.querySelector(`[data-testid="${id}"]`);

let root = null;
function mount(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <NotificationsProvider>
          <RequestCreateView userProfile={PROFILE} {...props} />
        </NotificationsProvider>
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dobApi.getDobContentTypes.mockResolvedValue([
    { Id: CT_A, StringId: CT_A, Name: "Request", Description: "Заявка на отгрузку ТМЦ" },
    { Id: "0x0100BBBB", StringId: "0x0100BBBB", Name: "Return", Description: "Заявка на возврат" },
  ]);
  dobApi.getDobContentTypeFields.mockResolvedValue([
    { InternalName: "Title", Title: "Наименование", Required: true, Hidden: false, FieldTypeKind: 2, TypeAsString: "Text", Choices: { results: [] } },
    { InternalName: "DC", Title: "РЦ", Required: false, Hidden: false, FieldTypeKind: 2, TypeAsString: "Text", Choices: { results: [] } },
  ]);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const tick = async (n = 15) => {
  for (let i = 0; i < n; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
};

describe("RequestCreateView", () => {
  it("открывается уже с выбранным типом: поля видны, «Создать» доступна", async () => {
    mount();
    expect(text()).toContain("Новая заявка");
    await tick();

    expect(byTestid("request-field-Title")).toBeTruthy();
    expect(byTestid("request-create-submit").disabled).toBe(false);
    expect(dobApi.getDobContentTypeFields).toHaveBeenCalledWith(CT_A, expect.anything());
  });

  it("в выборе типа — описания типов контента, значение — id типа", async () => {
    mount();
    await tick();

    const input = byTestid("request-ct-select");
    // MUI Select: inputProps уходят в скрытый input, кликабельный элемент —
    // соседний div[role="combobox"].
    const combo = input.parentElement.querySelector('[role="combobox"]');
    act(() => { combo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })); });
    await tick(4);

    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Заявка на отгрузку ТМЦ");
    expect(labels).toContain("Заявка на возврат");
    // внутреннее имя типа (Name) пользователю не показываем
    expect(labels).not.toContain("Request");

    act(() => {
      options.find((o) => o.textContent === "Заявка на возврат")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await tick();
    expect(input.value).toBe("0x0100BBBB");
  });

  it("поля формы получают значения из профиля (DC ← Office)", async () => {
    mount();
    await tick();
    expect(byTestid("request-field-DC").value).toBe("РЦ-8114");
  });

  it("типов контента нет → кнопка недоступна и показана причина", async () => {
    dobApi.getDobContentTypes.mockResolvedValue([]);
    mount();
    await tick();

    expect(byTestid("request-create-submit").disabled).toBe(true);
    expect(byTestid("request-form-hint")).toBeTruthy();
    expect(dobApi.getDobContentTypeFields).not.toHaveBeenCalled();
  });
});
