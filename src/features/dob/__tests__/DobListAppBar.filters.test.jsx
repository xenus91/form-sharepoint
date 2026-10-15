// @vitest-environment jsdom
// src/features/dob/__tests__/DobListAppBar.filters.test.jsx
//
// Шапка #dob_requests (требования 2026-10-15):
//   * фильтры по статусу и типу заявки + переключатель группировки;
//   * кнопок правки («Изменить» / «Сбросить» / «Сохранить») больше нет.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const state = {
  rows: [{ ID: 1 }, { ID: 2 }],
  selectedId: null,
  handleRefresh: vi.fn(),
  openItem: vi.fn(),
  statusOptions: ["Открыт", "Завершена"],
  statusFilter: ["Открыт"],
  setStatusFilter: vi.fn(),
  ctOptions: [
    { id: "0x0100AA", label: "Заявка на проверку" },
    { id: "0x0100BB", label: "Заявка ООБ" },
  ],
  ctFilter: [],
  setCtFilter: vi.fn(),
  groupByStatus: true,
  setGroupByStatus: vi.fn(),
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

const buttons = () => [...document.body.querySelectorAll("button")].map((b) => (b.textContent || "").trim());

describe("шапка #dob_requests", () => {
  it("есть фильтры статуса и типа заявки, группировка включена", () => {
    expect(document.body.textContent).toContain("Статус");
    expect(document.body.textContent).toContain("Тип заявки");
    // выбранный по умолчанию статус виден чипом
    expect(document.body.textContent).toContain("Открыт");
    const toggle = document.querySelector('[data-testid="dob-group-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it("кнопок правки заявок в шапке нет", () => {
    const labels = buttons();
    expect(labels.some((t) => t === "Изменить")).toBe(false);
    expect(labels.some((t) => t === "Сбросить")).toBe(false);
    expect(labels.some((t) => t.startsWith("Сохранить"))).toBe(false);
    // но открыть заявку на просмотр и создать новую — можно
    expect(labels.some((t) => t === "Открыть")).toBe(true);
    expect(labels.some((t) => t === "Создать заявку")).toBe(true);
  });

  it("«Открыть» недоступна без выбранной строки и ведёт к форме заявки", () => {
    const open = document.querySelector('[data-testid="dob-open-item"]');
    expect(open.disabled).toBe(true);

    act(() => { root.render(<DobListAppBar />); });
    state.selectedId = "42";
    act(() => { root.render(<DobListAppBar />); });
    const enabled = document.querySelector('[data-testid="dob-open-item"]');
    expect(enabled.disabled).toBe(false);
    act(() => { enabled.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(state.openItem).toHaveBeenCalledWith("42");
    state.selectedId = null;
  });

  it("переключатель группировки вызывает setGroupByStatus", () => {
    const toggle = document.querySelector('[data-testid="dob-group-toggle"]');
    act(() => { toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(state.setGroupByStatus).toHaveBeenCalled();
  });

  it("показывает, по какому правилу отобраны заявки", () => {
    const chip = document.querySelector('[data-testid="dob-scope-chip"]');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("Мои заявки");
  });

  it("если правило применить не удалось — видно предупреждение", () => {
    state.scopeWarning = "В списке нет колонки DC — фильтр по подразделению не применён.";
    act(() => { root.render(<DobListAppBar />); });
    const warn = document.querySelector('[data-testid="dob-scope-warning"]');
    expect(warn).toBeTruthy();
    state.scopeWarning = "";
  });
});
