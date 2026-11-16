// @vitest-environment jsdom
// src/features/tasks/lib/__tests__/assignees.displayName.test.js
//
// «Исполнитель»/«Кому назначено»: в карточке принципала ФИО и учётная запись —
// РАЗНЫЕ значения.
//
// Как устроено на реальном тенанте (проверено по данным пользователя):
//   • SPUser.Title        — ФИО, «Поршаков Сергей». Тот же источник, откуда
//                           приложение берёт имя текущего пользователя
//                           (/web/currentuser → d.Title, hooks/useCurrentUser.js).
//   • SPUser.LoginName    — учётная запись, «i:0#.w|retail\sergey.porshakov».
//   • SiteUserInfoList.Name — ТОЖЕ учётная запись. Брать её как ФИО нельзя:
//                           «Имя» и «Учётная запись» становились одинаковыми.
//   • должность проект читает отдельно как JobTitle (tasks/userSearch.js).
import { describe, it, expect, vi } from "vitest";
import { resolvePrincipal } from "../assignees";

const NAME = "Поршаков Сергей";
const LOGIN = "i:0#.w|retail\\sergey.porshakov";
const EMAIL = "sergey.porshakov@lenta.com";

function makeGet({ principalType = 1 } = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/web/getuserbyid(")) {
      return { data: { d: { Id: 10, Title: NAME, LoginName: LOGIN, Email: EMAIL, PrincipalType: principalType } } };
    }
    if (u.includes("/web/sitegroups/getbyid(")) {
      return { data: { d: { Id: 10, Title: "Смена №2", LoginName: "Смена №2" } } };
    }
    throw new Error("unexpected url: " + u);
  });
}

describe("resolvePrincipal — ФИО, а не учётная запись", () => {
  it("имя — Title принципала, учётная запись — LoginName, они разные", async () => {
    const info = await resolvePrincipal(makeGet(), 10);
    expect(info.title).toBe(NAME);
    expect(info.loginName).toBe(LOGIN);
    expect(info.title).not.toBe(info.loginName);
    expect(info.email).toBe(EMAIL);
    expect(info.kind).toBe("user");
  });

  it("регрессия: в «список сведений о пользователях» за именем не ходим", async () => {
    // Колонка Name там содержит учётную запись — из-за неё «Имя» и
    // «Учётная запись» в карточке сотрудника дублировали друг друга.
    const get = makeGet();
    await resolvePrincipal(get, 10);
    const urls = get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("SiteUserInfoList"))).toBe(false);
    // Ровно один запрос: тип принципала известен из PrincipalType.
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/web/getuserbyid(10)");
  });

  it("Title пуст — имени нет, и учётная запись его не подменяет", async () => {
    const get = vi.fn(async () => ({ data: { d: { Id: 10, Title: "", LoginName: LOGIN, PrincipalType: 1 } } }));
    const info = await resolvePrincipal(get, 10);
    expect(info.title).toBeNull();
    expect(info.loginName).toBe(LOGIN);
  });

  it("PrincipalType не приехал, группы с таким Id нет — остаёмся пользователем с Title", async () => {
    const get = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/web/getuserbyid(")) return { data: { d: { Id: 10, Title: NAME, LoginName: LOGIN, PrincipalType: null } } };
      if (u.includes("/web/sitegroups/getbyid(")) throw new Error("не группа");
      throw new Error("unexpected: " + u);
    });
    const info = await resolvePrincipal(get, 10);
    expect(info.title).toBe(NAME);
    expect(info.kind).toBe("user");
  });

  it("группа: имя группы, учётная запись — её же название", async () => {
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
});
