// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/RequestCreateView.snackbar.test.jsx
//
// Snackbar после создания заявки (требование 2026-10-15): пишем, на какую
// рассылку уйдут результаты проверки, и «Ожидайте решения».

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const notify = vi.fn();

vi.mock("../../../../../NotificationsProvider", () => ({
  useNotifications: () => ({ notify }),
}));

vi.mock("../../../../navigation/BurgerWithCount", () => ({ default: () => null }));
vi.mock("../RequestTypePicker", () => ({ default: () => null }));
vi.mock("../RequestFormFields", () => ({ default: () => null }));
// Диалог: наружу кнопка, которая вызывает onSubmit так же, как «Сохранить и
// создать заявку» в настоящем диалоге.
vi.mock("../DcEmailLinkDialog", () => ({
  default: ({ onSubmit }) => (
    <button
      type="button"
      data-testid="dcemail-submit"
      onClick={() => onSubmit([{ Title: "_РЦ 8117 Отгрузка" }])}
    >
      dialog
    </button>
  ),
}));

const mailingRef = { current: ["Рассылка ООБ"] };
const submit = vi.fn(async () => ({ Id: 555 }));
const saveDcEmailAndCreate = vi.fn(async () => ({ Id: 556 }));

vi.mock("../useRequestForm", () => ({
  useRequestForm: () => ({
    contentTypes: [],
    loadingTypes: false,
    typesError: "",
    ctId: "0x0100AA",
    selectContentType: vi.fn(),
    controls: [],
    values: {},
    setValue: vi.fn(),
    problems: [],
    invalidNames: [],
    loadingFields: false,
    fieldsError: "",
    saving: false,
    isUploading: false,
    error: "",
    submit,
    needsDcEmail: false,
    dcEmailSaving: false,
    dcEmailError: "",
    dcEmailOffice: "РЦ-8114",
    dcEmailDepartment: "Департамент логистики",
    dcEmailKey: "РЦ-8114Департамент логистики",
    mailingRef,
    saveDcEmailAndCreate,
    cancelDcEmail: vi.fn(),
  }),
}));

const { default: RequestCreateView } = await import("../RequestCreateView");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let host = null;

beforeEach(() => {
  window.location.hash = "#dob_requests/new";
  document.body.innerHTML = "";
  notify.mockClear();
  submit.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <RequestCreateView userProfile={{ userOffice: "РЦ-8114", userDepartment: "Департамент логистики" }} />
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

/** Текст уведомления — это React-узел, поэтому рендерим его и читаем текст. */
function notifyText() {
  expect(notify).toHaveBeenCalledTimes(1);
  const [message, options] = notify.mock.calls[0];
  const box = document.createElement("div");
  document.body.appendChild(box);
  const boxRoot = createRoot(box);
  act(() => { boxRoot.render(message); });
  const text = box.textContent.replace(/\s+/g, " ").trim();
  act(() => boxRoot.unmount());
  return { text, options };
}

describe("Snackbar после создания заявки", () => {
  it("называет рассылку и просит ожидать решения", async () => {
    const button = document.querySelector('[data-testid="request-create-submit"]');
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));
    });

    const { text, options } = notifyText();
    expect(text).toContain(
      "Заявка создана, результаты проверки будут отправлены на рассылку «Рассылка ООБ».",
    );
    expect(text).toContain("Ожидайте решения");
    expect(options.severity).toBe("success");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("без рассылки текст не врёт про неё", async () => {
    mailingRef.current = [];
    const button = document.querySelector('[data-testid="request-create-submit"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));
    });

    const { text } = notifyText();
    expect(text).toContain("Заявка создана.");
    expect(text).not.toContain("рассылку");
    expect(text).toContain("Ожидайте решения");
    mailingRef.current = ["Рассылка ООБ"];
  });

  it("после создания рассылки через диалог — тоже называем её", async () => {
    // В этой ветке названия рассылок кладёт в mailingRef сам useRequestForm
    // (из выбранных групп и созданного элемента DcEmail).
    saveDcEmailAndCreate.mockImplementation(async () => {
      mailingRef.current = ["_РЦ 8117 Отгрузка"];
      return { Id: 556 };
    });

    const dialogButton = document.querySelector('[data-testid="dcemail-submit"]');
    expect(dialogButton).toBeTruthy();
    await act(async () => {
      dialogButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(saveDcEmailAndCreate).toHaveBeenCalledTimes(1);
    const { text } = notifyText();
    expect(text).toContain(
      "Заявка создана, результаты проверки будут отправлены на рассылку «_РЦ 8117 Отгрузка».",
    );
    expect(text).toContain("Ожидайте решения");
    mailingRef.current = ["Рассылка ООБ"];
  });
});
