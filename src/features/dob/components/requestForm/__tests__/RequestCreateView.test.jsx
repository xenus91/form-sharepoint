// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/RequestCreateView.test.jsx
// Страница #dob_requests/new:
//   • тип контента выбран по умолчанию, обязательные поля видны сразу;
//   • тип выбирается кнопками/чипами на одной странице (не выпадающим списком);
//   • в подписях типов — их ОПИСАНИЯ (Description), а не внутренние имена;
//   • если типов нет — создавать нечего (кнопка недоступна) и это видно.

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
vi.mock("../../../../tasks/components/RichEditor", () => ({ default: () => <textarea data-testid="rich-editor" /> }));
vi.mock("../../../../tasks/components/PersonFieldAutocomplete", () => ({ default: () => <input data-testid="person-field" /> }));

import * as dobApi from "../../../api/dobApi";
import NotificationsProvider from "../../../../../NotificationsProvider";
import RequestCreateView from "../RequestCreateView";

const CT_A = "0x0100AAAA";
const CT_B = "0x0100BBBB";
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
    { Id: CT_B, StringId: CT_B, Name: "Return", Description: "Заявка на возврат" },
  ]);
  dobApi.getDobContentTypeFields.mockResolvedValue([
    { InternalName: "Title", Title: "Наименование", Required: true, Hidden: false, FieldTypeKind: 2, TypeAsString: "Text", Choices: { results: [] } },
    { InternalName: "DC", Title: "РЦ", Required: true, Hidden: false, FieldTypeKind: 2, TypeAsString: "Text", Choices: { results: [] } },
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
  it("открывается уже с выбранным типом: обязательные поля видны, «Создать» доступна", async () => {
    mount();
    expect(text()).toContain("Новая заявка");
    await tick();

    // Title не показываем (генерируется), DC — обязательное поле
    expect(byTestid("request-field-Title")).toBeFalsy();
    expect(byTestid("request-field-DC")).toBeTruthy();
    expect(byTestid("request-create-submit").disabled).toBe(false);
    expect(dobApi.getDobContentTypeFields).toHaveBeenCalledWith(CT_A, expect.anything());
  });

  it("тип выбирается чипами на одной странице; подписи — описания типов", async () => {
    mount();
    await tick();

    const picker = byTestid("request-type-picker");
    expect(picker).toBeTruthy();
    // выпадающего списка больше нет
    expect(byTestid("request-ct-select")).toBeFalsy();

    const chipA = byTestid(`request-type-${CT_A}`);
    const chipB = byTestid(`request-type-${CT_B}`);
    expect(chipA.textContent).toContain("Заявка на отгрузку ТМЦ");
    expect(chipB.textContent).toContain("Заявка на возврат");
    // внутреннее имя типа (Name) в подписях чипов не показываем
    expect(picker.textContent).not.toContain("Request");
    // первый тип выбран по умолчанию
    expect(chipA.getAttribute("data-selected")).toBe("true");

    act(() => { chipB.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await tick();
    expect(byTestid(`request-type-${CT_B}`).getAttribute("data-selected")).toBe("true");
    expect(dobApi.getDobContentTypeFields).toHaveBeenCalledWith(CT_B, expect.anything());
  });

  it("обязательное поле получает значение из профиля (DC ← Office)", async () => {
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
