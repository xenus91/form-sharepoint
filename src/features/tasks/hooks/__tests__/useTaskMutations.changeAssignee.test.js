// @vitest-environment jsdom
// Смена AssignedTo должна отдельно сохранять principal, обновлять карточку и перечитывать список.

import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const apiState = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), invalidate: vi.fn() }));
vi.mock("../../../../api", () => ({
  default: {
    get: (...args) => apiState.get(...args),
    post: (...args) => apiState.post(...args),
    defaults: { headers: {} },
  },
  invalidate: (...args) => apiState.invalidate(...args),
}));

const { useTaskMutations } = await import("../useTaskMutations");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TASK = { Id: 42, Title: "Проверить остаток", Status: "Не начата", AssignedTo: "Старая рассылка", AssignedToId: 11 };
const MAILING = { Id: 33, Title: "Рассылка РЦ Отгрузка", LoginName: "mailing-rc", PrincipalType: 2 };

async function runChange() {
  const notify = vi.fn();
  const loadTasks = vi.fn(async () => {});
  const queryClient = {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  };
  const setElementTaskMatch = vi.fn();
  apiState.get.mockReset();
  apiState.post.mockReset();
  apiState.invalidate.mockReset();
  apiState.get.mockImplementation(async (url) => {
    if (url.includes("/items(42)?")) {
      return { data: { d: {
        Id: 42,
        AssignedTo: { Id: 11, Title: "Старая рассылка" },
        __metadata: { type: "SP.Data.TasksListItem", etag: '"23"' },
      } }, headers: {} };
    }
    if (url.includes("/fields?")) {
      return { data: { d: { results: [{ InternalName: "AssignedTo", TypeAsString: "UserMulti", AllowMultipleValues: true }] } } };
    }
    throw new Error(`Unexpected GET: ${url}`);
  });
  apiState.post.mockResolvedValue({ data: { d: {} } });

  const captured = {};
  function Host() {
    captured.mutations = useTaskMutations({
      entityType: "SP.Data.TasksListItem",
      completedStatusValue: "Завершена",
      inProgressStatusValue: "В процессе выполнения",
      resultFieldsMeta: new Map(),
      ctResultMap: new Map(),
      taskConfiguration: null,
      fieldDefaultActions: [],
      currentUserId: 5,
      currentUserTitle: "Иванов Иван",
      distribution: { Id: 55 },
      taskFieldNames: ["Title", "AssignedTo"],
      recipientField: "Recipient",
      scNumberField: "SCNumber",
      resultFieldInternalNames: ["ResultSearchTHU"],
      queryClient,
      loadTasks,
      notify,
      setElementTaskMatch,
      pendingResult: null,
    });
    return React.createElement("div", null, String(captured.mutations.updatingId ?? "idle"));
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Host)); });
  let saved = false;
  await act(async () => { saved = await captured.mutations.changeTaskAssignee(TASK, MAILING); });
  await act(async () => { root.unmount(); });
  container.remove();
  return { saved, notify, loadTasks, queryClient, setElementTaskMatch };
}

describe("useTaskMutations.changeTaskAssignee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("пишет только AssignedToId и обновляет активный кэш/hash-карточку", async () => {
    const { saved, notify, loadTasks, queryClient, setElementTaskMatch } = await runChange();
    expect(saved).toBe(true);
    expect(apiState.post).toHaveBeenCalledTimes(1);
    const payload = apiState.post.mock.calls[0][1];
    expect(payload).toEqual({
      __metadata: { type: "SP.Data.TasksListItem" },
      AssignedToId: { __metadata: { type: "Collection(Edm.Int32)" }, results: [33] },
    });
    expect(apiState.post.mock.calls[0][2].headers["IF-MATCH"]).toBe('"23"');

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1);
    const [queryKey, update] = queryClient.setQueryData.mock.calls[0];
    expect(queryKey).toEqual(["tasks", 5, 55, "Title,AssignedTo", "Recipient", "SCNumber", "ResultSearchTHU"]);
    expect(update([TASK])[0]).toMatchObject({ AssignedTo: MAILING.Title, AssignedToId: MAILING.Id });

    const elementUpdate = setElementTaskMatch.mock.calls[0][0];
    expect(elementUpdate(TASK)).toMatchObject({ AssignedTo: MAILING.Title, AssignedToId: MAILING.Id });
    expect(loadTasks).toHaveBeenCalledWith({ silent: true });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining(MAILING.Title), { severity: "success" });
  });

  it("обрабатывает ETag-конфликт предупреждением и перечитывает задачу", async () => {
    apiState.get.mockImplementation(async (url) => {
      if (url.includes("/items(42)?")) return { data: { d: { Id: 42, __metadata: { type: "SP.Data.TasksListItem", etag: '"1"' } } }, headers: {} };
      if (url.includes("/fields?")) return { data: { d: { results: [{ TypeAsString: "User" }] } } };
      throw new Error(`Unexpected GET: ${url}`);
    });
    apiState.post.mockRejectedValue(Object.assign(new Error("Precondition Failed"), { response: { status: 412 } }));
    const { saved, notify, loadTasks } = await runChangeWithExistingMocks();
    expect(saved).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("изменена другим пользователем"), { severity: "warning" });
    expect(loadTasks).toHaveBeenCalledWith({ silent: true });
  });
});

async function runChangeWithExistingMocks() {
  const notify = vi.fn();
  const loadTasks = vi.fn(async () => {});
  const queryClient = { setQueryData: vi.fn(), invalidateQueries: vi.fn() };
  const setElementTaskMatch = vi.fn();
  const captured = {};
  function Host() {
    captured.mutations = useTaskMutations({
      entityType: "SP.Data.TasksListItem",
      completedStatusValue: "Завершена",
      inProgressStatusValue: "В процессе выполнения",
      resultFieldsMeta: new Map(), ctResultMap: new Map(), taskConfiguration: null, fieldDefaultActions: [],
      currentUserId: 5, currentUserTitle: "Иванов Иван", distribution: null,
      taskFieldNames: [], recipientField: null, scNumberField: null, resultFieldInternalNames: [],
      queryClient, loadTasks, notify, setElementTaskMatch, pendingResult: null,
    });
    return React.createElement("div");
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Host)); });
  let saved = true;
  await act(async () => { saved = await captured.mutations.changeTaskAssignee(TASK, MAILING); });
  await act(async () => { root.unmount(); });
  container.remove();
  return { saved, notify, loadTasks };
}
