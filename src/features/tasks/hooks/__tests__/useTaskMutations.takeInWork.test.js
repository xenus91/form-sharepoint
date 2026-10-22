// @vitest-environment jsdom
// src/features/tasks/hooks/__tests__/useTaskMutations.takeInWork.test.js
//
// После «взять в работу» в «Исполнитель» должно попадать имя, которое записал
// SharePoint, а не currentUserTitle из профиля: в профиле
// (SP.UserProfiles.PeopleManager/GetMyProperties → d.Title) бывает учётная
// запись, и именно она показывалась исполнителем.
import { describe, it, expect, vi, beforeEach } from "vitest";
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

const ACCOUNT = "i:0#.w|retail\\sergey.porshakov";
const NAME = "Поршаков Сергей";

const TASK = {
  Id: 25399,
  Title: "Проверить остаток",
  Status: "Не начата",
  PercentComplete: 0,
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F00",
};

async function runTake({ editorTitle = NAME, editorId = 10, readbackFails = false, currentUserTitle = ACCOUNT } = {}) {
  const notify = vi.fn();
  const loadTasks = vi.fn(async () => {});
  const setQueryData = vi.fn();
  const setElementTaskMatch = vi.fn();
  const queryClient = { setQueryData: (k, u) => setQueryData(k, u), invalidateQueries: vi.fn() };

  apiState.get.mockReset();
  apiState.post.mockReset();
  apiState.invalidate.mockReset();

  // Один и тот же url зовётся дважды: ДО записи (задача не начата, исполнителя
  // нет) и ПОСЛЕ (SharePoint проставил Editor). Различаем по номеру вызова.
  let calls = 0;
  apiState.get.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) {
      return {
        data: { d: { Id: TASK.Id, Status: "Не начата", PercentComplete: 0, __metadata: { etag: '"1"' } } },
        headers: {},
      };
    }
    if (readbackFails) throw new Error("нет доступа");
    return {
      data: { d: { Id: TASK.Id, Status: "В процессе выполнения", Editor: { Id: editorId, Title: editorTitle } } },
      headers: {},
    };
  });
  apiState.post.mockImplementation(async () => ({ data: { d: {} } }));

  const captured = {};
  function Host() {
    const m = useTaskMutations({
      entityType: "SP.Data.TasksListItem",
      completedStatusValue: "Завершена",
      inProgressStatusValue: "В процессе выполнения",
      setAdditionalRequiredIsBoolean: vi.fn(),
      resultFieldsMeta: new Map(),
      ctResultMap: new Map(),
      taskConfiguration: null,
      fieldDefaultActions: [],
      currentUserId: 10,
      currentUserTitle,
      distribution: null,
      taskFieldNames: [],
      recipientField: "Recipient",
      scNumberField: "SCNumber",
      resultFieldInternalNames: ["ResultSearchTHU"],
      queryClient,
      loadTasks,
      notify,
      setElementTaskMatch,
      pendingResult: null,
    });
    captured.m = m;
    return React.createElement("div", null, String(m.updatingId ?? "idle"));
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Host)); });
  await act(async () => { await captured.m.handleTakeInWork(TASK); });
  await act(async () => { root.unmount(); });
  container.remove();

  // Что хук записал в кэш списка задач.
  const written = [];
  for (const [, updater] of setQueryData.mock.calls) {
    const next = updater([TASK]);
    if (Array.isArray(next)) written.push(next[0]);
  }
  return { written, setElementTaskMatch, notify, apiState };
}

describe("handleTakeInWork — исполнитель из SharePoint, а не из профиля", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("в кэш уходит ФИО, которое записал SharePoint, а не учётная запись из профиля", async () => {
    const { written } = await runTake({ currentUserTitle: ACCOUNT, editorTitle: NAME });
    expect(written.length).toBeGreaterThan(0);
    const row = written[written.length - 1];
    expect(row.EditorTitle).toBe(NAME);
    expect(row.EditorTitle).not.toBe(ACCOUNT);
    expect(row.Editor).toBe(NAME);
    expect(row.EditorId).toBe(10);
  });

  it("карточка #tasks/<Id> получает то же имя (setElementTaskMatch)", async () => {
    const { setElementTaskMatch } = await runTake({ currentUserTitle: ACCOUNT, editorTitle: NAME });
    expect(setElementTaskMatch).toHaveBeenCalled();
    const updater = setElementTaskMatch.mock.calls[setElementTaskMatch.mock.calls.length - 1][0];
    const next = updater(TASK);
    expect(next.EditorTitle).toBe(NAME);
    expect(next.EditorTitle).not.toBe(ACCOUNT);
  });

  it("SharePoint не отдал Editor — остаёмся при локальном значении, имя не теряем", async () => {
    const { written } = await runTake({ readbackFails: true, currentUserTitle: NAME });
    const row = written[written.length - 1];
    expect(row.EditorTitle).toBe(NAME);
  });

  it("после взятия в работу элемент перечитывается (запрос с $expand=Editor)", async () => {
    const { apiState } = await runTake();
    const urls = apiState.get.mock.calls.map((c) => String(c[0]));
    const readbacks = urls.filter((u) => u.includes(`items(${TASK.Id})`) && u.includes("$expand=Editor"));
    expect(readbacks.length).toBe(2); // до записи и после
  });
});
