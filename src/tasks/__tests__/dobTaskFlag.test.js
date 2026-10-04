// src/tasks/__tests__/dobTaskFlag.test.js
// Признак «задача ДОБ» приходит из TaskBehaviour — по ИМЕНИ типа контента задачи.
//
// Почему не колонкой в списке задач: значение по умолчанию колонки в SharePoint одно
// на весь список, поэтому «IsDobTask = Да» в одном типе контента сразу проставляется
// всем задачам списка — все задачи начинали открываться нашей формой.
//
// Теперь админ ставит галочку IsDobTask в записи TaskBehaviour (Title = имя типа
// контента), резолвер маппит CT.Name → TaskBehaviour.Title, и задача получает
// признак `isDobTask` (services/taskBehaviour.markDobTask).

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  hasDobTaskFlag,
  isDialogRequired,
  isResultCheckTask,
  RESULT_CHECK_OOO_CT_ID,
  RESULT_CHECK_OOO_CT_NAME,
} from "../contentTypeFields";
import { buildTaskFormHash, isDialogResultTask } from "../../features/tasks/lib/openTaskForm";
import { isDobLikeTask } from "../../features/tasks/lib/cardTasks";
import {
  clearTaskBehaviourCache,
  fetchTaskBehaviour,
  isDobTaskByName,
  isDobTaskForTask,
  markDobTask,
  resolveTaskBehaviourByName,
} from "../../services/taskBehaviour";

const MAIN = { id: "main", listGuid: "463B634E-A71A-4FEF-9A1F-B803431D8639" };
const DOB = { id: "dob", listGuid: "03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3" };
const CT_ID = "0x01080011112222333344445555666677778888";
const CT_NAME = "Проверка качества приёмки";

function makeBehaviourMap(rows) {
  return new Map(rows.map((r) => [r.id, { enabled: true, behaviour: "", styling: "", stylingActions: "", ...r }]));
}

const MAP = makeBehaviourMap([
  { id: 1, title: CT_NAME, isDobTask: true },
  { id: 2, title: "Исправление проблемной ЕО", isDobTask: false },
  { id: 3, title: "*", isDobTask: true },
]);

const CONFIG = { taskBehaviour: MAP, ctMetaMap: new Map([[CT_ID, { name: CT_NAME }]]) };

describe("hasDobTaskFlag — признак из TaskBehaviour, а не из колонки списка", () => {
  it("задача с признаком isDobTask — задача ДОБ", () => {
    expect(hasDobTaskFlag({ Id: 10, isDobTask: true })).toBe(true);
    expect(isResultCheckTask({ Id: 10, isDobTask: true })).toBe(true);
    expect(isDialogResultTask({ Id: 10, isDobTask: true })).toBe(true);
    expect(isDobLikeTask({ Id: 10, sourceId: "main", isDobTask: true })).toBe(true);
  });

  it("сырое поле элемента IsDobTask НЕ считается признаком (общий default колонки)", () => {
    const task = { Id: 11, IsDobTask: true, raw: { IsDobTask: true }, contentTypeId: "0x010800AAAA" };
    expect(hasDobTaskFlag(task)).toBe(false);
    expect(isResultCheckTask(task)).toBe(false);
    expect(isDobLikeTask({ ...task, sourceId: "main" })).toBe(false);
  });

  it("обратная совместимость: CT «Результат проверки ООБ» работает без TaskBehaviour", () => {
    expect(isResultCheckTask({ Id: 12, contentTypeId: RESULT_CHECK_OOO_CT_ID })).toBe(true);
    expect(isResultCheckTask({ Id: 12, contentTypeName: RESULT_CHECK_OOO_CT_NAME })).toBe(true);
  });
});

describe("isDobTaskByName — маппинг по названию задачи (CT.Name → TaskBehaviour.Title)", () => {
  it("точное совпадение названия включает признак", () => {
    expect(isDobTaskByName(CT_NAME, MAP)).toBe(true);
    expect(isDobTaskByName("Исправление проблемной ЕО", MAP)).toBe(false);
    expect(isDobTaskByName("Неизвестный тип", MAP)).toBe(false);
  });

  it("частичное совпадение названий тоже работает (морфология/лишние слова)", () => {
    const map = makeBehaviourMap([{ id: 7, title: "Задача проверки качества приёмки", isDobTask: true }]);
    expect(isDobTaskByName(CT_NAME, map)).toBe(true);
  });

  it("общая запись «*» / «_default» признак НЕ включает (иначе флаг у всех задач)", () => {
    const map = makeBehaviourMap([{ id: 9, title: "*", isDobTask: true }]);
    expect(isDobTaskByName("Любой тип контента", map)).toBe(false);
    // но настройка поведения из «*» по-прежнему применяется
    expect(resolveTaskBehaviourByName("Любой тип контента", map)?.viaFallback).toBe(true);
  });

  it("resolveTaskBehaviourByName отдаёт isDobTask вместе с правилом", () => {
    expect(resolveTaskBehaviourByName(CT_NAME, MAP)?.isDobTask).toBe(true);
    expect(resolveTaskBehaviourByName("Исправление проблемной ЕО", MAP)?.isDobTask).toBe(false);
  });
});

describe("isDobTaskForTask / markDobTask — признак на задаче", () => {
  it("по ContentTypeId (имя берётся из ctMetaMap)", () => {
    const task = { Id: 20, contentTypeId: CT_ID };
    expect(isDobTaskForTask(task, CONFIG)).toBe(true);
    expect(markDobTask(task, CONFIG)).toMatchObject({ Id: 20, isDobTask: true });
  });

  it("по готовому contentTypeName и по raw.ContentType.Name", () => {
    expect(isDobTaskForTask({ Id: 21, contentTypeName: CT_NAME }, CONFIG)).toBe(true);
    expect(isDobTaskForTask({ Id: 22, raw: { ContentType: { Name: CT_NAME } } }, CONFIG)).toBe(true);
    expect(isDobTaskForTask({ Id: 23, contentTypeName: "Другой тип" }, CONFIG)).toBe(false);
  });

  it("без конфигурации (TaskBehaviour не загружен) признак не ставится", () => {
    expect(isDobTaskForTask({ Id: 24, contentTypeId: CT_ID }, null)).toBe(false);
    expect(markDobTask({ Id: 24, contentTypeId: CT_ID }, null)).toEqual({ Id: 24, contentTypeId: CT_ID });
  });

  it("markDobTask идемпотентен и не мутирует исходный объект", () => {
    const task = { Id: 25, contentTypeId: CT_ID };
    const marked = markDobTask(task, CONFIG);
    expect(marked).not.toBe(task);
    expect(task.isDobTask).toBeUndefined();
    expect(markDobTask(marked, CONFIG)).toBe(marked);
  });

  it("«Изменить» ведёт на форму ДОБ по основному списку", () => {
    const stored = { Id: 26, contentTypeId: CT_ID };
    const task = markDobTask({ ...stored, sourceId: "main" }, CONFIG);
    expect(buildTaskFormHash("main:26", [MAIN, DOB], task)).toBe(
      "#dob_tasks/26?list=463b634e-a71a-4fef-9a1f-b803431d8639",
    );
    // без признака — обычный роут
    expect(buildTaskFormHash("main:26", [MAIN, DOB], { ...stored, sourceId: "main" })).toBe("#tasks/26");
  });
});

describe("isDialogRequired — приоритет настройки TaskBehaviour", () => {
  it("признак важнее правила Behaviour dlg:false (задачу ведёт наша форма)", () => {
    expect(isDialogRequired({ requiresDialog: false }, "", "", { isDobTask: true })).toBe(true);
  });

  it("без признака dlg:false по-прежнему отключает диалог", () => {
    expect(isDialogRequired({ requiresDialog: false }, "", RESULT_CHECK_OOO_CT_NAME, {})).toBe(false);
    expect(isDialogRequired({ requiresDialog: true }, "0x0108AAA", "")).toBe(true);
  });
});

describe("fetchTaskBehaviour — колонка IsDobTask в списке TaskBehaviour", () => {
  beforeEach(() => {
    clearTaskBehaviourCache();
    const mem = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
    };
  });

  it("читает флаг IsDobTask (true/«Да»/false) и отдаёт его в записи", async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: { d: { results: [
          { Id: 1, Title: CT_NAME, Behaviour: "{}", Enabled: true, IsDobTask: true },
          { Id: 2, Title: "Исправление проблемной ЕО", Behaviour: "{}", Enabled: true, IsDobTask: false },
          { Id: 3, Title: "Ещё тип", Behaviour: "{}", Enabled: true, IsDobTask: "Да" },
        ] } },
      }),
    };
    const map = await fetchTaskBehaviour(api, { forceRefresh: true });
    expect(map.get(1).isDobTask).toBe(true);
    expect(map.get(2).isDobTask).toBe(false);
    expect(map.get(3).isDobTask).toBe(true);
    expect(isDobTaskByName(CT_NAME, map)).toBe(true);
    expect(String(api.get.mock.calls[0][0])).toContain("IsDobTask");
  });

  it("колонки IsDobTask ещё нет в списке → повтор запроса без неё, поведение сохраняется", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = {
      get: vi.fn().mockImplementation((url) => {
        if (String(url).includes("IsDobTask")) {
          return Promise.reject({ response: { status: 400, data: { error: { message: { value:
            "Столбец \"IsDobTask\" не существует. Возможно, его переименовал другой пользователь." } } } } });
        }
        return Promise.resolve({ data: { d: { results: [
          { Id: 5, Title: CT_NAME, Behaviour: '{"_default":{"c":true}}', Enabled: true },
        ] } } });
      }),
    };
    const map = await fetchTaskBehaviour(api, { forceRefresh: true });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(map.get(5).isDobTask).toBe(false);
    expect(resolveTaskBehaviourByName(CT_NAME, map)?.behaviour.ok).toBe(true);
    warn.mockRestore();
  });
});
