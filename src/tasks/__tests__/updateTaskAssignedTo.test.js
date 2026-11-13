import { beforeEach, describe, expect, it, vi } from "vitest";
import { TASKS_LIST_API } from "../config";
import { buildTaskAssignedToPatch, updateTaskAssignedTo } from "../mutations/updateTaskAssignedTo";

const TASK = { Id: 42, AssignedTo: "Старая рассылка", AssignedToId: 11 };
const MAILING = {
  Id: 33,
  Title: "Рассылка РЦ Отгрузка",
  LoginName: "mailing-rc-shipping",
  Email: "rc-shipping@example.test",
  PrincipalType: 2,
};

function makeDeps({ field = { InternalName: "AssignedTo", TypeAsString: "User", AllowMultipleValues: false }, fresh = {} } = {}) {
  const get = vi.fn(async (url) => {
    if (url.includes("/items(42)?")) {
      return {
        data: { d: {
          Id: 42,
          AssignedTo: { Id: 11, Title: "Старая рассылка" },
          Modified: "2026-10-10T12:00:00Z",
          __metadata: { type: "SP.Data.TasksListItem", etag: 'W/"7"' },
          ...fresh,
        } },
        headers: {},
      };
    }
    if (url.includes("/fields?")) {
      return { data: { d: { results: field ? [field] : [] } } };
    }
    throw new Error(`Unexpected GET: ${url}`);
  });
  const post = vi.fn(async () => ({ data: { d: {} } }));
  return { get, post };
}

describe("updateTaskAssignedTo — точечная запись в Tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("для User-поля отправляет один Id и свежий ETag", async () => {
    const deps = makeDeps();
    const result = await updateTaskAssignedTo(TASK, MAILING, deps);

    expect(result).toMatchObject({ assigneeId: 33, isMultiple: false, etag: 'W/"7"' });
    expect(deps.get).toHaveBeenCalledWith(
      `${TASKS_LIST_API}/items(42)?$select=Id,AssignedTo/Id,AssignedTo/Title,Modified&$expand=AssignedTo`,
      { headers: { Accept: "application/json;odata=verbose" } },
    );
    expect(deps.post).toHaveBeenCalledTimes(1);
    expect(deps.post).toHaveBeenCalledWith(
      `${TASKS_LIST_API}/items(42)`,
      { __metadata: { type: "SP.Data.TasksListItem" }, AssignedToId: 33 },
      { headers: {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
        "IF-MATCH": 'W/"7"',
        "X-HTTP-Method": "MERGE",
      } },
    );
  });

  it("для UserMulti заменяет коллекцию на выбранный Id в Collection(Edm.Int32)", async () => {
    const deps = makeDeps({
      field: { InternalName: "AssignedTo", TypeAsString: "UserMulti", AllowMultipleValues: true },
      fresh: { AssignedTo: { results: [{ Id: 11, Title: "Первая" }, { Id: 12, Title: "Вторая" }] } },
    });
    const result = await updateTaskAssignedTo(TASK, MAILING, deps);
    const payload = deps.post.mock.calls[0][1];

    expect(result.isMultiple).toBe(true);
    expect(payload.AssignedToId).toEqual({ __metadata: { type: "Collection(Edm.Int32)" }, results: [33] });
  });

  it("если метаданные поля недоступны, определяет UserMulti по expanded-коллекции", async () => {
    const deps = makeDeps({ field: null, fresh: { AssignedTo: { results: [{ Id: 11, Title: "Старая рассылка" }] } } });
    const originalGet = deps.get.getMockImplementation();
    deps.get.mockImplementation(async (url, config) => {
      if (url.includes("/fields?")) throw new Error("field metadata unavailable");
      return originalGet(url, config);
    });

    const result = await updateTaskAssignedTo(TASK, MAILING, deps);
    expect(result.isMultiple).toBe(true);
    expect(deps.post.mock.calls[0][1].AssignedToId.results).toEqual([33]);
  });

  it("не угадывает тип unassigned AssignedTo при недоступных метаданных поля", async () => {
    const deps = makeDeps({ field: null, fresh: { AssignedTo: null } });
    const originalGet = deps.get.getMockImplementation();
    deps.get.mockImplementation(async (url, config) => {
      if (url.includes("/fields?")) throw new Error("field metadata unavailable");
      return originalGet(url, config);
    });

    await expect(updateTaskAssignedTo(TASK, MAILING, deps))
      .rejects.toThrow("Не удалось определить тип поля «AssignedTo»");
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("не отправляет MERGE с wildcard, если актуальный ETag недоступен", async () => {
    const deps = makeDeps({ fresh: { __metadata: { type: "SP.Data.TasksListItem" } } });

    await expect(updateTaskAssignedTo(TASK, MAILING, deps))
      .rejects.toThrow("актуальный ETag");
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("при конфликте ETag отдаёт 412 вызывающему коду, не пишет поверх новой версии", async () => {
    const deps = makeDeps();
    const conflict = Object.assign(new Error("Precondition Failed"), { response: { status: 412 } });
    deps.post.mockRejectedValueOnce(conflict);

    await expect(updateTaskAssignedTo(TASK, MAILING, deps)).rejects.toBe(conflict);
    expect(deps.post).toHaveBeenCalledTimes(1);
    expect(deps.post.mock.calls[0][2].headers["IF-MATCH"]).toBe('W/"7"');
  });

  it("отклоняет принципал не типа DistributionList", async () => {
    const deps = makeDeps();
    await expect(updateTaskAssignedTo(TASK, { ...MAILING, PrincipalType: 4 }, deps))
      .rejects.toThrow("только список рассылки");
    expect(deps.get).not.toHaveBeenCalled();
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("не отправляет запросы для задачи другого списка/сайта", async () => {
    const deps = makeDeps();
    await expect(updateTaskAssignedTo({ ...TASK, sourceId: "external" }, MAILING, deps))
      .rejects.toThrow("основного списка Tasks");
    expect(deps.get).not.toHaveBeenCalled();
    expect(deps.post).not.toHaveBeenCalled();
  });
});

describe("buildTaskAssignedToPatch", () => {
  it("обновляет название и Id для карточки и сохраняет raw-форму multi-поля", () => {
    const patch = buildTaskAssignedToPatch({ raw: { Title: "Задача", Note: "не менять" } }, MAILING, {
      isMultiple: true,
      modified: "2026-10-10T15:00:00Z",
    });

    expect(patch).toMatchObject({
      AssignedTo: "Рассылка РЦ Отгрузка",
      AssignedToId: 33,
      Modified: "2026-10-10T15:00:00Z",
      raw: {
        Title: "Задача",
        Note: "не менять",
        AssignedTo: { results: [{ Id: 33, Title: "Рассылка РЦ Отгрузка", LoginName: "mailing-rc-shipping", Email: "rc-shipping@example.test" }] },
        AssignedToId: { __metadata: { type: "Collection(Edm.Int32)" }, results: [33] },
      },
    });
  });
});
