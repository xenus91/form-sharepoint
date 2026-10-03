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
  it("рисует карточку внешнего источника рядом с main-задачей", () => {
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
    expect(external[0].textContent).toContain("DOB Logistic");
    // main-задача отрисована обычной карточкой без read-only пометки
    expect(external[0].textContent).not.toContain("Основная задача");
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
