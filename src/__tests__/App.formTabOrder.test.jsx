// @vitest-environment jsdom
// src/__tests__/App.formTabOrder.test.jsx
//
// Проверка номера ЕО срабатывает ПОСЛЕ выбора проблемы, а не на выходе из поля
// номера. Раньше диалог «Дубликат ЕО» вылетал на blur — до выбора проблемы,
// поэтому было неясно, какая из двух проверок должна работать, и они
// перекрывали друг друга.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const requests = vi.hoisted(() => ({ log: [], posts: [] }));
const EO_FOR_MOCK = "808003003003003003";

vi.mock("../api", () => {
  const get = async (url) => {
    const u = String(url);
    requests.log.push(u);
    if (u.includes("GetMyProperties")) {
      return {
        data: {
          d: {
            Title: "Поршаков Сергей",
            UserProfileProperties: {
              results: [
                { Key: "Office", Value: "РЦ-8117" },
                { Key: "Department", Value: "Отдел обеспечения бизнеса" },
              ],
            },
          },
        },
      };
    }
    if (u.includes("/web/currentuser")) return { data: { d: { Id: 10, Title: "Поршаков Сергей" } } };
    // Проверка «другой проблемы»: тот же ЕО, тот же РЦ, но с конкретной проблемой.
    // Отличается от проверки дубля отсутствием AuthorId в фильтре.
    if (u.includes("getbytitle('ProblemsPallet')/items") && !u.includes("AuthorId")) {
      return {
        data: {
          d: {
            results: [
              {
                Id: 25411,
                THU: EO_FOR_MOCK,
                DC_THU: "8117",
                Created: "2026-10-21T00:44:26Z",
                Problems: { results: ["Повреждение", "Плохая обмотка"] },
                Location1: "Не найдена в зоне отгрузки",
                Author: { Title: "Поршаков Сергей" },
              },
            ],
          },
        },
      };
    }
    // Проверка дубля: своя заявка по тому же ЕО (в фильтре есть AuthorId).
    if (u.includes("getbytitle('ProblemsPallet')/items") && u.includes("AuthorId")) {
      return {
        data: {
          d: {
            results: [
              { Id: 777, THU: EO_FOR_MOCK, DC_THU: "8117", Created: "2026-10-21T00:44:26Z", Author: { Title: "Поршаков Сергей" } },
            ],
          },
        },
      };
    }
    // Список получателей для RecipientAutocomplete
    if (u.includes("getbytitle('SCList')/items")) {
      return { data: { d: { results: [{ ID: 55, Title: "Магазин 55", SCNumberText: "55", SCNumber: "55" }] } } };
    }
    // Выбор проблем для мультиселекта
    if (u.includes("getbytitle('ProblemsPallet')/fields")) {
      return { data: { d: { results: [{ InternalName: "Problems", Choices: { results: ["Не найдена", "Брак упаковки"] } }] } } };
    }
    return { data: { d: { results: [] } } };
  };
  return {
    default: {
      get,
      post: async (url) => {
        requests.posts.push(String(url));
        return { data: { d: { GetContextWebInformation: { FormDigestValue: "digest" } } } };
      },
      defaults: { headers: {} },
    },
    invalidate: () => {},
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => Promise.reject(new Error("нет камеры")) }, configurable: true });
}

const App = (await import("../App")).default;

const EO = "808003003003003003";

/** Запросы проверки ЕО — те, что фильтруют по номеру. */
const eoChecks = () => requests.log.filter(
  (u) => u.includes("getbytitle('ProblemsPallet')/items") && /THU(%20|\s)eq/.test(u),
);

async function mountApp() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={createTheme()}>
          <App />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
  return { host, root };
}

/** Ввод в поле + уход из фокуса — как при переходе табом к следующему полю. */
async function typeEoAndBlur(host) {
  const input = host.querySelector('input[inputmode="numeric"]');
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, EO);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => {
    input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  return input;
}

/** Открыть мультиселект проблем и отметить нужную. */
async function pickProblem(host, label) {
  const combo = host.querySelector('#select-multiple-chip') || host.querySelector('[role="combobox"]');
  expect(combo).toBeTruthy();
  await act(async () => {
    combo.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
  });
  const option = [...document.body.querySelectorAll('[role="option"]')].find((o) => (o.textContent || "").includes(label));
  expect(option).toBeTruthy();
  await act(async () => {
    option.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
  });
}

/** Ждать появления элемента: фиксированная пауза на холодном прогоне не надёжна. */
async function waitForTestId(testid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (el) return el;
    if (Date.now() > deadline) throw new Error(`Не дождались ${testid}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
}

/** Инпут поля по тексту подписи (MUI добавляет « *» для required). */
function inputByLabel(root, label) {
  const lab = [...root.querySelectorAll("label")].find(
    (l) => (l.textContent || "").replace(/\s*\*\s*$/, "").trim() === label,
  );
  if (!lab) return null;
  const box = lab.closest(".MuiFormControl-root") || lab.parentElement;
  return box ? box.querySelector("input") : null;
}

/** Ждать исчезновения элемента: диалог закрывается с анимацией. */
async function waitForGone(testid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!document.querySelector(`[data-testid="${testid}"]`)) return;
    if (Date.now() > deadline) throw new Error(`Элемент ${testid} так и не исчез`);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
}

async function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
  });
}

/** Выбрать получателя в автокомплите. */
async function pickRecipient(host) {
  const input = inputByLabel(host, "Номер получателя");
  expect(input).toBeTruthy();
  await act(async () => {
    input.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 150));
  });
  const option = [...document.body.querySelectorAll('[role="option"]')].find((o) =>
    (o.textContent || "").includes("55"),
  );
  expect(option).toBeTruthy();
  await act(async () => {
    option.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 100));
  });
}


const settle = async (ms = 300) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe("Главная форма — переходы по Tab", () => {
  it("Номер ЕО(1) → Номер получателя(2) → Тип проблемы(3) → … → Отправить(6)", async () => {
    const { host, root } = await mountApp();

    // 1 — «Номер ЕО»: единственный input с inputmode=numeric на самом элементе.
    const eo = host.querySelector('input[inputmode="numeric"]');
    expect(eo).toBeTruthy();
    expect(eo.getAttribute("tabindex")).toBe("1");

    // Два combobox: автокомплит получателя и мультиселект «Выберите проблемы».
    const combos = [...host.querySelectorAll('[role="combobox"]')];
    expect(combos.length).toBeGreaterThanOrEqual(2);
    const recipient = combos.find((c) => c.closest(".MuiAutocomplete-root"));
    expect(recipient).toBeTruthy();
    expect(recipient.getAttribute("tabindex")).toBe("2");

    const problems = combos.find((c) => !c.closest(".MuiAutocomplete-root"));
    expect(problems).toBeTruthy();
    expect(problems.getAttribute("tabindex")).toBe("3");

    const submit = host.querySelector('button[type="submit"]');
    expect(submit).toBeTruthy();
    expect(submit.getAttribute("tabindex")).toBe("6");

    await act(async () => { root.unmount(); host.remove(); });
  });

  it("«Другое местоположение» идёт после типа проблемы (5)", async () => {
    const { host, root } = await mountApp();
    const loc = [...host.querySelectorAll("input")].find(
      (i) => (i.closest(".MuiFormControl-root")?.textContent || "").includes("Другое местоположение"),
    );
    expect(loc).toBeTruthy();
    expect(loc.getAttribute("tabindex")).toBe("5");
    await act(async () => { root.unmount(); host.remove(); });
  });
});

const photoTips = () => [...document.body.querySelectorAll('[role="tooltip"]')]
  .some((el) => (el.textContent || "").includes("Добавьте фото"));

describe("Главная форма — Enter отправляет форму", () => {
  // Пустая форма при отправке упирается в ранний выход «нет фото» ещё ДО
  // setErrors (setShowPhotoTips(true) + return), поэтому наблюдаемый признак
  // отправки — не текст ошибки поля, а тултип «Добавьте фото…» в портале.
  afterEach(() => { document.body.innerHTML = ""; });

  it("Enter в «Номер ЕО» отправляет форму — как клик по «Отправить»", async () => {
    const { host, root } = await mountApp();
    expect(photoTips()).toBe(false);

    await act(async () => {
      host.querySelector('input[inputmode="numeric"]')
        .dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle(300);
    expect(photoTips()).toBe(true);   // отправка состоялась

    await act(async () => { root.unmount(); host.remove(); });
  });

  // Эквивалентность с кликом по кнопке здесь не проверяется: jsdom не
  // запускает отправку формы по синтетическому click на submit-кнопке
  // (проверено — тултип не появляется), это ограничение среды, а не продукта.

  it("Enter внутри автокомплита получателя форму НЕ отправляет (там он выбирает вариант)", async () => {
    const { host, root } = await mountApp();
    const recipient = [...host.querySelectorAll('[role="combobox"]')]
      .find((c) => c.closest(".MuiAutocomplete-root"));
    expect(recipient).toBeTruthy();
    await act(async () => {
      recipient.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle(300);
    expect(photoTips()).toBe(false);
    await act(async () => { root.unmount(); host.remove(); });
  });
});
