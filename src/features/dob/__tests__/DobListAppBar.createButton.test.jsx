// @vitest-environment jsdom
// src/features/dob/__tests__/DobListAppBar.createButton.test.jsx
// Кнопка «Создать заявку» в шапке списка должна РЕАЛЬНО открывать форму
// создания (#dob_requests/new), а не просто рисоваться.

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
});

describe("DobListAppBar", () => {
  it("«Создать заявку» ведёт на #dob_requests/new", () => {
    const button = document.querySelector('[data-testid="request-create-open"]');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Создать заявку");
    expect(button.disabled).toBe(false);

    act(() => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(window.location.hash).toBe("#dob_requests/new");
  });
});
