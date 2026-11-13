// @vitest-environment jsdom
// Проверяем сценарий исправления AssignedTo: открыть поиск, выбрать рассылку и сохранить.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const MAILING = {
  Id: 33,
  Title: "Рассылка РЦ Отгрузка",
  LoginName: "mailing-rc-shipping",
  Email: "rc-shipping@example.test",
  PrincipalType: 2,
};

vi.mock("../lib/assignees", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveAssigneeCached: vi.fn(async (_task, person) => ({
      id: person?.id ?? null,
      kind: "group",
      title: person?.title || "Текущая рассылка",
      loginName: null,
      email: null,
    })),
  };
});

vi.mock("../../../tasks/userSearch", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchSiteUsers: vi.fn(async (query) => (
      String(query).toLowerCase().includes("отгрузка") ? [MAILING] : []
    )),
    getUserPositions: vi.fn(async () => ({})),
  };
});

const { default: AssignedToButtons } = await import("../components/AssignedToButtons");
const { searchSiteUsers } = await import("../../../tasks/userSearch");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || (() => ({
  matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const settle = async (ms = 50) => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
};
const click = (element) => element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const typeInto = (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
};

let roots = [];
function render(task, onChangeAssignedTo = vi.fn(async () => true)) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <AssignedToButtons task={task} onChangeAssignedTo={onChangeAssignedTo} />
      </ThemeProvider>,
    );
  });
  return { host, onChangeAssignedTo };
}

describe("AssignedToButtons — смена рассылки", () => {
  beforeEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("открывает поиск только рассылок и сохраняет выбранный principal", async () => {
    const task = { Id: 42, AssignedTo: "Неверная рассылка", AssignedToId: 7 };
    const { host, onChangeAssignedTo } = render(task);

    const editButton = host.querySelector('[data-testid="assigned-to-edit-button"]');
    expect(editButton).toBeTruthy();
    await act(async () => { click(editButton); await settle(); });
    expect(document.body.textContent).toContain("Неверная рассылка");
    expect(document.body.querySelector('[data-testid="assigned-to-edit-dialog"]')).toBeTruthy();

    const input = document.body.querySelector('[data-testid="assigned-to-edit-dialog"] input');
    expect(input).toBeTruthy();
    await act(async () => { typeInto(input, "Отгрузка"); await settle(350); });
    expect(searchSiteUsers).toHaveBeenCalled();
    expect(searchSiteUsers.mock.calls.some((call) => call[1]?.distributionListsOnly === true)).toBe(true);

    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(MAILING.Title));
    expect(option).toBeTruthy();
    await act(async () => { click(option); await settle(); });

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(false);
    await act(async () => { click(saveButton); await settle(260); });
    expect(onChangeAssignedTo).toHaveBeenCalledTimes(1);
    expect(onChangeAssignedTo).toHaveBeenCalledWith(task, MAILING);
    // В jsdom exit-transition MUI оставляет закрытый Portal в DOM; save handler
    // получает выбранный principal и завершает успешный сценарий.
    await settle(250);
  });

  it("позволяет открыть редактор, даже если текущее AssignedTo пустое", async () => {
    const { host } = render({ Id: 43, AssignedTo: "", AssignedToId: null });
    const editButton = host.querySelector('[data-testid="assigned-to-edit-button"]');
    expect(editButton).toBeTruthy();
    await act(async () => { click(editButton); await settle(); });
    expect(document.body.querySelector('[data-testid="assigned-to-edit-dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Сейчас назначено: не назначена");
  });
});
