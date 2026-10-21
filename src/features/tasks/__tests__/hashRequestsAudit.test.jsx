// @vitest-environment jsdom
// Бюджет сетевых вызовов при открытии #tasks/<Id>.
// Считает обращения к apiClient, чтобы резать сеть по факту, а не на глаз.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isReferenceDataRequest } from "../../../sp/cache";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIN_LIST = "/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')";

const state = vi.hoisted(() => ({ requests: [] }));

const MAIN_FIELDS = ["Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified", "PercentComplete", "DueDate", "Editor", "ContentTypeId", "RelatedItems", "ResultSearchTHU", "Location1", "OffDepKey"];

// Задача, найденная через GetItems: её RelatedItems указывают на элемент 25393.
const TASK_988 = {
  Id: 988,
  Title: "Задача для элемента 25393",
  Body: "Проверить",
  Status: "В процессе выполнения",
  PercentComplete: 0,
  DueDate: null,
  Created: "2026-10-02T10:00:00Z",
  Modified: "2026-10-03T09:00:00Z",
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E",
  AssignedTo: { Id: 10, Title: "Поршаков Сергей" },
  Editor: { Id: 10, Title: "Поршаков Сергей" },
  ResultSearchTHU: "",
  Location1: "",
  RelatedItems: JSON.stringify([{ ItemId: 25393, WebId: "1c5e52aa-55bb-4eff-b7bd-747e196f2bf9", ListId: "67291e1a-7ad5-4c65-8c2c-4a414bb3cd3d" }]),
};

const CT_ID = TASK_988.ContentTypeId;

function mockApi() {
  const get = async (url) => {
    const u = String(url);
    state.requests.push(u.replace(/^.*\/_api/, "").replace(/^\/api/, ""));
    const d = u;
    if (d.includes("/web/currentuser")) return { data: { d: { Id: 10, Title: "Поршаков Сергей", LoginName: "i:0#.w|retail\\sergey.porshakov" } } };
    if (d.includes("GetMyProperties")) return { data: { d: { UserProfileProperties: { results: [{ Key: "Office", Value: "РЦ-8117" }, { Key: "Department", Value: "Группа отгрузки" }, { Key: "PreferredName", Value: "Поршаков Сергей" }] } } } };
    if (d.includes("getbytitle('DcEmail')")) return { data: { d: { results: [{ Id: 1, OffDepKey: "РЦ-8117Группа отгрузки", Email: { results: [{ Id: 45, Title: "Группа" }] } }] } } };
    if (d.includes("getbytitle('TaskBehaviour')")) return { data: { d: { results: [] } } };
    if (d.includes("getbytitle('TaskResultDefinitions')")) return { data: { d: { results: [] } } };
    if (d.includes("getbytitle('ProblemsPallet')/fields")) return { data: { d: { results: [{ InternalName: "Problems", Title: "Проблемы", TypeAsString: "MultiChoice" }] } } };
    if (d.includes("getbytitle('ProblemsPallet')/items(25393)")) {
      return { data: { d: { Id: 25393, Title: "Элемент 25393", THU: "808003003005005005", DC_THU: "РЦ-8117", Location1: "Зона отгрузки", Problems: { results: ["Повреждение"] }, Status: "Новая", Created: "2026-10-02T10:00:00Z", Modified: "2026-10-02T10:00:00Z", Author: { Title: "Иванов" }, Editor: { Title: "Иванов" }, Recipient: { Title: "Петров", Id: 7 }, Shipment: "", WhNotEO: "", OperationDate: "2026-10-02" } } };
    }
    if (d.includes("getbytitle('ProblemsPallet')/items")) return { data: { d: { results: [{ Id: 25393, AttachmentFiles: { results: [] } }] } } };
    if (d.includes("67291e1a-7ad5-4c65-8c2c-4a414bb3cd3d")) {
      return { data: { d: { results: [{ Id: 25393, THU: "808003003005005005", Recipient: { SCNumberText: "ТК 107" } }] } } };
    }
    if (d.includes(`${MAIN_LIST}/contenttypes`)) return { data: { d: { results: [{ Id: CT_ID, StringId: CT_ID, Name: "Поиск ЕО", FieldLinks: { results: [] } }] } } };
    if (d.includes(`${MAIN_LIST}/fields?$select=InternalName,Title,TypeAsString`)) {
      return { data: { d: { results: MAIN_FIELDS.map((n) => ({ InternalName: n, Title: n, TypeAsString: "Text" })) } } };
    }
    if (d.includes(`${MAIN_LIST}/fields?$select=InternalName`)) return { data: { d: { results: MAIN_FIELDS.map((n) => ({ InternalName: n })) } } };
    if (d.includes(`${MAIN_LIST}/fields?$filter=`)) {
      if (d.includes("'ResultSearchTHU'")) return { data: { d: { results: [{ InternalName: "ResultSearchTHU", Title: "Результат", TypeAsString: "Choice", TypeDisplayName: "Результирующий выбор", TypeShortDescription: "Результат задачи", Choices: { results: ["Найдена", "Не найдена"] }, Id: "{r}", StringId: "{r}" }] } } };
      if (d.includes("'Status'")) return { data: { d: { results: [{ InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["Не начата", "В процессе выполнения", "Завершена"] } }] } } };
      if (d.includes("TypeDisplayName")) return { data: { d: { results: [] } } };
      return { data: { d: { results: [] } } };
    }
    if (d.includes(`${MAIN_LIST}?$select=ListItemEntityTypeFullName`)) return { data: { d: { ListItemEntityTypeFullName: "SP.Data.ListItem" } } };
    if (d.includes(`${MAIN_LIST}/GetItems`)) return { data: { d: { results: [TASK_988] } } };
    if (d.includes(`${MAIN_LIST}/items(988)`)) return { data: { d: { ...TASK_988, __metadata: { type: "SP.Data.ListItem", etag: '"1"' } } } };
    if (d.includes(`${MAIN_LIST}/items(`)) {
      // Любой другой id (например 25393 как «задача») — в списке Tasks его нет.
      const err = new Error("404");
      err.response = { status: 404, data: { error: { message: { value: "Элемент не найден." } } } };
      throw err;
    }
    if (d.includes(`${MAIN_LIST}/items?`)) return { data: { d: { results: [] } } };
    if (d.includes("getuserbyid")) return { data: { d: { Id: 10, Title: "Поршаков Сергей", LoginName: "i:0#.w|retail\\sergey.porshakov" } } };
    if (d.includes("contextinfo")) return { data: { d: { GetContextWebInformation: { FormDigestValue: "x" } } } };
    return { data: { d: { results: [] } } };
  };
  return {
    get,
    post: async (url) => { state.requests.push(`POST ${String(url)}`); return { data: { d: {} } }; },
    merge: async (url) => { state.requests.push(`MERGE ${String(url)}`); return { data: { d: {} } }; },
  };
}

vi.mock("../../../api", () => ({ default: mockApi() }));
vi.mock("../../../api/sharepoint/client", () => ({ default: mockApi() }));

async function settle(ms) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

describe("аудит запросов #tasks/<Id>", () => {
  beforeEach(() => {
    state.requests.length = 0;
    window.location.hash = "#tasks/25393";
    globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  });

  it("бюджет сетевых вызовов #tasks/<Id>: без дублей, обязательный минимум на месте", async () => {
    const { default: View } = await import("../../../TasksView");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <ThemeProvider theme={createTheme()}>
          <QueryClientProvider client={qc}>
            <View userProfile={{ Office: "РЦ-8117" }} currentUserId={10} initialElementId="25393" />
          </QueryClientProvider>
        </ThemeProvider>
      );
    });
    await settle(3500);

    // Повторы данных списков недопустимы. Повторы справочников допустимы на
    // уровне вызовов: их схлопывает read-through кэш в src/sp/cache.js
    // (доказано в src/sp/__tests__/cache.interceptor.test.js) — этот харнесс
    // мокает apiClient целиком, поэтому интерцепторы здесь не участвуют.
    const counts = new Map();
    for (const r of state.requests) counts.set(r, (counts.get(r) || 0) + 1);
    const strip = (u) => u.replace(/^(GET|POST|PATCH|MERGE|DELETE) /, "");
    const dupes = [...counts.entries()]
      .filter(([u, n]) => n > 1 && !isReferenceDataRequest(strip(u)))
      .map(([u, n]) => `${n}× ${u.slice(0, 120)}`);
    expect(dupes).toEqual([]);

    // Обязательный путь: GetItems → задача → связанный элемент → карточка.
    expect(state.requests.some((u) => /GetItems/.test(u))).toBe(true);
    expect(state.requests.some((u) => /getbytitle\('ProblemsPallet'\)\/items\(25393\)/.test(u))).toBe(true);
    // Id из хэша больше не пробуется как Id задачи в списке Tasks:
    // раньше сюда всегда уходил items(25393)?$select=Id,Title,Body,… и на
    // элементной ссылке отдавал 404.
    expect(state.requests.filter((u) => /lists\(guid'[^']*'\)\/items\(25393\)/.test(u))).toEqual([]);

    // Бюджет вызовов apiClient на hash-роуте.
    expect(state.requests.length).toBeLessThanOrEqual(15);
  }, 30000);
});
