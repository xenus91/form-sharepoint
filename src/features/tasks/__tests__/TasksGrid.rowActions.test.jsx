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
// Кнопка «Кому назначено» (AssignedToButtons) лежит в шапке попапа, но это НЕ
// действие по задаче — в проверках набора действий её не учитываем.
const popupButtons = () => [...(openPopup()?.querySelectorAll("button") || [])]
  .filter((b) => b.getAttribute("data-testid") !== "assigned-to-button");

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

  it("колонка «Кому назначено» — кнопка с иконкой, а не просто текст", async () => {
    const { host } = renderGrid();
    await settle(250);
    const rows = [...host.querySelectorAll(".ag-center-cols-container .ag-row")];
    // колонка «Кому назначено» — в центральной части таблицы
    const cell = rows
      .flatMap((r) => [...r.querySelectorAll(".ag-cell")])
      .find((c) => (c.getAttribute("col-id") === "assignedTo"));
    expect(cell).toBeTruthy();
    const btn = cell?.querySelector('[data-testid="assigned-to-button"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("Поршаков Сергей");
  });

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

  it("без getRowActions работает тот же набор правил (dob: «Взять в работу»)", async () => {
    const onTakeRow = vi.fn();
    const onEditRow = vi.fn();
    const { host } = renderGrid({
      onTakeRow,
      onEditRow,
      canTakeRow: (row) => row.Status === "Не начата",
    });
    await settle(400);

    // dob-строка «Не начата»: единственное действие — «Взять в работу»
    // («Изменить» появится после взятия — правило 2026-10-04).
    await clickCell(rowByText(host, /Заявка ООБ/), 200, 300);
    const labels = popupButtons().map((b) => b.textContent);
    expect(labels).toEqual(["Взять в работу"]);

    await act(async () => {
      popupButtons().find((b) => b.textContent === "Взять в работу")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(onTakeRow).toHaveBeenCalledTimes(1);
    expect(onTakeRow.mock.calls[0][0].compositeId).toBe("dob:1");

    // у main-строки «в работе» кнопки «Взять в работу» нет, «Изменить» остаётся
    await clickCell(rowByText(host, /Основная задача ООБ/), 200, 300);
    expect(popupButtons().map((b) => b.textContent)).toEqual(["Изменить"]);
  });

  it("идёт обновление задачи: кружок-лоадер ВНУТРИ ячейки Id этой строки", async () => {
    const { host } = renderGrid({
      updatingId: 10,
      getRowActions: () => [{ key: "edit", label: "Изменить", icon: "edit" }],
    });
    await settle(400);

    // кружок ровно один — в ячейке Id именно обновляемой задачи
    const spinners = [...host.querySelectorAll('[data-testid="tasks-row-spinner"]')];
    expect(spinners).toHaveLength(1);
    const spinnerRow = spinners[0].closest(".ag-row");
    // колонка Id закреплена (pinned left) — AG Grid держит её в отдельном
    // контейнере, поэтому ориентируемся на row-id, а не на текст строки
    expect(spinnerRow.getAttribute("row-id")).toBe("main:10");
    expect(spinners[0].querySelector(".MuiCircularProgress-root")).toBeTruthy();
    // номер задачи остался на месте — строка не «прыгает»
    expect(spinners[0].textContent).toContain("10");

    // строка помечена классом (лёгкая подсветка), соседняя — нет
    expect(spinnerRow.className).toContain("tasks-row-busy");
    expect(spinnerRow.className).toContain("tasks-row-updating");
    const idleRow = [...host.querySelectorAll(".ag-row")].find((r) => r.getAttribute("row-id") === "dob:1");
    expect(idleRow.querySelector('[data-testid="tasks-row-spinner"]')).toBeNull();
    expect(idleRow.className || "").not.toContain("tasks-row-busy");
  });

  it("взятие в работу внешней задачи: кружок в ячейке Id этой же строки", async () => {
    const { host } = renderGrid({
      takingId: "dob:1",
      getRowActions: () => [{ key: "edit", label: "Изменить", icon: "edit" }],
    });
    await settle(400);

    const spinner = host.querySelector('[data-testid="tasks-row-spinner"]');
    expect(spinner).toBeTruthy();
    expect(spinner.textContent).toContain("1");
    const spinnerRow = spinner.closest(".ag-row");
    expect(spinnerRow.getAttribute("row-id")).toBe("dob:1");
    expect(spinnerRow.className).toContain("tasks-row-busy");
    expect(spinnerRow.className).toContain("tasks-row-taking");
  });

  it("кружок исчезает, когда запись завершена", async () => {
    const { host, root } = renderGrid({ updatingId: 10, getRowActions: () => [] });
    await settle(400);
    expect(host.querySelector('[data-testid="tasks-row-spinner"]')).toBeTruthy();

    act(() => {
      root.render(
        <ThemeProvider theme={createTheme()}>
          <TasksGrid rows={ROWS} updatingId={null} getRowActions={() => []} />
        </ThemeProvider>
      );
    });
    await settle(200);
    expect(host.querySelectorAll('[data-testid="tasks-row-spinner"]')).toHaveLength(0);
    // и подсветка строки снята
    const row = [...host.querySelectorAll(".ag-row")].find((r) => r.getAttribute("row-id") === "main:10");
    expect(row.className || "").not.toContain("tasks-row-busy");
  });

  it("открытие/закрытие поповера не пересобирает таблицу (быстрый отклик)", async () => {
    const { host } = renderGrid({
      getRowActions: () => [{ key: "edit", label: "Изменить", icon: "edit" }],
    });
    await settle(400);
    const gridNode = host.querySelector(".ag-root-wrapper");
    expect(gridNode).toBeTruthy();

    // Запоминаем DOM-узел ЯЧЕЙКИ: если бы таблица перерисовывалась при открытии
    // поповера, AG Grid пересоздал бы строки/ячейки.
    const cellNode = host.querySelector(".ag-center-cols-container .ag-row .ag-cell");
    await clickCell(rowByText(host, /Заявка ООБ/), 200, 300);
    expect(openPopup()).toBeTruthy();
    expect(host.querySelector(".ag-root-wrapper")).toBe(gridNode);
    expect(host.querySelector(".ag-center-cols-container .ag-row .ag-cell")).toBe(cellNode);

    // закрытие тоже не должно трогать таблицу
    await act(async () => {
      document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
      document.body.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 160));
    });
    expect(host.querySelector(".ag-center-cols-container .ag-row .ag-cell")).toBe(cellNode);
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

  it("результат с полями показывает инлайн-форму В ПОПОВЕРЕ (как карточка), без завершения сразу", async () => {
    const onResult = vi.fn();
    const onSubmit = vi.fn();
    const { host } = renderGrid({
      getRowActions: (row) => [{
        key: "result:Найдена",
        label: "Найдена",
        icon: "result",
        variant: "contained",
        sx: { background: "linear-gradient(180deg,#2e7d32,#1b5e20)", color: "#fff" },
        onClick: () => onResult("Найдена"),
        editor: {
          result: "Найдена",
          fields: [{ internalName: "Location1", title: "Местоположение", type: "multiline", required: false }],
          showAdditionalActions: false,
          icMode: false,
          noLabel: "Отмена",
          onSubmit,
        },
      }],
    });
    await settle(400);
    await clickCell(rowByText(host, /Заявка ООБ/), 210, 320);

    // в списке действий — кнопка результата
    expect(popupButtons().map((b) => b.textContent)).toEqual(["Найдена"]);
    await act(async () => {
      popupButtons()[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });

    // попап НЕ закрылся и завершения не было: открылась форма
    expect(onResult).not.toHaveBeenCalled();
    const editor = document.body.querySelector('[data-testid="tasks-row-result-editor"]');
    expect(editor).toBeTruthy();
    const area = editor.querySelector("textarea");
    expect(area).toBeTruthy();
    expect(editor.textContent).toContain("Сохранить — Найдена");
    expect(editor.textContent).toContain("Отмена");

    // заполняем и сохраняем — onSubmit получает значения формы
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(area, "Зона отгрузки");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
    });
    const save = [...editor.querySelectorAll("button")].find((b) => /Сохранить/.test(b.textContent || ""));
    await act(async () => {
      save.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ Location1: "Зона отгрузки" });
    // форма закрылась вместе с попапом, «слепого» onResult нет
    expect(document.body.querySelector('[data-testid="tasks-row-result-editor"]')).toBeFalsy();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("«Отмена» в инлайн-форме возвращает список действий строки", async () => {
    const onResult = vi.fn();
    const { host } = renderGrid({
      getRowActions: () => [{
        key: "result:Найдена",
        label: "Найдена",
        icon: "result",
        onClick: () => onResult("Найдена"),
        editor: {
          result: "Найдена",
          fields: [{ internalName: "Location1", title: "Местоположение", type: "text", required: false }],
          icMode: false,
          noLabel: "Отмена",
          onSubmit: vi.fn(),
        },
      }],
    });
    await settle(400);
    await clickCell(rowByText(host, /Заявка ООБ/), 200, 300);
    await act(async () => {
      popupButtons()[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    const editor = document.body.querySelector('[data-testid="tasks-row-result-editor"]');
    const cancel = [...editor.querySelectorAll("button")].find((b) => b.textContent.trim() === "Отмена");
    await act(async () => {
      cancel.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    // форма закрылась, снова виден список действий, ничего не отправлено
    expect(document.body.querySelector('[data-testid="tasks-row-result-editor"]')).toBeFalsy();
    expect(popupButtons().map((b) => b.textContent)).toEqual(["Найдена"]);
    expect(onResult).not.toHaveBeenCalled();
  });

  // Тест — последний в файле: MUI-порталы (карточка исполнителя, поповер строки)
  // в jsdom не закрываются сами (нет transitionend) и иначе протекали бы в
  // следующие тесты.
  it("клик по «Кому назначено» смотрит исполнителя, а НЕ открывает поповер строки", async () => {
    const { host } = renderGrid();
    await settle(250);
    // Поповеры предыдущих тестов остаются в DOM (в jsdom нет transitionend),
    // поэтому сравниваем КОЛИЧЕСТВО: клик по кнопке не должен его увеличить.
    const popoverCount = () => document.body.querySelectorAll('[data-testid="tasks-row-actions"]').length;
    const before = popoverCount();

    const cell = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
      .flatMap((r) => [...r.querySelectorAll(".ag-cell")])
      .find((c) => c.getAttribute("col-id") === "assignedTo");
    const btn = cell?.querySelector('[data-testid="assigned-to-button"]');
    expect(btn).toBeTruthy();

    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    // поповера действий нет — клик ушёл кнопке, а не строке
    expect(popoverCount()).toBe(before);
    // зато открылась карточка исполнителя
    expect(document.body.querySelector('[data-testid="principal-info-dialog"]')).toBeTruthy();

    // контроль: обычный клик по строке поповер открывает (проверка осмысленна)
    const row = rowByText(host, /Основная задача ООБ/);
    await clickCell(row, 180, 300);
    expect(popoverCount()).toBeGreaterThan(before);
  });
});
