// @vitest-environment jsdom
// Диалог ищет группы, исключает пользователей и передаёт выбранный principal на сохранение.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const apiState = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../../api", () => ({
  default: { get: (...args) => apiState.get(...args) },
}));

const MAILING = {
  Id: 33,
  Title: "Рассылка РЦ 8117 Отгрузка",
  LoginName: "mailing-rc-shipping",
  Email: "rc-shipping@example.test",
  PrincipalType: 2,
};
const SECURITY_GROUP = {
  Id: 34,
  Title: "Группа РЦ 8117 Отгрузка",
  LoginName: "RETAIL\\rc-group",
  PrincipalType: 4,
};
const EMPLOYEE = {
  Id: 35,
  Title: "Сотрудник РЦ 8117 Отгрузка",
  LoginName: "i:0#.f|membership|employee@example.test",
  PrincipalType: 1,
};
const OTHER_RC_GROUP = {
  Id: 36,
  Title: "Группа РЦ 9120 Отгрузка",
  LoginName: "RETAIL\\rc-9120-group",
  PrincipalType: 4,
};
const OFFICE_PREFIX_GROUP = {
  Id: 37,
  Title: "Группа РЦ 81170 Отгрузка",
  LoginName: "RETAIL\\rc-81170-group",
  PrincipalType: 4,
};
const SHIFT_GROUP = {
  Id: 38,
  Title: "_РЦ 8117 Нач.смены В",
  LoginName: "mailing_rc-8117-shift-v",
  Email: "rc-8117-shift-v@example.test",
  PrincipalType: 2,
};

vi.mock("../../../tasks/userSearch", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchAssignedToGroups: vi.fn(async (query) => {
      const value = String(query).toLowerCase();
      if (value.includes("сотрудник")) return [EMPLOYEE];
      if (value.includes("группа")) return [SECURITY_GROUP, OTHER_RC_GROUP, OFFICE_PREFIX_GROUP];
      if (value.includes("рц 8117")) {
        return [MAILING, SECURITY_GROUP, SHIFT_GROUP, OTHER_RC_GROUP, OFFICE_PREFIX_GROUP];
      }
      if (value.includes("отгрузка")) return [MAILING, SECURITY_GROUP, OTHER_RC_GROUP, OFFICE_PREFIX_GROUP];
      return [];
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
function render(task, onSave = vi.fn(async () => true), currentUserOffice = "") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const onClose = vi.fn();
  act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <AssignedToEditDialog
          open
          task={task}
          currentUserOffice={currentUserOffice}
          onClose={onClose}
          onSave={onSave}
        />
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
    apiState.get.mockReset();
    apiState.get.mockResolvedValue({ data: { d: {
      UserProfileProperties: { results: [{ Key: "Office", Value: "РЦ-8117" }] },
    } } });
  });

  it("ищет и сохраняет выбранную рассылку", async () => {
    const task = { Id: 42, AssignedTo: "Неверная рассылка", AssignedToId: 7 };
    const { onSave, onClose } = render(task);

    expect(document.body.textContent).toContain("Неверная рассылка");
    const dialog = document.body.querySelector('[data-testid="assigned-to-edit-dialog"]');
    expect(dialog).toBeTruthy();
    const input = dialog.querySelector("input");
    expect(input).toBeTruthy();
    await settle(30);
    expect(input.value).toBe("");
    expect(dialog.textContent).toContain("Фильтр Office (не изменяется): РЦ 8117");
    expect(apiState.get).toHaveBeenCalledWith(
      "/SP.UserProfiles.PeopleManager/GetMyProperties",
      { headers: { Accept: "application/json;odata=verbose" } },
    );

    await act(async () => { typeInto(input, "Отгрузка"); await settle(350); });
    expect(searchAssignedToGroups).toHaveBeenCalledWith("Отгрузка", { limit: 20 });

    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(MAILING.Title));
    expect(option).toBeTruthy();
    expect(document.body.textContent).not.toContain(OTHER_RC_GROUP.Title);
    expect(document.body.textContent).not.toContain(OFFICE_PREFIX_GROUP.Title);
    await act(async () => { click(option); await settle(); });

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(false);
    expect(window.getComputedStyle(saveButton).color).toBe("rgb(255, 255, 255)");
    await act(async () => { click(saveButton); await settle(260); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(MAILING);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("показывает заранее отфильтрованные группы и локально сужает по «Нач»", async () => {
    const onSave = vi.fn(async () => true);
    render({ Id: 44, AssignedTo: "", AssignedToId: null }, onSave, "РЦ-8117");
    const dialog = document.body.querySelector('[data-testid="assigned-to-edit-dialog"]');
    const input = dialog.querySelector("input");
    await settle(60);
    expect(input.value).toBe("");
    expect(dialog.textContent).toContain("Фильтр Office (не изменяется): РЦ 8117");
    expect(apiState.get).not.toHaveBeenCalled();
    expect(searchAssignedToGroups).toHaveBeenCalledWith("РЦ 8117", { limit: 100 });

    const popupButton = dialog.querySelector(".MuiAutocomplete-popupIndicator");
    expect(popupButton).toBeTruthy();
    await act(async () => { click(popupButton); await settle(); });
    const prefetchedOptions = [...document.body.querySelectorAll('[role="option"]')];
    expect(prefetchedOptions.some((option) => option.textContent.includes(SHIFT_GROUP.Title))).toBe(true);
    expect(prefetchedOptions.some((option) => option.textContent.includes(MAILING.Title))).toBe(true);
    expect(document.body.textContent).not.toContain(OTHER_RC_GROUP.Title);
    expect(document.body.textContent).not.toContain(OFFICE_PREFIX_GROUP.Title);

    await act(async () => { typeInto(input, "Нач"); await settle(350); });
    expect(searchAssignedToGroups).toHaveBeenCalledWith("Нач", { limit: 20 });
    const shiftOption = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(SHIFT_GROUP.Title));
    expect(shiftOption).toBeTruthy();
    expect(document.body.textContent).not.toContain(OTHER_RC_GROUP.Title);
    await act(async () => { click(shiftOption); await settle(); });

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(false);
    await act(async () => { click(saveButton); await settle(260); });
    expect(onSave).toHaveBeenCalledWith(SHIFT_GROUP);
  });

  it("исключает текущее назначение и из предзагрузки, и из результатов поиска", async () => {
    const onSave = vi.fn(async () => true);
    render({
      Id: 46,
      AssignedTo: SECURITY_GROUP.Title,
      AssignedToId: SECURITY_GROUP.Id,
    }, onSave, "РЦ-8117");
    const dialog = document.body.querySelector('[data-testid="assigned-to-edit-dialog"]');
    const input = dialog.querySelector("input");
    await settle(60);

    const popupButton = dialog.querySelector(".MuiAutocomplete-popupIndicator");
    await act(async () => { click(popupButton); await settle(); });
    const optionsBeforeTyping = [...document.body.querySelectorAll('[role="option"]')];
    expect(optionsBeforeTyping.some((option) => option.textContent.includes(SECURITY_GROUP.Title))).toBe(false);
    expect(optionsBeforeTyping.some((option) => option.textContent.includes(SHIFT_GROUP.Title))).toBe(true);

    await act(async () => { typeInto(input, "Группа"); await settle(350); });
    expect(searchAssignedToGroups).toHaveBeenCalledWith("Группа", { limit: 20 });
    const optionsAfterTyping = [...document.body.querySelectorAll('[role="option"]')];
    expect(optionsAfterTyping.some((option) => option.textContent.includes(SECURITY_GROUP.Title))).toBe(false);
    expect(optionsAfterTyping.some((option) => option.textContent.includes(OTHER_RC_GROUP.Title))).toBe(false);
    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("не показывает сотрудника, даже если поиск ошибочно его вернул", async () => {
    render({ Id: 45, AssignedTo: "", AssignedToId: null });
    const input = document.body.querySelector("input");
    await settle(30);
    expect(input.value).toBe("");

    await act(async () => { typeInto(input, "Сотрудник"); await settle(350); });
    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((element) => element.textContent.includes(EMPLOYEE.Title));
    expect(option).toBeFalsy();

    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton.disabled).toBe(true);
  });

  it("не позволяет сохранить назначение до выбора группы", async () => {
    render({ Id: 43, AssignedTo: "", AssignedToId: null });
    await settle(30);
    const saveButton = document.body.querySelector('[data-testid="assigned-to-save"]');
    expect(saveButton).toBeTruthy();
    expect(saveButton.disabled).toBe(true);
  });
});
