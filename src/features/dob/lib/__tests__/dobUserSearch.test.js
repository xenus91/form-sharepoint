// src/features/dob/lib/__tests__/dobUserSearch.test.js
//
// Заявки ДОБ живут на сайте sites/dob/doblogistic: поиск людей и их сведений
// для формы заявки должен идти туда же, а не на основной сайт (obrazceo).
import { describe, it, expect, vi, beforeEach } from "vitest";

const DOB_BASE = "/dob-api/sites/dob/doblogistic/_api";
const TASKS_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639"; // основной список задач
const REQUESTS_GUID = "21B5B544-BD98-4B06-891F-C5A137331394"; // заявки ДОБ

vi.mock("../../api/dobClient", () => ({
  dobApiBase: () => DOB_BASE,
  dobAxios: { get: vi.fn(async () => ({ data: {} })), post: vi.fn() },
}));

vi.mock("../../../../tasks/userSearch", () => ({
  searchSiteUsers: vi.fn(async () => []),
  getUserPositions: vi.fn(async () => ({})),
}));

import { dobAxios } from "../../api/dobClient";
import { searchSiteUsers, getUserPositions } from "../../../../tasks/userSearch";
import { searchDobUsers, searchDobGroups, dobUserPositions, userSearchFor } from "../dobUserSearch";

beforeEach(() => { vi.clearAllMocks(); });

describe("поиск людей для сайта ДОБ", () => {
  it("searchDobUsers ищет на сайте ДОБ (base + клиент ДОБ)", async () => {
    await searchDobUsers("иванов");
    expect(searchSiteUsers).toHaveBeenCalledTimes(1);
    const [query, opts] = searchSiteUsers.mock.calls[0];
    expect(query).toBe("иванов");
    expect(opts.base).toBe(DOB_BASE);
    expect(opts.groupsOnly).toBeUndefined();
    // клиент — именно ДОБ (проверяем делом, а не ссылкой на функцию)
    await opts.get("/web/siteusers?$filter=x");
    // клиент — ДОБ, и относительный путь достроен базой сайта ДОБ
    const calledUrl = String(dobAxios.get.mock.calls[0][0]);
    expect(calledUrl.startsWith("/dob-api/sites/dob/doblogistic/_api/")).toBe(true);
    expect(calledUrl).toContain("/web/siteusers?$filter=x");
  });

  it("searchDobGroups — там же, но только группы", async () => {
    await searchDobGroups("_РЦ 8117");
    const [, opts] = searchSiteUsers.mock.calls[0];
    expect(opts.base).toBe(DOB_BASE);
    expect(opts.groupsOnly).toBe(true);
  });

  it("сведения о людях (должность/департамент/офис) — тоже с сайта ДОБ", async () => {
    const users = [{ Id: 5, LoginName: "i:0#.f|membership|ivanov.ii@lenta.com" }];
    await dobUserPositions(users);
    expect(getUserPositions).toHaveBeenCalledTimes(1);
    const [list, opts] = getUserPositions.mock.calls[0];
    expect(list).toEqual(users);
    await opts.get("/web/siteusers");
    const posUrl = String(dobAxios.get.mock.calls[0][0]);
    expect(posUrl.startsWith("/dob-api/sites/dob/doblogistic/_api/")).toBe(true);
    expect(posUrl).toContain("/web/siteusers");
  });

  it("userSearchFor: список ДОБ → сайт ДОБ", async () => {
    const s = userSearchFor(REQUESTS_GUID);
    await s.search("иванов");
    expect(searchSiteUsers.mock.calls[0][1].base).toBe(DOB_BASE);
    await s.getPositions([{ Id: 1, LoginName: "x" }]);
    await getUserPositions.mock.calls[0][1].get("/web/siteusers");
    const posUrl = String(dobAxios.get.mock.calls[0][0]);
    expect(posUrl.startsWith("/dob-api/sites/dob/doblogistic/_api/")).toBe(true);
    expect(posUrl).toContain("/web/siteusers");
  });

  it("userSearchFor: основной список задач → основной сайт (без base ДОБ)", async () => {
    const s = userSearchFor(TASKS_GUID);
    expect(s.search).toBe(searchSiteUsers);
    expect(s.getPositions).toBe(getUserPositions);
    // вызов идёт без подмены базы/клиента — то есть основным сайтом
    await s.search("иванов");
    expect(searchSiteUsers).toHaveBeenCalledWith("иванов");
    expect(dobAxios.get).not.toHaveBeenCalled();
  });
});
