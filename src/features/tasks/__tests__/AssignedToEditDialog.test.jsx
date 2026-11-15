// @vitest-environment jsdom
// Диалог ищет группы, исключает пользователей и передаёт выбранный principal на сохранение.

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
const SECURITY_GROUP = {
  Id: 34,
  Title: "Группа РЦ Отгрузка",
  LoginName: "RETAIL\\rc-group",
  PrincipalType: 4,
};
const EMPLOYEE = {
  Id: 35,
  Title: "Сотрудник Отгрузка",
  LoginName: "i:0#.f|membership|employee@example.test",
  PrincipalType: 1,
};

vi.mock("../../../tasks/userSearch", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchAssignedToGroups: vi.fn(async (query) => {
      const value = String(query).toLowerCase();
      if (value.includes("группа")) return [SECURITY_GROUP];
      if (value.includes("сотрудник")) return [EMPLOYEE];
      return value.includes("отгрузка") ? [MAILING] : [];
    }),
    getUserPositions: vi.fn(async () => ({})),
  };
});

const { default: AssignedToEditDialog } = await import("../components/AssignedToEditDialog");
const { searchAssignedToGroups } = await import("../../../tasks/userSearch");

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
function render(task, onSave = vi.fn(async () => true)) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const onClose = vi.fn();
  act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <AssignedToEditDialog open task={task} onClose={onClose} onSave={onSave} />
      </ThemeProvider>,
    );
  });
  return { host, onSave, onClose };
}

describe("AssignedToEditDialog — поиск группы", () => {
  beforeEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("ищет и сохраняет выбранную рассылку", async () => {
    const task = { Id: 42, AssignedTo: "Неверная рассылка", AssignedToId: 7 };
    const { onSave, onClose } = render(task);

    expect(document.body.textContent).toContain("Неверная рассылка");
    const dialog = document.body.querySelector('[data-testid="assigned-to-edit-dialog"]');
    expect(dialog).toBeTruthy();
    const input = dialog.querySelector("input");
    expect(input).toBeTruthy();

    await act(async () => { typeInto(input, "Отгрузка"); await settle(350); });
    expect(searchAssignedToGroups).toHaveBeenCalledWith("Отгрузка", { limit: 20 });

    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(MAILING.Title));
    expect(option).toBeTruthy();
    await act(async () => { click(option); await settle(); });

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(false);
    await act(async () => { click(saveButton); await settle(260); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(MAILING);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("разрешает сохранить security-группу с PrincipalType=4", async () => {
    const onSave = vi.fn(async () => true);
    render({ Id: 44, AssignedTo: "", AssignedToId: null }, onSave);
    const dialog = document.body.querySelector('[data-testid="assigned-to-edit-dialog"]');
    const input = dialog.querySelector("input");

    await act(async () => { typeInto(input, "Группа"); await settle(350); });
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(SECURITY_GROUP.Title));
    expect(option).toBeTruthy();
    await act(async () => { click(option); await settle(); });

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(false);
    await act(async () => { click(saveButton); await settle(260); });
    expect(onSave).toHaveBeenCalledWith(SECURITY_GROUP);
  });

  it("блокирует сохранение, если ответ ошибочно содержит пользователя", async () => {
    render({ Id: 45, AssignedTo: "", AssignedToId: null });
    const input = document.body.querySelector("input");

    await act(async () => { typeInto(input, "Сотрудник"); await settle(350); });
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(EMPLOYEE.Title));
    expect(option).toBeTruthy();
    await act(async () => { click(option); await settle(); });

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(true);
  });

  it("не позволяет сохранить назначение до выбора группы", () => {
    render({ Id: 43, AssignedTo: "", AssignedToId: null });
    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton).toBeTruthy();
    expect(saveButton.disabled).toBe(true);
  });
});
