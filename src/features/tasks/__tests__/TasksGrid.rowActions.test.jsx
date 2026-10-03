// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksGrid.rowActions.test.jsx
//
// Табличный режим #tasks: действия по задаче открываются В ТОЧКЕ КЛИКА по строке
// (popup у курсора) и содержат ВЕСЬ набор действий, переданный из TasksView
// (как в карточке: «Взять в работу», результаты, «Изменить»).
//
// Здесь проверяется именно механика popup'а на уровне грида: координаты клика,
// состав действий, вызов обработчиков, закрытие и legacy-фолбэк.

import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TasksGrid from "../components/TasksGrid";

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
  matches: false,
  media: q,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const ROWS = [
  {
    compositeId: "main:10",
    sourceId: "main",
    Id: 10,
    Title: "Основная задача ООБ",
    Body: "Проверить паллет",
    Status: "В работе",
    PercentComplete: 0,
    AssignedTo: "Поршаков Сергей",
    EditorTitle: "Поршаков Сергей",
    DueDate: "2026-10-05T10:00:00Z",
    Modified: "2026-10-03T09:00:00Z",
  },
  {
    compositeId: "dob:1",
    sourceId: "dob",
    Id: 1,
    Title: "Заявка ООБ",
    Body: "Просмотр видеоархива",
    Status: "Не начата",
    PercentComplete: 0,
    AssignedTo: "Поршаков Сергей",
    EditorTitle: "",
    DueDate: null,
    Modified: "2026-10-03T00:29:42Z",
  },
];

const settle = async (ms = 250) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

function renderGrid(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <TasksGrid rows={ROWS} {...props} />
      </ThemeProvider>
    );
  });
  return { host, root };
}

// MUI держит закрывающийся popup в DOM (jsdom не эмитит transitionend),
// поэтому берём последний и считаем закрытым по opacity: 0.
const popupEl = () => [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop() || null;
const openPopup = () => {
  const el = popupEl();
  return el && el.style.opacity !== "0" ? el : null;
};
const popupButtons = () => [...(openPopup()?.querySelectorAll("button") || [])];

const rowByText = (host, re) => [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .find((r) => re.test(r.textContent || ""));

const clickCell = async (row, x = 180, y = 240) => {
  const cell = row?.querySelector(".ag-cell");
  expect(cell).toBeTruthy();
  await act(async () => {
    cell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    await new Promise((r) => setTimeout(r, 120));
  });
};

describe("TasksGrid — действия в точке клика", () => {
  it("открывает popup в точке клика и показывает ВСЕ действия по задаче", async () => {
    const onTake = vi.fn();
    const onResult = vi.fn();
    const onEdit = vi.fn();
    const getRowActions = () => [
      { key: "take", label: "Взять в работу", icon: "take", onClick: onTake },
      { key: "result:Найдена", label: "Найдена", icon: "result", onClick: onResult },
      { key: "result:Не найдена", label: "Не найдена", icon: "result", onClick: onResult },
      { key: "edit", label: "Изменить", icon: "edit", variant: "contained", onClick: onEdit },
    ];
    const { host } = renderGrid({ getRowActions });
    await settle(400);

    expect(openPopup()).toBeNull();

    await clickCell(rowByText(host, /Основная задача ООБ/), 240, 360);
    const paper = openPopup();
    expect(paper).toBeTruthy();
    // popup позиционируется ровно в точке клика
    const style = paper.getAttribute("style") || "";
    expect(style).toContain("240px");
    expect(style).toContain("360px");
    // набор действий — полный, как в карточке
    expect(popupButtons().map((b) => b.textContent)).toEqual([
      "Взять в работу",
      "Найдена",
      "Не найдена",
      "Изменить",
    ]);

    // действие из popup'а вызывает свой обработчик и попап закрывается
    const resultBtn = popupButtons().find((b) => b.textContent === "Найдена");
    await act(async () => {
      resultBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onTake).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(openPopup()).toBeNull();
  });

  it("клик по другой строке переносит popup в новую точку клика", async () => {
    const { host } = renderGrid({
      getRowActions: (row) => [{ key: "edit", label: "Изменить", icon: "edit", onClick: () => { void row; } }],
    });
    await settle(400);

    await clickCell(rowByText(host, /Основная задача ООБ/), 120, 300);
    expect(openPopup().getAttribute("style")).toContain("120px");

    await clickCell(rowByText(host, /Заявка ООБ/), 500, 420);
    const style = openPopup().getAttribute("style") || "";
    expect(style).toContain("500px");
    expect(style).toContain("420px");
    // в popup'е — действия уже другой строки
    expect(openPopup().textContent).toContain("#1");
  });

  it("без getRowActions работает legacy-набор «Взять в работу» + «Изменить»", async () => {
    const onTakeRow = vi.fn();
    const onEditRow = vi.fn();
    const { host } = renderGrid({
      onTakeRow,
      onEditRow,
      canTakeRow: (row) => row.Status === "Не начата",
    });
    await settle(400);

    await clickCell(rowByText(host, /Заявка ООБ/), 200, 300);
    const labels = popupButtons().map((b) => b.textContent);
    expect(labels).toEqual(["Взять в работу", "Изменить"]);

    await act(async () => {
      popupButtons().find((b) => b.textContent === "Взять в работу")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onTakeRow).toHaveBeenCalledTimes(1);
    expect(onTakeRow.mock.calls[0][0].compositeId).toBe("dob:1");

    // у строки, которую нельзя взять, кнопки «Взять в работу» нет
    await clickCell(rowByText(host, /Основная задача ООБ/), 200, 300);
    expect(popupButtons().map((b) => b.textContent)).toEqual(["Изменить"]);
  });

  it("информационный пункт («В работе у X») рисуется плашкой без кнопки", async () => {
    const { host } = renderGrid({
      getRowActions: () => [
        { key: "taken-by-other", kind: "info", label: "В работе у Иванов Пётр", hint: "Задача уже взята другим пользователем." },
        { key: "edit", label: "Изменить", icon: "edit" },
      ],
    });
    await settle(400);
    await clickCell(rowByText(host, /Основная задача ООБ/), 200, 300);

    const paper = openPopup();
    expect(paper.textContent).toContain("В работе у Иванов Пётр");
    expect(paper.textContent).toContain("Задача уже взята другим пользователем.");
    // плашка — не кнопка: единственная кнопка в меню — «Изменить»
    expect(popupButtons().map((b) => b.textContent)).toEqual(["Изменить"]);
  });

  it("«Изменить» закреплена внизу меню и видна даже при большом списке результатов", async () => {
    const onEdit = vi.fn();
    const choices = Array.from({ length: 12 }, (_, i) => `Результат ${i + 1}`);
    const { host } = renderGrid({
      getRowActions: () => [
        ...choices.map((label) => ({ key: `result:${label}`, label, icon: "result", onClick: () => {} })),
        { key: "edit", label: "Изменить", icon: "edit", variant: "outlined", sticky: true, onClick: onEdit },
      ],
    });
    await settle(400);
    await clickCell(rowByText(host, /Основная задача ООБ/), 200, 300);

    const paper = openPopup();
    expect(paper).toBeTruthy();
    // кнопки результата — в прокручиваемом контейнере, «Изменить» — вне его, внизу
    const list = paper.querySelector('[data-testid="tasks-row-actions-list"]');
    expect(list).toBeTruthy();
    expect(list.textContent).not.toContain("Изменить");
    expect([...list.querySelectorAll("button")]).toHaveLength(choices.length);

    const buttons = popupButtons();
    expect(buttons.at(-1).textContent).toBe("Изменить");
    expect(paper.lastElementChild.contains(buttons.at(-1))).toBe(true);

    await act(async () => {
      buttons.at(-1).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("клик по кнопке «Изменить» у dob-строки работает, даже если взять её нельзя", async () => {
    const onEdit = vi.fn();
    const { host } = renderGrid({
      getRowActions: (row) => (row.sourceId === "dob"
        ? [{ key: "edit", label: "Изменить", icon: "edit", variant: "outlined", sticky: true, onClick: () => onEdit(row.compositeId) }]
        : [{ key: "take", label: "Взять в работу", icon: "take", onClick: () => {} }]),
    });
    await settle(400);
    await clickCell(rowByText(host, /Заявка ООБ/), 200, 300);

    expect(popupButtons().map((b) => b.textContent)).toEqual(["Изменить"]);
    await act(async () => {
      popupButtons()[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onEdit).toHaveBeenCalledWith("dob:1");
  });

  it("двойной клик по строке открывает форму (onRowOpen)", async () => {
    const onRowOpen = vi.fn();
    const { host } = renderGrid({ onRowOpen });
    await settle(400);

    const cell = rowByText(host, /Заявка ООБ/).querySelector(".ag-cell");
    await act(async () => {
      cell.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onRowOpen).toHaveBeenCalledWith("dob:1");
  });
});
