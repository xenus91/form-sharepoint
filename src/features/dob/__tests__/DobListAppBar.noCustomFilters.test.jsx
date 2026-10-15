// @vitest-environment jsdom
// src/features/dob/__tests__/DobListAppBar.noCustomFilters.test.jsx
//
// Требование 2026-10-15: своих селектов «Статус» / «Тип заявки» и переключателя
// группировки в шапке больше нет — фильтрацию, группировку и закрепление
// колонок пользователь настраивает интерфейсом самого AG Grid.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const state = {
  rows: [{ ID: 1 }, { ID: 2 }],
  selectedId: null,
  handleRefresh: vi.fn(),
  openItem: vi.fn(),
  scopeNote: "Показаны заявки офиса РЦ-8114",
  scopeWarning: "",
};

vi.mock("../state/DobListStateContext", () => ({
  useDobListState: () => state,
}));

import DobListAppBar from "../components/DobListAppBar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
beforeEach(() => {
  window.location.hash = "#dob_requests";
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<DobListAppBar />); });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const buttonLabels = () => [...document.body.querySelectorAll("button")].map((b) => (b.textContent || "").trim());

describe("шапка #dob_requests", () => {
  it("своих фильтров и переключателя группировки нет", () => {
    expect(document.querySelector('[data-testid="dob-filter-status"]')).toBe(null);
    expect(document.querySelector('[data-testid="dob-filter-ct"]')).toBe(null);
    expect(document.querySelector('[data-testid="dob-group-toggle"]')).toBe(null);
    const text = document.body.textContent || "";
    expect(text).not.toContain("Тип заявки");
    expect(text).not.toContain("Группы по статусу");
  });

  it("кнопок правки нет, а «Открыть» и «Создать заявку» остались", () => {
    const labels = buttonLabels();
    expect(labels.some((t) => t === "Изменить")).toBe(false);
    expect(labels.some((t) => t === "Сбросить")).toBe(false);
    expect(labels.some((t) => t.startsWith("Сохранить"))).toBe(false);
    expect(labels.some((t) => t === "Открыть")).toBe(true);
    expect(labels.some((t) => t === "Создать заявку")).toBe(true);
  });

  it("«Открыть» ведёт к форме выбранной заявки", () => {
    expect(document.querySelector('[data-testid="dob-open-item"]').disabled).toBe(true);
    state.selectedId = "42";
    act(() => { root.render(<DobListAppBar />); });
    const open = document.querySelector('[data-testid="dob-open-item"]');
    expect(open.disabled).toBe(false);
    act(() => { open.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(state.openItem).toHaveBeenCalledWith("42");
    state.selectedId = null;
  });

  it("показывает область видимости и предупреждение, если фильтр не применился", () => {
    expect(document.querySelector('[data-testid="dob-scope-chip"]').textContent).toContain("Мои заявки");

    state.scopeWarning = "В списке нет колонки DC — фильтр по подразделению не применён.";
    act(() => { root.render(<DobListAppBar />); });
    expect(document.querySelector('[data-testid="dob-scope-warning"]')).toBeTruthy();
    state.scopeWarning = "";
  });
});
