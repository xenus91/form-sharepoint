import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUserSearchCache,
  searchAssignedToGroups,
  searchDistributionLists,
} from "../userSearch";

const PROCESS_QUERY_PATH = "/_vti_bin/client.svc/ProcessQuery";

const pickerResponse = (entries) => ({
  data: [
    { SchemaVersion: "15.0.0.0", LibraryVersion: "16.0.0.0", ErrorInfo: null },
    2,
    JSON.stringify(entries),
  ],
});

const xmlPropertyValue = (xml, name) => {
  const match = String(xml).match(new RegExp(`<Property Name="${name}" Type="[^"]*">([^<]*)</Property>`));
  return match?.[1] || "";
};

const xmlUnescape = (value) => String(value)
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

const processQueryCall = (post) => post.mock.calls.find(([url]) => url.includes("/_vti_bin/client.svc/ProcessQuery"));

beforeEach(() => clearUserSearchCache());

describe("поиск групп для AssignedTo через CSOM People Picker", () => {
  it("отправляет стандартный ProcessQuery XML и динамически подставляет запрос", async () => {
    const post = vi.fn(async (url) => (
      url.includes("/_vti_bin/client.svc/ProcessQuery")
        ? pickerResponse([{
          Key: "c:0-.f|rolemanager|rc-8117",
          DisplayText: "Группа РЦ 8117",
          EntityData: { SPUserID: "33", PrincipalType: "SecurityGroup" },
        }])
        : null
    ));
    const get = vi.fn();

    const results = await searchAssignedToGroups("_РЦ 8117", { get, post, limit: 1 });

    expect(results).toEqual([expect.objectContaining({
      Id: 33,
      Title: "Группа РЦ 8117",
      PrincipalType: 4,
    })]);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, xml, config] = processQueryCall(post);
    expect(url).toBe(PROCESS_QUERY_PATH);
    expect(typeof xml).toBe("string");
    expect(xml).toContain('Name="ClientPeoplePickerSearchUser"');
    expect(xml).toContain('Name="AllowEmailAddresses" Type="Boolean">false</Property>');
    expect(xml).toContain('Name="AllowMultipleEntities" Type="Boolean">true</Property>');
    expect(xml).toContain('Name="AllowOnlyEmailAddresses" Type="Boolean">false</Property>');
    expect(xml).toContain('Name="MaximumEntitySuggestions" Type="Number">30</Property>');
    expect(xml).toContain('Name="PrincipalSource" Type="Number">15</Property>');
    expect(xml).toContain('Name="PrincipalType" Type="Number">13</Property>');
    expect(xmlPropertyValue(xml, "QueryString")).toBe("_РЦ 8117");
    expect(config).toEqual({ headers: {
      Accept: "application/json",
      "Content-Type": "text/xml; charset=utf-8",
    } });
    expect(get).not.toHaveBeenCalled();
  });

  it("в dev отправляет CSOM на same-origin Vite proxy и не добавляет /_api", async () => {
    vi.stubGlobal("window", { location: { origin: "https://preview.example.test" } });
    const post = vi.fn(async () => pickerResponse([]));
    const get = vi.fn(async () => ({ data: { d: { results: [] } } }));

    try {
      await searchAssignedToGroups("группа", { get, post, limit: 1 });
      expect(processQueryCall(post)?.[0])
        .toBe(`https://preview.example.test/api${PROCESS_QUERY_PATH}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("XML-экранирует спецсимволы в пользовательском запросе", async () => {
    const query = `A<&"'`;
    const post = vi.fn(async () => pickerResponse([]));
    const get = vi.fn(async () => ({ data: { d: { results: [] } } }));

    await searchAssignedToGroups(query, { get, post, limit: 1 });

    const [, xml] = processQueryCall(post);
    expect(xmlPropertyValue(xml, "QueryString")).toBe("A&lt;&amp;&quot;&apos;");
    expect(xmlUnescape(xmlPropertyValue(xml, "QueryString"))).toBe(query);
    expect(xml).not.toContain(`>${query}</Property>`);
  });

  it("принимает только явно размеченные группы, а пользователей и PrincipalType=13 отбрасывает", async () => {
    const entries = [
      {
        Key: "i:0#.f|membership|mailing@lenta.com",
        DisplayText: "Рассылка РЦ",
        EntityData: { SPUserID: "33", PrincipalType: "DistributionList" },
      },
      {
        Key: "c:0-.f|rolemanager|security-rc",
        DisplayText: "Группа безопасности РЦ",
        EntityData: { SPUserID: "34", PrincipalType: "SecurityGroup" },
      },
      {
        Key: "c:0-.f|rolemanager|sharepoint-rc",
        DisplayText: "Группа SharePoint РЦ",
        EntityType: "SPGroup",
        EntityData: { SPUserID: "35" },
      },
      {
        Key: "i:0#.f|membership|employee@lenta.com",
        DisplayText: "Сотрудник РЦ",
        EntityData: { SPUserID: "36", PrincipalType: "User" },
      },
      {
        Key: "i:0#.f|membership|mixed@lenta.com",
        DisplayText: "Смешанная сущность",
        EntityData: { SPUserID: "37", PrincipalType: 13 },
      },
      {
        Key: "unknown-principal",
        DisplayText: "Сущность без типа",
        EntityData: { SPUserID: "38" },
      },
    ];
    const post = vi.fn(async () => pickerResponse(entries));
    const get = vi.fn();

    const results = await searchAssignedToGroups("РЦ", { get, post, limit: 10 });

    expect(results.map(({ Id, PrincipalType }) => [Id, PrincipalType])).toEqual([
      [33, 2],
      [34, 4],
      [35, 8],
    ]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.some(([url]) => url.startsWith("/web/ensureuser"))).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("разрешает через ensureuser только сущность, уже явно определённую как группа", async () => {
    const groupLogin = "c:0-.f|rolemanager|security-rc";
    const post = vi.fn(async (url) => {
      if (url.includes("/_vti_bin/client.svc/ProcessQuery")) {
        return pickerResponse([{
          Key: groupLogin,
          DisplayText: "Группа РЦ без локального Id",
          EntityData: { PrincipalType: "SecurityGroup" },
        }]);
      }
      if (url.startsWith("/web/ensureuser?logonName='")) {
        return { data: { d: {
          Id: 70,
          Title: "Группа РЦ без локального Id",
          LoginName: groupLogin,
          PrincipalType: 4,
        } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const get = vi.fn();

    const results = await searchAssignedToGroups("security-rc", { get, post, limit: 1 });

    expect(results.map(({ Id, PrincipalType }) => [Id, PrincipalType])).toEqual([[70, 4]]);
    expect(post).toHaveBeenCalledTimes(2);
    const ensureUrl = post.mock.calls[1][0];
    expect(decodeURIComponent(ensureUrl)).toContain(`logonName='${groupLogin}'`);
    expect(get).not.toHaveBeenCalled();
  });

  it("отклоняет результат ensureuser с типом пользователя", async () => {
    const post = vi.fn(async (url) => {
      if (url.includes("/_vti_bin/client.svc/ProcessQuery")) {
        return pickerResponse([{
          Key: "c:0-.f|rolemanager|misreported",
          DisplayText: "Кандидат группы",
          EntityData: { PrincipalType: "SecurityGroup" },
        }]);
      }
      if (url.startsWith("/web/ensureuser")) {
        return { data: { d: {
          Id: 71,
          Title: "Оказался пользователь",
          LoginName: "i:0#.f|membership|employee@lenta.com",
          PrincipalType: 1,
        } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const get = vi.fn(async () => ({ data: { d: { results: [] } } }));

    const results = await searchAssignedToGroups("misreported", { get, post, limit: 1 });

    expect(results).toEqual([]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("останавливает разрешение групп, если ensureuser отвечает 5xx", async () => {
    const entries = ["one", "two", "three"].map((name) => ({
      Key: `c:0-.f|rolemanager|${name}`,
      DisplayText: `Группа ${name}`,
      EntityData: { PrincipalType: "SecurityGroup" },
    }));
    const post = vi.fn(async (url) => {
      if (url.includes("/_vti_bin/client.svc/ProcessQuery")) return pickerResponse(entries);
      throw Object.assign(new Error("SharePoint ensureuser failed"), { response: { status: 500 } });
    });
    const get = vi.fn(async () => ({ data: { d: { results: [] } } }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const results = await searchAssignedToGroups("группа", { get, post });
      expect(results).toEqual([]);
      expect(post.mock.calls.filter(([url]) => url.startsWith("/web/ensureuser")).length).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("использует User Information List как fallback, но возвращает только типы групп", async () => {
    const post = vi.fn(async () => pickerResponse([]));
    const calls = [];
    const get = vi.fn(async (url) => {
      calls.push(url);
      return { data: { d: { results: [
        { Id: 40, Title: "Рассылка резерв", LoginName: "mailing-reserve", PrincipalType: 2 },
        { Id: 41, Title: "Security резерв", LoginName: "security-reserve", PrincipalType: 4 },
        { Id: 42, Title: "Сотрудник резерв", LoginName: "user-reserve", PrincipalType: 1 },
        { Id: 43, Title: "SP группа резерв", LoginName: "sp-reserve", PrincipalType: 8 },
        { Id: 44, Title: "Смешанный тип", LoginName: "mixed-reserve", PrincipalType: 13 },
      ] } } };
    });

    const results = await searchAssignedToGroups("резерв", { get, post });

    expect(results.map(({ Id, PrincipalType }) => [Id, PrincipalType])).toEqual([
      [40, 2], [41, 4], [43, 8],
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("PrincipalType ne 1");
    expect(calls[0]).toContain("$select=Id,Title,LoginName,Email,IsHiddenInUI,PrincipalType");
  });

  it("повторяет ProcessQuery и fallback без начального подчёркивания", async () => {
    const post = vi.fn(async (_url, xml) => (
      xmlPropertyValue(xml, "QueryString") === "рц"
        ? pickerResponse([{
          Key: "c:0-.f|rolemanager|mailing-rc",
          DisplayText: "Группа РЦ Приёмка",
          EntityData: { SPUserID: "55", PrincipalType: "SecurityGroup" },
        }])
        : pickerResponse([])
    ));
    const get = vi.fn();

    const results = await searchAssignedToGroups("_рц", { get, post, limit: 1 });

    expect(post.mock.calls.map(([, xml]) => xmlPropertyValue(xml, "QueryString"))).toEqual(["_рц", "рц"]);
    expect(results.map((group) => group.Id)).toEqual([55]);
    expect(get).not.toHaveBeenCalled();
  });

  it("не подменяет поиск групп общим Search REST и не разрешает неизвестные сущности", async () => {
    const post = vi.fn(async () => pickerResponse([{
      Key: "unknown",
      DisplayText: "Без типа",
      EntityData: { SPUserID: "56" },
    }]));
    const get = vi.fn(async () => ({ data: { d: { results: [] } } }));

    const results = await searchAssignedToGroups("_рц", { get, post });

    expect(results).toEqual([]);
    expect(post.mock.calls.some(([url]) => url.includes("/web/ensureuser"))).toBe(false);
    expect(post.mock.calls.every(([url]) => url.includes("/_vti_bin/client.svc/ProcessQuery"))).toBe(true);
    expect(post.mock.calls.every(([, xml]) => xmlPropertyValue(xml, "PrincipalType") === "13")).toBe(true);
    expect(get.mock.calls.some(([url]) => url.includes("/search/query"))).toBe(false);
  });

  it("использует siteusers, если CSOM ProcessQuery завершился ошибкой", async () => {
    const post = vi.fn(async () => { throw new Error("ProcessQuery unavailable"); });
    const get = vi.fn(async (url) => {
      if (url.includes("substringof")) {
        return { data: { d: { results: [
          { Id: 50, Title: "Группа РЦ Приёмка", LoginName: "security-receipt", PrincipalType: 4 },
          { Id: 51, Title: "Пользователь РЦ", LoginName: "employee-receipt", PrincipalType: 1 },
        ] } } };
      }
      return { data: { d: { results: [] } } };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const results = await searchAssignedToGroups("Приёмка", { get, post });
      expect(results.map(({ Id, PrincipalType }) => [Id, PrincipalType])).toEqual([[50, 4]]);
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("не обращается к SharePoint для запроса короче двух символов", async () => {
    const post = vi.fn();
    const get = vi.fn();
    expect(await searchAssignedToGroups("А", { get, post })).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("оставляет прежний export-алиас для вызовов поиска рассылок", () => {
    expect(searchDistributionLists).toBe(searchAssignedToGroups);
  });
});
