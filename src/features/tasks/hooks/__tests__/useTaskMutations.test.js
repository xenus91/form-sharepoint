// @vitest-environment jsdom
// Регрессионный тест completeTask: ловит необъявленные идентификаторы в рантайме
// (MIN_OVERLAY_MS и т.п.), которых не видит tsc, т.к. .js/.jsx не проверяются.
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

const TASK = {
  Id: 652,
  Title: "Устранить проблемы",
  Status: "В процессе",
  PercentComplete: 0,
  ResultSearchTHU: "",
  Location1: "",
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F00",
  contentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F00",
};

function makeQueryClient(setQueryDataSpy) {
  return {
    setQueryData: (key, updater) => setQueryDataSpy(key, updater),
    invalidateQueries: vi.fn(),
  };
}

async function mountAndComplete({
  resultValue = "Найдена",
  promptValues = {},
  additionalRequired = "",
  additionalActions = [],
  additionalRequiredIsBoolean,
  onFlagChange,
  apiImpl,
} = {}) {
  const notify = vi.fn();
  const loadTasks = vi.fn(async () => {});
  const setQueryData = vi.fn();
  const queryClient = makeQueryClient(setQueryData);

  apiState.get.mockReset();
  apiState.post.mockReset();
  apiState.invalidate.mockReset();

  apiState.get.mockImplementation(async () => ({
    data: {
      d: {
        Id: TASK.Id,
        Status: "В процессе",
        PercentComplete: 0,
        __metadata: { type: "SP.Data.TasksListItem", etag: '"1"' },
      },
    },
    headers: {},
  }));
  apiState.post.mockImplementation(async () => ({ data: { d: {} } }));
  if (apiImpl?.get) apiState.get.mockImplementation(apiImpl.get);
  if (apiImpl?.post) apiState.post.mockImplementation(apiImpl.post);

  const captured = {};
  function Host() {
    const m = useTaskMutations({
      entityType: "SP.Data.TasksListItem",
      completedStatusValue: "Завершена",
      inProgressStatusValue: "В процессе",
      additionalRequiredIsBoolean,
      setAdditionalRequiredIsBoolean: onFlagChange || vi.fn(),
      resultFieldsMeta: new Map(),
      ctResultMap: new Map(),
      taskConfiguration: null,
      fieldDefaultActions: [],
      currentUserId: 1,
      currentUserTitle: "Поршаков Сергей",
      distribution: null,
      taskFieldNames: [],
      recipientField: "Recipient",
      scNumberField: "SCNumber",
      resultFieldInternalNames: ["ResultSearchTHU"],
      queryClient,
      loadTasks,
      notify,
      setElementTaskMatch: vi.fn(),
      pendingResult: null,
    });
    captured.mutations = m;
    return React.createElement("div", null, String(m.updatingId ?? "idle"));
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Host));
  });

  const startedAt = Date.now();
  await act(async () => {
    await captured.mutations.completeTask(TASK, resultValue, promptValues, additionalRequired, additionalActions);
  });
  const elapsed = Date.now() - startedAt;

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return { notify, loadTasks, setQueryData, queryClient, apiState, elapsed, captured };
}

describe("useTaskMutations.completeTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("успешно завершает задачу и показывает snackbar ПОСЛЕ обновления списка", async () => {
    const { notify, loadTasks, apiState: api } = await mountAndComplete();

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toContain("items(652)");
    expect(config.headers["X-HTTP-Method"]).toBe("MERGE");
    expect(body.ResultSearchTHU).toBe("Найдена");
    expect(body.Status).toBe("Завершена");
    expect(body.PercentComplete).toBe(1);

    expect(loadTasks).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("завершена: Найдена");

    // Порядок: сначала loadTasks, потом notify (карточка не «пропадает» раньше ответа)
    expect(loadTasks.mock.invocationCallOrder[0]).toBeLessThan(notify.mock.invocationCallOrder[0]);
  });

  it("не выставляет Status/PercentComplete оптимистично (карточка остаётся во вкладке)", async () => {
    const { setQueryData } = await mountAndComplete();
    expect(setQueryData).toHaveBeenCalled();
    for (const [key, updater] of setQueryData.mock.calls) {
      const next = updater([TASK]);
      const patched = next.find((t) => t.Id === TASK.Id);
      // статус НЕ меняется оптимистично — задача остаётся во вкладке до ответа сервера
      expect(patched.Status).toBe("В процессе");
      expect(patched.PercentComplete).toBe(0);
      expect(patched.ResultSearchTHU).toBe("Найдена");
    }
  });

  it("держит оверлей не меньше MIN_OVERLAY_MS", async () => {
    const { elapsed } = await mountAndComplete();
    expect(elapsed).toBeGreaterThanOrEqual(450);
  });

  it("передаёт prompt-поля в payload (без системных)", async () => {
    const { apiState: api } = await mountAndComplete({
      resultValue: "Не исправлено",
      promptValues: { CommentResult: "Паллет не перемотан", Status: "Хак" },
    });
    const body = api.post.mock.calls.at(-1)[1];
    expect(body.CommentResult).toBe("Паллет не перемотан");
    expect(body.Status).toBe("Завершена"); // системное поле не перезаписано
  });

  it("MultiChoice из формы уходит объектом-коллекцией, а не строкой «;#»", async () => {
    // Регрессия: SP в odata=verbose отвечает «unexpected 'PrimitiveValue' … a
    // 'StartObject' node was expected», если многозначная колонка пришла строкой.
    const { apiState: api } = await mountAndComplete({
      resultValue: "Не исправлено",
      promptValues: {
        ErrorTypeValidation: "Бессистемно;#Размещение",
        GuiltyId: { __metadata: { type: "Collection(Edm.Int32)" }, results: [936, 20] },
      },
    });
    const body = api.post.mock.calls.at(-1)[1];
    expect(body.ErrorTypeValidation).toEqual({
      __metadata: { type: "Collection(Edm.String)" },
      results: ["Бессистемно", "Размещение"],
    });
    // многократный выбор людей не расплющился в одно значение
    expect(body.GuiltyId.results).toEqual([936, 20]);
  });

  it("Boolean-колонка не распознана: повторяем запрос со true/false и запоминаем тип", async () => {
    // Регрессия пользователя: «Не удается преобразовать значение-примитив в ожидаемый тип Edm.Boolean».
    const accepted = [];
    const flagChanges = [];
    const booleanError = () => {
      const err = new Error("Request failed with status code 400");
      err.response = {
        status: 400,
        data: {
          error: {
            message: {
              value:
                'Не удается преобразовать значение-примитив в ожидаемый тип "Edm.Boolean". Дополнительные сведения см. во внутреннем исключении.',
            },
          },
        },
      };
      return err;
    };
    const { notify, apiState: api } = await mountAndComplete({
      additionalRequired: "Нет",
      additionalRequiredIsBoolean: false, // метаданные не распознали Boolean-колонку
      onFlagChange: (v) => flagChanges.push(v),
      apiImpl: {
        post: async (url, body) => {
          const req = body.AdditionalsActionsRequired ?? body.AdditionalActionsRequired;
          if (typeof req === "string") throw booleanError(); // строка в Edm.Boolean → 400
          accepted.push(body);
          return { data: { d: {} } };
        },
      },
    });

    // первая попытка — строкой (упала), вторая — boolean (успех), тип запомнен
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(typeof api.post.mock.calls[0][1].AdditionalsActionsRequired).toBe("string");
    expect(accepted).toHaveLength(1);
    expect(accepted[0].AdditionalsActionsRequired).toBe(false);
    expect(flagChanges).toEqual([true]);
    expect(notify.mock.calls.at(-1)[0]).toContain("завершена: Найдена");
  });

  it("текстовая колонка («Да»/«Нет») тоже не теряет результат: Edm.String → строкой", async () => {
    const accepted = [];
    const { apiState: api } = await mountAndComplete({
      additionalRequired: "Да",
      additionalActions: ["Проверить ТМЦ"],
      additionalRequiredIsBoolean: true, // метаданные сказали Boolean, но колонка текстовая
      apiImpl: {
        post: async (url, body) => {
          const req = body.AdditionalsActionsRequired ?? body.AdditionalActionsRequired;
          if (typeof req === "boolean") {
            const err = new Error("Request failed with status code 400");
            err.response = { status: 400, data: { error: { message: { value: 'Не удается преобразовать значение-примитив в ожидаемый тип "Edm.String".' } } } };
            throw err;
          }
          accepted.push(body);
          return { data: { d: {} } };
        },
      },
    });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(accepted[0].AdditionalsActionsRequired).toBe("Да");
  });

  it("на ошибке сервера показывает уведомление об ошибке", async () => {
    const serverError = { response: { status: 500, data: { error: { message: { value: "Сбой" } } } } };
    const { notify } = await mountAndComplete({
      apiImpl: { post: async () => { throw serverError; } },
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toEqual({ severity: "error" });
  });
});
