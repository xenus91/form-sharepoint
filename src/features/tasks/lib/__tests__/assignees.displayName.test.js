// @vitest-environment jsdom
// src/features/tasks/lib/__tests__/assignees.displayName.test.js
//
// «Исполнитель»/«Кому назначено»: ФИО, а не должность.
//
// Причина бага: имя добирается по Id через /web/getuserbyid(id), а у SPUser
// поле Title берётся из колонки Title списка сведений о пользователях, где
// лежит ДОЛЖНОСТЬ (её проект читает отдельно как JobTitle — tasks/userSearch.js).
// ФИО хранится в колонке Name — её и надо брать.
import { describe, it, expect, vi } from "vitest";
import { resolvePrincipal } from "../assignees";

const NAME = "Иванов Иван Иванович";
const POSITION = "Кладовщик";

/** Мок SharePoint: разбираем url и отдаём нужный ответ. */
function makeGet({ user = {}, userInfoItem = null, userInfoFails = false } = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/web/getuserbyid(")) {
      return { data: { d: { Id: 207, Title: POSITION, LoginName: "i:0#.w|dob\\ivanov", Email: "iv@dob.ru", PrincipalType: 1, ...user } } };
    }
    if (u.includes("/web/SiteUserInfoList/items(")) {
      if (userInfoFails) {
        const err = new Error("404");
        err.response = { status: 404 };
        throw err;
      }
      return { data: { d: userInfoItem === null ? { Id: 207, Name: NAME, Title: POSITION } : userInfoItem } };
    }
    if (u.includes("/web/sitegroups/getbyid(")) {
      return { data: { d: { Id: 207, Title: "Смена №2", LoginName: "Смена №2" } } };
    }
    throw new Error("unexpected url: " + u);
  });
}

describe("resolvePrincipal — ФИО вместо должности", () => {
  it("берёт Name из списка сведений, хотя getuserbyid().Title — должность", async () => {
    const info = await resolvePrincipal(makeGet(), 207);
    expect(info.title).toBe(NAME);
    expect(info.title).not.toBe(POSITION);
    expect(info.kind).toBe("user");
    expect(info.loginName).toBe("i:0#.w|dob\\ivanov");
  });

  it("спрашивает колонку Name в списке сведений о пользователях", async () => {
    const get = makeGet();
    await resolvePrincipal(get, 207);
    const hit = get.mock.calls.map((c) => String(c[0])).find((u) => u.includes("SiteUserInfoList"));
    expect(hit).toBeTruthy();
    expect(hit).toContain("$select=Id,Name,Title,EMail,UserName");
    expect(hit).toContain("/items(207)");
  });

  it("нет Name (пусто) — остаёмся при Title, имя не теряем", async () => {
    const info = await resolvePrincipal(makeGet({ userInfoItem: { Id: 207, Name: "", Title: POSITION } }), 207);
    expect(info.title).toBe(POSITION);
  });

  it("список сведений недоступен (404) — фолбэк на Title, резолв не падает", async () => {
    const info = await resolvePrincipal(makeGet({ userInfoFails: true }), 207);
    expect(info.title).toBe(POSITION);
    expect(info.kind).toBe("user");
  });

  it("группа не трогается: у неё нет ни Name, ни должности", async () => {
    const get = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/web/getuserbyid(")) throw new Error("не пользователь");
      if (u.includes("/web/sitegroups/getbyid(")) return { data: { d: { Id: 33, Title: "Смена №2", LoginName: "Смена №2" } } };
      throw new Error("unexpected: " + u);
    });
    const info = await resolvePrincipal(get, 33);
    expect(info.kind).toBe("group");
    expect(info.title).toBe("Смена №2");
  });

  it("PrincipalType не приехал, группы с таким Id нет — Name тоже в приоритете", async () => {
    // Тот же Id не должен отвечать ещё и как группа: иначе сработает ветка
    // «уточняем, не группа ли это» и имя возьмётся у группы.
    const get = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/web/getuserbyid(")) {
        return { data: { d: { Id: 207, Title: POSITION, LoginName: "i:0#.w|dob\\ivanov", PrincipalType: null } } };
      }
      if (u.includes("/web/SiteUserInfoList/items(")) return { data: { d: { Id: 207, Name: NAME, Title: POSITION } } };
      if (u.includes("/web/sitegroups/getbyid(")) throw new Error("не группа");
      throw new Error("unexpected: " + u);
    });
    const info = await resolvePrincipal(get, 207);
    expect(info.title).toBe(NAME);
    expect(info.kind).toBe("user");
  });
});
