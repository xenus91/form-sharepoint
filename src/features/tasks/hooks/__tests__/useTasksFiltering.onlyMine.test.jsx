// @vitest-environment jsdom
/* eslint-disable react/prop-types */
// src/features/tasks/hooks/__tests__/useTasksFiltering.onlyMine.test.js
//
// Тумблер «Я исполнитель»: остаются только задачи, которые я ВЕДУ — взял в
// работу и ещё не закрыл, либо закрыл сам. Назначение в «Кому назначено»
// (AssignedTo) в признак НЕ входит (требование 2026-10-10).
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useTasksFiltering } from "../useTasksFiltering";

const ME = { currentUserId: 42, currentUserTitle: "Поршаков Сергей" };

/** Задачи: одна моя «в работе», одна чужая «в работе», одна моя завершённая,
 *  одна «Не начата» на мне (назначена, но не взята). */
const TASKS = [
  { Id: 1, Status: "В процессе выполнения", PercentComplete: 50, EditorId: 42, EditorTitle: "Поршаков Сергей" },
  { Id: 2, Status: "В процессе выполнения", PercentComplete: 50, EditorId: 99, EditorTitle: "Иванов Иван" },
  { Id: 3, Status: "Завершена", PercentComplete: 100, EditorId: 42, EditorTitle: "Поршаков Сергей" },
  { Id: 4, Status: "Не начата", PercentComplete: 0, AssignedToId: 42, EditorId: 42 },
];

// Предикат повторяет TasksView.isMyTask (тот же lib/currentUserMatch).
async function makeIsMyTask() {
  const { isTaskTakenByCurrentUser } = await import("../../lib/currentUserMatch");
  const { isInProgressStatus, isCompletedStatus } = await import("../../../../tasks/status");
  return (row) => {
    if (!row) return false;
    const status = row.Status ?? "";
    if (!isInProgressStatus(status) && !isCompletedStatus(status, row.PercentComplete)) return false;
    return isTaskTakenByCurrentUser(row, ME);
  };
}

function Probe({ tasks, tab, opts, onData }) {
  const r = useTasksFiltering(tasks, tab, opts);
  React.useEffect(() => {
    onData(r);
  });
  return null;
}

describe("useTasksFiltering — тумблер «Я исполнитель»", () => {
  let root;
  let container;
  let seen;
  let isMyTask;

  beforeEach(async () => {
    isMyTask = await makeIsMyTask();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    seen = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(tasks, tab, opts) {
    act(() => {
      root.render(<Probe tasks={tasks} tab={tab} opts={opts} onData={(r) => seen.push(r)} />);
    });
  }

  const last = () => seen[seen.length - 1];

  it("тумблер выключен — видны все активные задачи", () => {
    mount(TASKS, 0, { onlyMine: false, isMyTask });
    expect(last().filteredTasks.map((t) => t.Id)).toEqual([1, 2, 4]);
  });

  it("тумблер включён — только задачи, которые я взял в работу", () => {
    mount(TASKS, 0, { onlyMine: true, isMyTask });
    expect(last().filteredTasks.map((t) => t.Id)).toEqual([1]);
  });

  it("«Не начата» на мне НЕ считается: назначение ≠ исполнение", () => {
    mount(TASKS, 0, { onlyMine: true, isMyTask });
    expect(last().filteredTasks.map((t) => t.Id)).not.toContain(4);
  });

  it("на вкладке «Завершённые» оставляет закрытые мной", () => {
    mount(TASKS, 1, { onlyMine: true, isMyTask });
    expect(last().filteredTasks.map((t) => t.Id)).toEqual([3]);
  });

  it("myCount — сколько всего задач я веду (подпись на тумблере)", () => {
    mount(TASKS, 0, { onlyMine: false, isMyTask });
    expect(last().myCount).toBe(2); // в работе + завершена
  });

  it("счётчики вкладок НЕ зависят от тумблера", () => {
    mount(TASKS, 0, { onlyMine: true, isMyTask });
    expect(last().activeCount).toBe(3);
    expect(last().completedCount).toBe(1);
  });

  it("группировка строится по отфильтрованному набору", () => {
    mount(TASKS, 0, { onlyMine: true, isMyTask });
    const groups = last().groupedTasks;
    expect(groups.length).toBe(1);
    expect(groups[0][1].map((t) => t.Id)).toEqual([1]);
  });

  it("без предиката тумблер ничего не режет (защита от undefined)", () => {
    mount(TASKS, 0, { onlyMine: true, isMyTask: null });
    expect(last().filteredTasks.map((t) => t.Id)).toEqual([1, 2, 4]);
  });
});
