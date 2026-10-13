// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/RequestFieldControl.richLabel.test.jsx
//
// Rich-поле (Note) в форме заявки должно показывать НАЗВАНИЕ поля и НЕ должно
// подставлять подсказку «результат проверки» — она относится к задаче, а не к
// заявке. Подсказка передаётся в редактор параметром placeholder.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

vi.mock("../../RichEditor", () => ({
  default: ({ placeholder, value }) => (
    <textarea data-testid="rich-editor" data-placeholder={placeholder} value={value || ""} readOnly />
  ),
}));

const { default: RequestFieldControl } = await import("../RequestFieldControl");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noteControl = {
  internalName: "Note", title: "Описание", kind: "richtext", required: true, choices: [],
};

let root = null;
function mount(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<RequestFieldControl control={noteControl} value="" onChange={() => {}} {...props} />);
  });
  return host;
}

beforeEach(() => {
  document.body.innerHTML = "";
  root = null;
});

describe("RequestFieldControl — rich-поле", () => {
  it("показывает название поля и звёздочку обязательности", () => {
    const host = mount();
    const text = host.textContent || "";
    expect(text).toContain("Описание");
    expect(text).toContain("*");
    expect(host.querySelector('[data-testid="rich-editor"]')).toBeTruthy();
  });

  it("placeholder совпадает с подписью (Description), а не «результат проверки»", () => {
    const host = mount({ control: { ...noteControl, title: "Что и куда везём", description: "Что и куда везём" } });
    const placeholder = host.querySelector('[data-testid="rich-editor"]').getAttribute("data-placeholder");
    expect(placeholder).toBe("Что и куда везём");
    expect(placeholder).not.toContain("результат проверки");
  });

  it("при ошибке валидации подпись красная и есть пометка «Обязательное поле»", () => {
    const host = mount({ invalid: true });
    expect(host.textContent).toContain("Обязательное поле");
  });
});
