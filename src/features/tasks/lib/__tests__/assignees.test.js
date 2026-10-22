// src/features/tasks/lib/__tests__/assignees.test.js
//
// Определение «человек или группа» для «Кому назначено».
//
// Регрессия: `/web/getuserbyid(<id>)` в SharePoint возвращает НЕ только людей —
// группы тоже лежат в User Information List. Первая версия считала любую
// найденную запись пользователем, и у group-задач стояла иконка человека.
// Тип даёт поле PrincipalType (1 — пользователь, 2/4/8 — группы).

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseAssignees,
  resolvePrincipal,
  resolveAssignee,
  clearAssigneeCache,
  isExternalTask,
} from "../assignees";

/** Фейковый GET: роуты как в SharePoint. */
function makeGet(routes = []) {
  const calls = [];
  const get = vi.fn(async (url) => {
    calls.push(String(url));
    for (const [pattern, payload] of routes) {
      if (String(url).includes(pattern)) {
        if (payload === null) {
          const err = new Error("not found");
          err.response = { status: 404 };
          throw err;
        }
        return { data: { d: payload } };
      }
    }
    const err = new Error("not found");
    err.response = { status: 404 };
    throw err;
  });
  return { get, calls };
}

describe("resolvePrincipal — человек или группа", () => {
  beforeEach(() => { clearAssigneeCache(); });

  it("PrincipalType = 1 → пользователь", async () => {
    const { get } = makeGet([["getuserbyid(5)", { Id: 5, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov@lenta.com", Email: "ivanov@lenta.com", PrincipalType: 1 }]]);
    const info = await resolvePrincipal(get, 5);
    expect(info).toMatchObject({ id: 5, kind: "user", title: "Иванов Иван", email: "ivanov@lenta.com" });
  });

  it("PrincipalType = 8 (группа SharePoint) → группа", async () => {
    const { get } = makeGet([["getuserbyid(33)", { Id: 33, Title: "ООБ", LoginName: "ООБ", Email: "", PrincipalType: 8 }]]);
    const info = await resolvePrincipal(get, 33);
    expect(info).toMatchObject({ id: 33, kind: "group", title: "ООБ" });
    // тип известен — второй запрос (sitegroups) не нужен
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("PrincipalType = 4 (security group) → группа", async () => {
    const { get } = makeGet([["getuserbyid(11)", { Id: 11, Title: "Все кроме внешних", LoginName: "c:0-.f|rolemanager|spo-grid-all-users/x", PrincipalType: 4 }]]);
    expect((await resolvePrincipal(get, 11)).kind).toBe("group");
  });

  it("PrincipalType = 2 (список рассылки) → группа", async () => {
    const { get } = makeGet([["getuserbyid(12)", { Id: 12, Title: "Рассылка РЦ", PrincipalType: 2 }]]);
    expect((await resolvePrincipal(get, 12)).kind).toBe("group");
  });

  it("PrincipalType не приехал → уточняем группой (sitegroups/getbyid)", async () => {
    const { get, calls } = makeGet([
      ["getuserbyid(33)", { Id: 33, Title: "ООБ", LoginName: "ООБ" }],
      ["sitegroups/getbyid(33)", { Id: 33, Title: "ООБ", LoginName: "ООБ" }],
    ]);
    expect((await resolvePrincipal(get, 33)).kind).toBe("group");
    expect(calls.some((u) => u.includes("sitegroups/getbyid(33)"))).toBe(true);
  });

  it("PrincipalType не приехал и это не группа → пользователь", async () => {
    const { get } = makeGet([
      ["getuserbyid(5)", { Id: 5, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov@lenta.com" }],
      ["sitegroups/getbyid(5)", null],
    ]);
    expect((await resolvePrincipal(get, 5)).kind).toBe("user");
  });

  it("getuserbyid 404 → группа из sitegroups", async () => {
    const { get } = makeGet([
      ["getuserbyid(33)", null],
      ["sitegroups/getbyid(33)", { Id: 33, Title: "ООБ", LoginName: "ООБ" }],
    ]);
    expect((await resolvePrincipal(get, 33))).toMatchObject({ id: 33, kind: "group", title: "ООБ" });
  });

  it("ни там ни там — null (тип останется неизвестным)", async () => {
    const { get } = makeGet([]);
    expect(await resolvePrincipal(get, 999)).toBeNull();
  });
});

describe("parseAssignees — разбор AssignedTo", () => {
  it("один исполнитель: строка + Id", () => {
    expect(parseAssignees({ AssignedTo: "Иванов Иван", AssignedToId: 5 })).toEqual([{ title: "Иванов Иван", id: 5 }]);
  });

  it("SharePoint склеивает многозначных как «A;#B»", () => {
    expect(parseAssignees({ AssignedTo: "Иванов Иван;#ООБ", AssignedToId: [5, 33] }))
      .toEqual([{ title: "Иванов Иван", id: 5 }, { title: "ООБ", id: 33 }]);
  });

  it("только Id (Title не приехал)", () => {
    expect(parseAssignees({ AssignedToId: 5 })).toEqual([{ title: "", id: 5 }]);
  });

  it("нет данных — пусто", () => {
    expect(parseAssignees(null)).toEqual([]);
    expect(parseAssignees({})).toEqual([]);
  });

  it("название с запятой не рвём на части", () => {
    expect(parseAssignees({ AssignedTo: "Группа ООБ, ТК-12", AssignedToId: 7 }))
      .toEqual([{ title: "Группа ООБ, ТК-12", id: 7 }]);
  });
});

describe("isExternalTask — свой ли сайт у задачи", () => {
  it("main-задача — основной список", () => {
    expect(isExternalTask({ sourceId: "main" })).toBe(false);
    expect(isExternalTask({ Id: 1 })).toBe(false);
  });

  it("задача ДОБ — внешний сайт (Id там другой site-collection)", () => {
    expect(isExternalTask({ sourceId: "dob" })).toBe(true);
  });

  it("по GUID списка, если sourceId не задан", () => {
    expect(isExternalTask({ listGuid: "463b634e-a71a-4fef-9a1f-b803431d8639" })).toBe(false);
    expect(isExternalTask({ listGuid: "21b5b544-bd98-4b06-891f-c5a137331394" })).toBe(true);
  });
});

describe("resolveAssignee — без Id уточнять нечего", () => {
  beforeEach(() => { clearAssigneeCache(); });

  it("нет AssignedToId → kind unknown, но название из задачи остаётся", async () => {
    const info = await resolveAssignee({ AssignedTo: "Иванов Иван" }, { title: "Иванов Иван", id: null });
    expect(info).toMatchObject({ kind: "unknown", title: "Иванов Иван" });
  });
});
