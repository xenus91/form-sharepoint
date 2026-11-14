import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserSearchCache, searchDistributionLists } from "../userSearch";

const pickerResponse = (entries) => ({
  data: {
    d: {
      ClientPeoplePickerSearchUser: JSON.stringify(entries),
    },
  },
});

beforeEach(() => clearUserSearchCache());

describe("поиск почтовых рассылок для AssignedTo", () => {
  it("ищет рассылки через People Picker и исключает другие PrincipalType", async () => {
    const post = vi.fn(async () => pickerResponse([
      {
        Key: "i:0#.f|membership|shipping@lenta.com",
        DisplayText: "Рассылка РЦ Отгрузка",
        IsResolved: true,
        EntityType: "User",
        EntityData: {
          SPUserID: "33",
          AccountName: "i:0#.f|membership|shipping@lenta.com",
          Email: "shipping@lenta.com",
          PrincipalType: "DistributionList",
        },
      },
      {
        Key: "c:0-.f|rolemanager|security-rc",
        DisplayText: "Группа безопасности Отгрузка",
        EntityData: { SPUserID: "34", PrincipalType: "SecurityGroup" },
      },
      {
        Key: "i:0#.f|membership|employee@lenta.com",
        DisplayText: "Сотрудник Отгрузка",
        EntityData: { SPUserID: "35", PrincipalType: "User" },
      },
      {
        Key: "i:0#.f|membership|dispatch@lenta.com",
        DisplayText: "Рассылка Отгрузка без типа в ответе",
        EntityData: { SPUserID: "36", Email: "dispatch@lenta.com" },
      },
    ]));
    const get = vi.fn();

    const results = await searchDistributionLists("Отгрузка", { get, post });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe("/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.ClientPeoplePickerSearchUser");
    expect(body.queryParams).toMatchObject({
      AllowEmailAddresses: true,
      AllUrlZones: false,
      PrincipalSource: 15,
      PrincipalType: 2,
      QueryString: "Отгрузка",
    });
    expect(config).toEqual({ headers: { Accept: "application/json;odata=verbose" } });
    expect(results.map((mailing) => [mailing.Id, mailing.PrincipalType])).toEqual([
      [33, 2],
      [36, 2],
    ]);
    expect(get).not.toHaveBeenCalled();
  });

  it("повторяет поиск People Picker без начального подчёркивания (например, _рц → рц)", async () => {
    const post = vi.fn(async (_url, body) => (
      body.queryParams.QueryString === "рц"
        ? pickerResponse([{
          Key: "i:0#.f|membership|mailing-rc@lenta.com",
          DisplayText: "Рассылка РЦ Отгрузка",
          EntityData: { SPUserID: "60", Email: "mailing-rc@lenta.com", PrincipalType: "DistributionList" },
        }])
        : pickerResponse([])
    ));
    const get = vi.fn();

    const results = await searchDistributionLists("_рц", { get, post });

    expect(post.mock.calls.map(([, body]) => body.queryParams.QueryString)).toEqual(["_рц", "рц"]);
    expect(results.map((mailing) => mailing.Id)).toEqual([60]);
    expect(get).not.toHaveBeenCalled();
  });

  it("переходит к siteusers, если People Picker не дал результатов, фильтруя только тип 2", async () => {
    const post = vi.fn(async () => pickerResponse([]));
    const calls = [];
    const get = vi.fn(async (url) => {
      calls.push(url);
      return {
        data: {
          d: {
            results: [
              { Id: 40, Title: "Рассылка резерв", LoginName: "mailing-reserve", PrincipalType: 2 },
              { Id: 41, Title: "Security резерв", LoginName: "security-reserve", PrincipalType: 4 },
              { Id: 42, Title: "Сотрудник резерв", LoginName: "user-reserve", PrincipalType: 1 },
            ],
          },
        },
      };
    });

    const results = await searchDistributionLists("резерв", { get, post });

    expect(results.map((mailing) => mailing.Id)).toEqual([40]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("PrincipalType eq 2");
    expect(calls[0]).toContain("$select=Id,Title,LoginName,Email,IsHiddenInUI,PrincipalType");
  });

  it("повторяет fallback siteusers без начального подчёркивания", async () => {
    const post = vi.fn(async () => pickerResponse([]));
    const calls = [];
    const get = vi.fn(async (url) => {
      calls.push(url);
      if (url.includes("substringof('рц'")) {
        return { data: { d: { results: [
          { Id: 55, Title: "Рассылка РЦ Приёмка", LoginName: "mailing-rc", PrincipalType: 2 },
        ] } } };
      }
      return { data: { d: { results: [] } } };
    });

    const results = await searchDistributionLists("_рц", { get, post });

    expect(results.map((mailing) => mailing.Id)).toEqual([55]);
    expect(calls.some((url) => url.includes("substringof('_рц'"))).toBe(true);
    expect(calls.some((url) => url.includes("substringof('рц'"))).toBe(true);
  });

  it("использует siteusers, если People Picker завершился ошибкой", async () => {
    const post = vi.fn(async () => { throw new Error("People Picker unavailable"); });
    const get = vi.fn(async () => ({
      data: { d: { results: [
        { Id: 50, Title: "Рассылка РЦ Приёмка", LoginName: "mailing-receipt", PrincipalType: 2 },
      ] } },
    }));

    const results = await searchDistributionLists("Приёмка", { get, post });

    expect(results.map((mailing) => mailing.Id)).toEqual([50]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("не обращается к SharePoint для запроса короче двух символов", async () => {
    const post = vi.fn();
    const get = vi.fn();
    expect(await searchDistributionLists("А", { get, post })).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
