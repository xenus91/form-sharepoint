// @vitest-environment jsdom
// src/__tests__/App.eoDuplicateTiming.test.jsx
//
// Проверка номера ЕО срабатывает ПОСЛЕ выбора проблемы, а не на выходе из поля
// номера. Раньше диалог «Дубликат ЕО» вылетал на blur — до выбора проблемы,
// поэтому было неясно, какая из двух проверок должна работать, и они
// перекрывали друг друга.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const requests = vi.hoisted(() => ({ log: [] }));

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
    // Выбор проблем для мультиселекта
    if (u.includes("getbytitle('ProblemsPallet')/fields")) {
      return { data: { d: { results: [{ InternalName: "Problems", Choices: { results: ["Не найдена", "Брак упаковки"] } }] } } };
    }
    return { data: { d: { results: [] } } };
  };
  return {
    default: { get, post: async () => ({ data: { d: {} } }), defaults: { headers: {} } },
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

describe("проверка ЕО — после выбора проблемы, не на blur", () => {
  beforeEach(() => {
    requests.log.length = 0;
    window.history.replaceState(null, "", "/#form");
  });

  it("уход из поля «Номер ЕО» проверку НЕ запускает", async () => {
    const { host, root } = await mountApp();
    await typeEoAndBlur(host);

    expect(eoChecks()).toEqual([]);
    // Формат при этом по-прежнему валидируется на blur — ошибки нет.
    expect(host.textContent).not.toContain("Введите 17 или 18 цифр");

    await act(async () => { root.unmount(); });
    host.remove();
  }, 30000);

  it("выбор проблемы запускает проверку по введённому номеру ЕО", async () => {
    const { host, root } = await mountApp();
    await typeEoAndBlur(host);
    expect(eoChecks()).toEqual([]);

    // Открываем мультиселект проблем и выбираем «Не найдена».
    const combo = host.querySelector('#select-multiple-chip') || host.querySelector('[role="combobox"]');
    expect(combo).toBeTruthy();
    await act(async () => {
      combo.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((o) => (o.textContent || "").includes("Не найдена"));
    expect(option).toBeTruthy();
    await act(async () => {
      option.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });

    // Проверка ушла — и именно по нашему номеру ЕО.
    const hits = eoChecks();
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toContain(EO);

    await act(async () => { root.unmount(); });
    host.remove();
  }, 30000);

  it("некорректный номер на blur даёт подсказку, но тоже без запроса", async () => {
    const { host, root } = await mountApp();
    const input = host.querySelector('input[inputmode="numeric"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, "123");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(host.textContent).toContain("Введите 17 или 18 цифр");
    expect(eoChecks()).toEqual([]);

    await act(async () => { root.unmount(); });
    host.remove();
  }, 30000);
});
