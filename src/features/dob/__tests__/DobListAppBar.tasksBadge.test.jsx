// @vitest-environment jsdom
// src/features/dob/__tests__/DobListAppBar.tasksBadge.test.jsx
//
// На бургере в #dob_requests должен быть чип с количеством активных задач —
// тот же, что в интерфейсе задач и на главной. Раньше в шапке заявок стоял
// обычный IconButton без бейджа.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

vi.mock("../state/DobListStateContext", () => ({
  useDobListState: () => ({
    rows: [],
    dirty: new Map(),
    saving: false,
    selectedId: null,
    handleSave: () => {},
    handleRevert: () => {},
    handleRefresh: () => {},
    openEdit: () => {},
  }),
}));

import DobListAppBar from "../components/DobListAppBar";

let root = null;
function render(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<DobListAppBar {...props} />); });
  return host;
}

beforeEach(() => {
  window.location.hash = "#dob_requests";
  document.body.innerHTML = "";
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("DobListAppBar — чип с задачами на бургере", () => {
  it("бургер открывает меню и показывает количество активных задач", () => {
    render({ onOpenDrawer: () => {}, tasksCount: 4 });
    const burger = document.querySelector('button[aria-label="Открыть меню"]');
    expect(burger).toBeTruthy();
    const badge = document.querySelector(".MuiBadge-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("4");
  });

  it("задач нет — чипа нет, бургер на месте", () => {
    render({ onOpenDrawer: () => {}, tasksCount: 0 });
    expect(document.querySelector('button[aria-label="Открыть меню"]')).toBeTruthy();
    const badge = document.querySelector(".MuiBadge-badge");
    expect(badge === null || badge.textContent === "").toBe(true);
  });
});
