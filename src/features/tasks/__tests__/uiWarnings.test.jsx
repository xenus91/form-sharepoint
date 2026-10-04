// @vitest-environment jsdom
// src/features/tasks/__tests__/uiWarnings.test.jsx
//
// Регрессия по консоли разработчика: React ругался
//   «A props object containing a "key" prop is being spread into JSX»
// на форме результата: `<TextField {...common} />`, где в объекте common лежал key
// (в консоли было видно «let props = {key: someKey, size: ..., ...}»).
//
// ВАЖНО: файл специально отдельный — React показывает warning про key один раз на
// модуль, поэтому проверка должна идти ДО любого другого рендера этих компонентов.

import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const MAIN_FIELDS = [
  { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "OutcomeChoice", Required: true, Choices: { results: ["Годен", "Брак"] } },
  { InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true },
  { InternalName: "ErrorCountValidation", Title: "ErrorCountValidation", TypeAsString: "Number" },
];

vi.mock("../../dob/components/RichEditor", () => ({
  default: ({ value }) => <textarea data-testid="rich-editor" value={value || ""} readOnly />,
}));

vi.mock("../../../tasks/contentTypeFields", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchContentTypeFields: vi.fn(async () => MAIN_FIELDS) };
});

const { default: ContentTypeResultDialog } = await import("../components/ContentTypeResultDialog");
const { RESULT_CHECK_OOO_CT_ID } = await import("../../../tasks/contentTypeFields");

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

const settle = async (ms = 60) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

const KEY_SPREAD = /key/i;

describe("консоль UI: нет React-варнинга про key в spread", () => {
  it("поля формы результата не спредят props с key", async () => {
    const messages = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...a) => { messages.push(a.map(String).join(" ")); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...a) => { messages.push(a.map(String).join(" ")); });
    const roots = [];
    try {
      // 1) Форма результата по типу контента (в ней раньше был key внутри common)
      const host1 = document.createElement("div");
      document.body.appendChild(host1);
      const root1 = createRoot(host1);
      roots.push(root1);
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      act(() => {
        root1.render(
          <QueryClientProvider client={qc}>
            <ThemeProvider theme={createTheme()}>
              <ContentTypeResultDialog
                open
                task={{ Id: 501, Title: "Результат проверки ООБ" }}
                contentTypeId={RESULT_CHECK_OOO_CT_ID}
                resultChoices={["Годен", "Брак"]}
                onSubmit={vi.fn()}
                onClose={vi.fn()}
              />
            </ThemeProvider>
          </QueryClientProvider>,
        );
      });
      await settle(80);

      const bad = messages.filter((m) => KEY_SPREAD.test(m) && /props object|spread/i.test(m));
      expect(bad).toEqual([]);
    } finally {
      for (const root of roots) { try { act(() => root.unmount()); } catch (_e) { void _e; } }
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      document.body.innerHTML = "";
    }
  });
});
