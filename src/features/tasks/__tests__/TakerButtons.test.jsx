// @vitest-environment jsdom
// src/features/tasks/__tests__/TakerButtons.test.jsx
//
// Требование 2026-10-10: «Исполнитель» — ТАКАЯ ЖЕ кнопка, что и «Кому назначено»:
// иконка человек/группа, ФИО, клик открывает карточку принципала. Работает и в
// карточке задачи, и в ячейке таблицы (клик по кнопке не открывает поповер
// действий строки — это запрос информации о человеке, а не действие).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

// «Сервер» принципалов: 207 → пользователь, 33 → группа.
const principals = {
  207: { kind: "user", title: "Поршаков Сергей", loginName: "i:0#.f|membership|porshakov@lenta.com", email: "porshakov@lenta.com" },
  33: { kind: "group", title: "ООБ", loginName: "ООБ", email: null },
};

vi.mock("../lib/assignees", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // parseEditors/parseAssignees — настоящие
    resolveAssigneeCached: vi.fn(async (_task, person) => {
      const p = principals[Number(person?.id)];
      return {
        id: person?.id ?? null,
        kind: p?.kind || "unknown",
        title: p?.title || person?.title || "",
        loginName: p?.loginName || null,
        email: p?.email || null,
      };
    }),
  };
});

const { TakerButtons } = await import("../components/AssignedToButtons");
const { default: TasksGrid } = await import("../components/TasksGrid");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const day = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

async function render(ui) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  return { host, root };
}

const IN_WORK = {
  compositeId: "main:2", sourceId: "main", Id: 2, Title: "В работе",
  Status: "В процессе выполнения", PercentComplete: 0,
  AssignedTo: "ООБ", AssignedToId: "33",
  EditorId: 207, EditorTitle: "Поршаков Сергей", DueDate: day(3),
};

describe("TakerButtons — «Исполнитель» кнопкой", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("в работе — кнопка с ФИО исполнителя; клик открывает карточку человека", async () => {
    const { host } = await render(<TakerButtons task={IN_WORK} />);
    const btn = host.querySelector('[data-testid="taker-button"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe("Поршаков Сергей");
    expect(btn.getAttribute("data-principal-button")).toBe("true");
    expect(btn.getAttribute("data-principal-id")).toBe("207");
    // тот же признак, по которому TasksGrid отличает кнопку от клика по строке
    expect(btn.closest("[data-principal-button]")).toBe(btn);

    await act(async () => {
      click(btn);
      await new Promise((r) => setTimeout(r, 30));
    });
    const dialog = document.body.textContent || "";
    expect(dialog).toContain("Поршаков Сергей");
    expect(dialog).toContain("porshakov@lenta.com");
  });

  it("завершённая задача — исполнитель тоже кнопкой (кто закрыл)", async () => {
    const { host } = await render(
      <TakerButtons task={{ ...IN_WORK, Status: "Завершена", PercentComplete: 1 }} />,
    );
    expect(host.querySelector('[data-testid="taker-button"]')?.textContent).toBe("Поршаков Сергей");
  });

  it("задачу не взяли — кнопки нет, прочерк (Editor у SharePoint = автор)", async () => {
    const { host } = await render(
      <TakerButtons task={{ ...IN_WORK, Status: "Не начата", PercentComplete: 0 }} />,
    );
    expect(host.querySelector('[data-testid="taker-button"]')).toBeNull();
    expect(host.querySelector('[data-testid="taker-empty"]')?.textContent).toBe("—");
  });
});

describe("TasksGrid — колонка «Исполнитель» кнопкой", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("в ячейке — кнопка принципала, а клик по ней не открывает поповер действий", async () => {
    const { host } = await render(<TasksGrid rows={[IN_WORK]} />);
    const btn = host.querySelector('[data-testid="taker-button"]');
    expect(btn).toBeTruthy();
    expect(btn.tagName.toLowerCase()).toBe("button");
    expect(btn.textContent).toBe("Поршаков Сергей");

    // клик по кнопке исполнителя — поповер действий НЕ открывается
    await act(async () => {
      click(btn);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(document.querySelector('[data-testid="tasks-row-actions"]')).toBeNull();

    // контроль: клик по той же строке МИМО кнопки — поповер открывается
    const cell = host.querySelector(".ag-center-cols-container .ag-row .ag-cell");
    await act(async () => {
      click(cell);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(document.querySelector('[data-testid="tasks-row-actions"]')).toBeTruthy();
  });
});
