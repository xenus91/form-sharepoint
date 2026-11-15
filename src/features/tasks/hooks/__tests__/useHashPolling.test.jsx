// @vitest-environment jsdom
// Регрессия: hash polling получает только поля статуса, но не должен затирать
// полную карточку ни в состоянии hash-роута, ни в кэше списка.
/* eslint-disable react/prop-types */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const state = vi.hoisted(() => ({
  get: vi.fn(),
  poll: null,
}));

vi.mock("../../../../api", () => ({
  default: { get: (...args) => state.get(...args) },
}));

vi.mock("../../../../utils/polling", () => ({
  createAdaptivePolling: ({ fn }) => {
    state.poll = fn;
    return () => { state.poll = null; };
  },
}));

vi.mock("../../../../tasks/config", () => ({
  TASKS_LIST_API: "/web/lists(guid'tasks')",
  HASH_POLL_SELECT: "Id,Status,PercentComplete,Modified,ResultSearchTHU,Location1",
  HASH_POLL_EXPAND: "",
}));

const { useHashPolling } = await import("../useHashPolling");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const INITIAL_TASK = {
  Id: 26334,
  Title: "Проверить ЕО 808117004013738272",
  Body: "Проверить товар и описание задачи",
  AssignedTo: "Рассылка РЦ",
  AssignedToId: 13,
  EditorTitle: "Поршаков Сергей",
  ContentTypeId: "0x0108DOB",
  isDobTask: true,
  Status: "Не начата",
  PercentComplete: 0,
  Modified: "2026-10-09T10:00:00Z",
  ResultSearchTHU: "",
  ResultValue: "",
  Location1: "",
  raw: {
    Id: 26334,
    Title: "Проверить ЕО 808117004013738272",
    Body: "Проверить товар и описание задачи",
    AssignedTo: { Id: 13, Title: "Рассылка РЦ" },
    ContentTypeId: { StringValue: "0x0108DOB" },
  },
};

function Probe({ queryClient }) {
  const [task, setTask] = useState(INITIAL_TASK);
  useHashPolling({
    isHashMode: true,
    elementTaskMatch: task,
    setElementTaskMatch: setTask,
    setIsHashTaskRefreshing: () => {},
    recipientField: null,
    scNumberField: null,
    currentUserId: 42,
    distribution: { Id: 7 },
    taskFieldNames: [],
    resultFieldInternalNames: [],
    queryClient,
    lastHashFocusRef: { current: Date.now() },
  });
  return <output data-testid="task">{JSON.stringify(task)}</output>;
}

describe("useHashPolling", () => {
  let host;
  let root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    state.get.mockReset();
    state.poll = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("обновляет статус, не стирая текст и поля полной карточки в state и query cache", async () => {
    state.get.mockResolvedValue({
      data: {
        d: {
          Id: 26334,
          Status: "В процессе выполнения",
          PercentComplete: 0,
          Modified: "2026-10-10T10:00:00Z",
          ResultSearchTHU: "Найдена",
          Location1: "Склад 1",
        },
      },
    });
    let cachedTasks = [{ ...INITIAL_TASK, raw: { ...INITIAL_TASK.raw } }];
    const queryClient = {
      setQueryData: vi.fn((_key, update) => {
        cachedTasks = typeof update === "function" ? update(cachedTasks) : update;
      }),
    };

    act(() => root.render(<Probe queryClient={queryClient} />));
    expect(state.poll).toBeTypeOf("function");

    await act(async () => { await state.poll(); });

    const task = JSON.parse(host.querySelector('[data-testid="task"]').textContent);
    expect(task).toMatchObject({
      Id: 26334,
      Title: INITIAL_TASK.Title,
      Body: INITIAL_TASK.Body,
      AssignedTo: INITIAL_TASK.AssignedTo,
      AssignedToId: INITIAL_TASK.AssignedToId,
      ContentTypeId: INITIAL_TASK.ContentTypeId,
      isDobTask: true,
      Status: "В процессе выполнения",
      ResultSearchTHU: "Найдена",
      ResultValue: "Найдена",
      Location1: "Склад 1",
    });
    expect(task.raw.Title).toBe(INITIAL_TASK.Title);
    expect(task.raw.Body).toBe(INITIAL_TASK.Body);
    expect(task.raw.Status).toBe("В процессе выполнения");

    expect(cachedTasks).toHaveLength(1);
    expect(cachedTasks[0]).toMatchObject({
      Title: INITIAL_TASK.Title,
      Body: INITIAL_TASK.Body,
      AssignedTo: INITIAL_TASK.AssignedTo,
      ContentTypeId: INITIAL_TASK.ContentTypeId,
      Status: "В процессе выполнения",
      ResultSearchTHU: "Найдена",
    });
    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1);
  });
});
