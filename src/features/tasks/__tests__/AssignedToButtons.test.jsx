// @vitest-environment jsdom
// src/features/tasks/__tests__/AssignedToButtons.test.jsx
//
// «Кому назначено» (AssignedTo) во всех интерфейсах — кнопка с иконкой
// человека/группы; клик открывает карточку принципала.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

// Уточнение принципала — «сервер»: 5 → пользователь, 33 → группа.
// Само определение типа (PrincipalType) проверяется в lib/__tests__/assignees.test.js.
const state = {
  principals: {
    5: { id: 5, kind: "user", title: "Иванов Иван", loginName: "i:0#.f|membership|ivanov@lenta.com", email: "ivanov@lenta.com" },
    33: { id: 33, kind: "group", title: "ООБ", loginName: "ООБ", email: null },
  },
};

vi.mock("../lib/assignees", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // parseAssignees — настоящий
    resolveAssigneeCached: vi.fn(async (_task, person) => ({
      id: person?.id ?? null,
      kind: state.principals[Number(person?.id)]?.kind || "unknown",
      title: state.principals[Number(person?.id)]?.title || person?.title || "",
      loginName: state.principals[Number(person?.id)]?.loginName || null,
      email: state.principals[Number(person?.id)]?.email || null,
    })),
  };
});

const { default: AssignedToButtons } = await import("../components/AssignedToButtons");
const { parseAssignees } = await import("../lib/assignees");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

async function render(task) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <AssignedToButtons task={task} />
      </ThemeProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  return { host };
}

describe("AssignedToButtons — «Кому назначено» кнопкой", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("пользователь: кнопка с иконкой человека, клик открывает карточку с почтой", async () => {
    const { host } = await render({ AssignedTo: "Иванов Иван", AssignedToId: 5 });
    const btn = host.querySelector('[data-testid="assigned-to-button"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("Иванов Иван");
    // тип уточнён по Id → «пользователь»
    expect(btn.getAttribute("data-principal-kind")).toBe("user");

    await act(async () => { click(btn); await new Promise((r) => setTimeout(r, 60)); });
    const dialog = document.body.querySelector('[data-testid="principal-info-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Пользователь");
    expect(dialog.textContent).toContain("ivanov@lenta.com");
    expect(dialog.textContent).toContain("Иванов Иван");
  });

  it("группа: иконка/тип «Группа»", async () => {
    const { host } = await render({ AssignedTo: "ООБ", AssignedToId: 33 });
    const btn = host.querySelector('[data-testid="assigned-to-button"]');
    expect(btn.getAttribute("data-principal-kind")).toBe("group");

    await act(async () => { click(btn); await new Promise((r) => setTimeout(r, 60)); });
    const dialog = document.body.querySelector('[data-testid="principal-info-dialog"]');
    expect(dialog.textContent).toContain("Группа");
    expect(dialog.textContent).toContain("ООБ");
  });

  it("без исполнителя — прочерк, кнопки нет", async () => {
    const { host } = await render({ AssignedTo: "", AssignedToId: null });
    expect(host.querySelector('[data-testid="assigned-to-button"]')).toBeNull();
    expect(host.querySelector('[data-testid="assigned-to-empty"]')).toBeTruthy();
  });

  it("имени в задаче нет (пришёл только Id) — показываем ФИО из SharePoint, а не «Id 5»", async () => {
    // Регрессия 2026-10-10: карточка #tasks/<id> рисовала «Исполнитель: Id 10»,
    // когда задача приходила без Title принципала (CAML-кандидат без $expand,
    // 401/403 на fetchFullTask, внешние источники).
    const { host } = await render({ AssignedTo: "", AssignedToId: 5 });
    const btn = host.querySelector('[data-testid="assigned-to-button"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("Иванов Иван");
    expect(btn.textContent).not.toContain("Id 5");
    expect(btn.getAttribute("data-principal-kind")).toBe("user");
  });

  it("группа без имени — тоже показываем названием, а не Id", async () => {
    const { host } = await render({ AssignedToId: { results: [33] } });
    const btn = host.querySelector('[data-testid="assigned-to-button"]');
    expect(btn.textContent).toContain("ООБ");
    expect(btn.getAttribute("data-principal-kind")).toBe("group");
  });

  it("несколько исполнителей — кнопка на каждого", async () => {
    const { host } = await render({ AssignedTo: { results: [{ Id: 5, Title: "Иванов Иван" }, { Id: 33, Title: "ООБ" }] }, AssignedToId: { results: [5, 33] } });
    const buttons = [...host.querySelectorAll('[data-testid="assigned-to-button"]')];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.getAttribute("data-principal-kind"))).toEqual(["user", "group"]);
  });
});

describe("parseAssignees — разбор AssignedTo", () => {
  it("один исполнитель: строка + Id", () => {
    expect(parseAssignees({ AssignedTo: "Иванов Иван", AssignedToId: 5 })).toEqual([{ title: "Иванов Иван", id: 5 }]);
  });

  it("SharePoint склеивает многозначных как «A;#B»", () => {
    expect(parseAssignees({ AssignedTo: "Иванов Иван;#ООБ", AssignedToId: [5, 33] }))
      .toEqual([{ title: "Иванов Иван", id: 5 }, { title: "ООБ", id: 33 }]);
  });

  it("только Id (Title не приехал)", () => {
    expect(parseAssignees({ AssignedToId: 5 })).toEqual([{ title: "", id: 5 }]);
  });

  it("нет данных — пусто", () => {
    expect(parseAssignees(null)).toEqual([]);
    expect(parseAssignees({})).toEqual([]);
  });
});
