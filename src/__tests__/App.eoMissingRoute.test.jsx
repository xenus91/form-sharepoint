// @vitest-environment jsdom
// src/__tests__/App.eoMissingRoute.test.jsx
//
// Сквозная проверка роута #eoismissing: App открывает стандартную форму с уже
// выбранной проблемой «Не найдена» и проставленным местоположением.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../api", () => {
  const get = async (url) => {
    const u = String(url);
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
    if (u.includes("/fields")) return { data: { d: { results: [] } } };
    return { data: { d: { results: [] } } };
  };
  return {
    default: { get, post: async () => ({ data: { d: {} } }), defaults: { headers: {} } },
    invalidate: () => {},
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// В jsdom нет matchMedia/getUserMedia — MUI и камера без них падают.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => Promise.reject(new Error("нет камеры")) }, configurable: true });
}

const App = (await import("../App")).default;

/** Значения полей формы: MUI держит их в value, а не в textContent. */
const fieldValues = (host) => [...host.querySelectorAll("input, textarea")].map((i) => String(i.value ?? ""));

const mountApp = async () => {
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
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
  return {
    host,
    values: () => fieldValues(host),
    close: async () => {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
};

describe("роут #eoismissing", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#eoismissing");
  });

  it("открывает форму с выбранной проблемой «Не найдена»", async () => {
    const app = await mountApp();

    // Местоположение проставилось вместе с проблемой (как в handleChange).
    expect(app.values()).toContain("Не найдена в зоне отгрузки");
    // Сама проблема выбрана: MUI Select multiple держит значения в hidden input.
    expect(app.values().some((v) => v.split(",").includes("Не найдена"))).toBe(true);

    await app.close();
  }, 30000);

  it.each(["#eoismissing", "#/eoismissing"])("не стирает %s из адреса", async (hash) => {
    window.history.replaceState(null, "", `/${hash}`);
    const app = await mountApp();

    // Если хэш стереть, после F5 форма откроется пустой.
    expect(window.location.hash.toLowerCase()).toContain("eoismissing");

    await app.close();
  }, 30000);

  it("после обновления страницы предвыбор срабатывает снова", async () => {
    const first = await mountApp();
    expect(window.location.hash.toLowerCase()).toContain("eoismissing");
    const urlAfterLoad = window.location.pathname + window.location.search + window.location.hash;
    await first.close();

    // «Обновление»: тот же адрес, новый монтаж.
    window.history.replaceState(null, "", urlAfterLoad);
    const second = await mountApp();
    expect(second.values()).toContain("Не найдена в зоне отгрузки");
    expect(second.values().some((v) => v.split(",").includes("Не найдена"))).toBe(true);
    await second.close();
  }, 30000);
});
