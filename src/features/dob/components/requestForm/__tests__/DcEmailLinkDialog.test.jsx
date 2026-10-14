// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/DcEmailLinkDialog.test.jsx
// Диалог «укажите рассылку»: только группы, многократный выбор; без выбора
// кнопка не отправляет.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

// Подменяем автокомплит (как поле «Виновный»), чтобы проверить логику диалога без MUI-ввода.
vi.mock("../../../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ value = [], onChange, helperText = "", search }) => (
    <div data-testid="group-field" data-has-search={search ? "1" : "0"}>
      <button
        data-testid="pick-group"
        onClick={() => onChange([...value, { Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }])}
      >
        pick
      </button>
      <span data-testid="group-count">{value.length}</span>
      {helperText ? <span data-testid="group-helper">{helperText}</span> : null}
    </div>
  ),
}));

import DcEmailLinkDialog from "../DcEmailLinkDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
function mount(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<DcEmailLinkDialog open {...props} />); });
  return host;
}

const byTestid = (id) => document.querySelector(`[data-testid="${id}"]`);
const click = (id) => act(() => { byTestid(id).dispatchEvent(new MouseEvent("click", { bubbles: true })); });

beforeEach(() => {
  document.body.innerHTML = "";
  root = null;
});

describe("DcEmailLinkDialog", () => {
  it("показывает офис/департамент и требует выбрать хотя бы одну группу", () => {
    const onSubmit = vi.fn();
    mount({ office: "РЦ-8114", department: "Группа отгрузки", offDepKey: "РЦ-8114Группа отгрузки", onSubmit });
    expect(document.body.textContent).toContain("Укажите рассылку для связи офиса и департамента");
    expect(document.body.textContent).toContain("РЦ-8114");
    expect(document.body.textContent).toContain("Группа отгрузки");

    // без выбора — отправки нет, появляется подсказка
    click("dcemail-save");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Выберите хотя бы одну группу");
  });

  it("после выбора группы отправляет их наверх", () => {
    const onSubmit = vi.fn();
    mount({ office: "РЦ-8114", department: "Группа отгрузки", onSubmit });

    click("pick-group");
    expect(byTestid("group-count").textContent).toBe("1");
    // автокомплит работает по принципу «Виновного» — ему передан свой поиск
    expect(byTestid("group-field").getAttribute("data-has-search")).toBe("1");

    click("dcemail-save");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual([{ Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }]);
  });

  it("показывает ошибку сохранения DcEmail", () => {
    mount({ office: "РЦ-8114", department: "Группа", error: "нет доступа к DcEmail" });
    expect(document.body.textContent).toContain("нет доступа к DcEmail");
  });
});
