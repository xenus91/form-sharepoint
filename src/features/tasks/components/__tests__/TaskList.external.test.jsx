// @vitest-environment jsdom
// src/features/tasks/components/__tests__/TaskList.external.test.jsx
// Регрессия: задача из внешнего источника (dob) должна отрисовываться карточкой
// в списке #tasks, а не теряться (раньше карточки строились только из main).

import React from "react";
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TaskList from "../TaskList";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIN_TASK = {
  Id: 10,
  Title: "Основная задача",
  Body: "",
  Status: "Не начата",
  PercentComplete: 0,
  DueDate: null,
  AssignedTo: "Поршаков Сергей",
  Modified: "2026-10-03T10:00:00Z",
  raw: {},
  sourceId: "main",
  compositeId: "main:10",
};

const DOB_TASK = {
  Id: 1,
  Title: "Заявка ООБ",
  Body: "Просмотр видеоархива",
  Status: "Не начата",
  PercentComplete: 0,
  DueDate: null,
  AssignedTo: "Поршаков Сергей",
  Modified: "2026-10-03T00:29:42Z",
  raw: {},
  sourceId: "dob",
  sourceLabel: "DOB Logistic",
  compositeId: "dob:1",
};

function render(node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ThemeProvider theme={createTheme()}>{node}</ThemeProvider>);
  });
  return host;
}

describe("TaskList — карточки из нескольких источников", () => {
  it("рисует карточку внешнего источника как обычную задачу (без пометок об источнике)", () => {
    const tasks = [MAIN_TASK, DOB_TASK];
    const host = render(
      <TaskList
        tasks={tasks}
        tab={0}
        groupedTasks={[["Все", tasks]]}
        filteredTasks={tasks}
        groupingEnabled={false}
      />
    );
    const external = host.querySelectorAll('[data-testid="external-task-card"]');
    expect(external).toHaveLength(1);
    expect(external[0].getAttribute("data-composite-id")).toBe("dob:1");
    expect(external[0].textContent).toContain("Заявка ООБ");
    expect(external[0].textContent).toContain("Просмотр видеоархива");
    // «Кому назначено» — AssignedTo; «Исполнитель» пуст, пока задачу не взяли
    expect(external[0].textContent).toMatch(/Кому назначено: Поршаков Сергей/);
    expect(external[0].textContent).toMatch(/Исполнитель: —/);
    expect(external[0].textContent).toMatch(/Статус: Не начата/);
    expect(external[0].textContent).toContain("#1");
    // задачу ещё не взяли → есть кнопка «Взять в работу»
    expect([...external[0].querySelectorAll("button")].some((b) => /Взять в работу/.test(b.textContent || ""))).toBe(true);
    // никаких подписей про «другой сайт»/бейджа источника
    expect(external[0].textContent).not.toContain("DOB Logistic");
    expect(external[0].textContent).not.toMatch(/другого (сайта|источника)/i);
    // main-задача отрисована обычной карточкой без read-only пометки
    expect(external[0].textContent).not.toContain("Основная задача");
  });

  it("«Взять в работу» вызывает onTake; во взятой задаче — «В работе у …» без кнопки", () => {
    const tasks = [DOB_TASK];
    let taken = null;
    const host = render(
      <TaskList
        tasks={tasks}
        tab={0}
        groupedTasks={[["Все", tasks]]}
        filteredTasks={tasks}
        groupingEnabled={false}
        onTakeExternalTask={(t) => { taken = t; }}
      />
    );
    const btn = [...host.querySelectorAll("button")].find((b) => /Взять в работу/.test(b.textContent || ""));
    expect(btn).toBeTruthy();
    act(() => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    expect(taken).toBeTruthy();
    expect(taken.compositeId).toBe("dob:1");

    // задача уже в работе у другого пользователя
    const inWork = { ...DOB_TASK, Status: "В работе", EditorTitle: "Поршаков Сергей", EditorId: 207 };
    const host2 = render(
      <TaskList
        tasks={[inWork]}
        tab={0}
        groupedTasks={[["Все", [inWork]]]}
        filteredTasks={[inWork]}
        groupingEnabled={false}
        onTakeExternalTask={() => {}}
      />
    );
    const card2 = host2.querySelector('[data-testid="external-task-card"]');
    expect(card2.textContent).toContain("В работе у Поршаков Сергей");
    expect(card2.textContent).toMatch(/Исполнитель: Поршаков Сергей/);
    expect([...card2.querySelectorAll("button")].some((b) => /Взять в работу/.test(b.textContent || ""))).toBe(false);
  });

  it("«В работе у вас» для своей задачи в работе", () => {
    const mine = { ...DOB_TASK, Status: "В работе", EditorTitle: "Я", EditorId: 207 };
    const host = render(
      <TaskList
        tasks={[mine]}
        tab={0}
        groupedTasks={[["Все", [mine]]]}
        filteredTasks={[mine]}
        groupingEnabled={false}
        externalCurrentUserIds={{ dob: 207 }}
      />
    );
    const card = host.querySelector('[data-testid="external-task-card"]');
    expect(card.textContent).toContain("В работе у вас");
  });

  it("«Изменить» появляется ТОЛЬКО после взятия в работу (не начата → кнопки нет)", () => {
    const tasks = [DOB_TASK]; // «Не начата», исполнителя нет
    const host = render(
      <TaskList
        tasks={tasks}
        tab={0}
        groupedTasks={[["Все", tasks]]}
        filteredTasks={tasks}
        groupingEnabled={false}
        onOpenExternalTask={() => {}}
      />
    );
    const card = host.querySelector('[data-testid="external-task-card"]');
    expect([...card.querySelectorAll("button")].some((b) => /Изменить/.test(b.textContent || ""))).toBe(false);
    expect([...card.querySelectorAll("button")].some((b) => /Взять в работу/.test(b.textContent || ""))).toBe(true);
  });

  it("кнопка «Изменить» вызывает onOpen с задачей (переход в форму источника)", () => {
    // задача взята мной в работу — форма доступна
    const tasks = [{ ...DOB_TASK, Status: "В работе", EditorTitle: "Поршаков Сергей", EditorId: 207 }];
    let opened = null;
    const host = render(
      <TaskList
        tasks={tasks}
        tab={0}
        groupedTasks={[["Все", tasks]]}
        filteredTasks={tasks}
        groupingEnabled={false}
        externalCurrentUserIds={{ dob: 207 }}
        onOpenExternalTask={(t) => { opened = t; }}
      />
    );
    const btn = [...host.querySelectorAll("button")].find((b) => /Изменить/.test(b.textContent || ""));
    expect(btn).toBeTruthy();
    act(() => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    expect(opened).toBeTruthy();
    expect(opened.compositeId).toBe("dob:1");
  });

  it("у завершённой задачи кнопок нет вообще", () => {
    const tasks = [{ ...DOB_TASK, Status: "Завершена", PercentComplete: 1 }];
    const host = render(
      <TaskList
        tasks={tasks}
        tab={0}
        groupedTasks={[["Все", tasks]]}
        filteredTasks={tasks}
        groupingEnabled={false}
        onOpenExternalTask={() => {}}
        onTakeExternalTask={() => {}}
      />
    );
    const card = host.querySelector('[data-testid="external-task-card"]');
    expect(card.querySelectorAll("button")).toHaveLength(0);
  });

  it("без внешних задач карточек внешнего источника нет", () => {
    const tasks = [MAIN_TASK];
    const host = render(
      <TaskList
        tasks={tasks}
        tab={0}
        groupedTasks={[["Все", tasks]]}
        filteredTasks={tasks}
        groupingEnabled={false}
      />
    );
    expect(host.querySelectorAll('[data-testid="external-task-card"]')).toHaveLength(0);
  });
});
