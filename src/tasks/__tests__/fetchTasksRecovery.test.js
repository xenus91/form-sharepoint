// src/tasks/__tests__/fetchTasksRecovery.test.js
// Регрессия: сайт-источник (dob) не содержит ResultSearchTHU → SharePoint 400
// «Столбец 'ResultSearchTHU' не существует» → раньше источник падал целиком и в
// таблице #tasks не было ни одной задачи. Теперь поле исключается и запрос
// повторяется.

import { describe, it, expect, vi } from "vitest";
import { fetchTasksForSource } from "../fetchTasks";
import { extractMissingField, isMissingFieldError, extractSpErrorMessage } from "../spError";

const DOB_ITEM = {
  __metadata: { id: "x", type: "SP.Data.RequestsTaskListItem" },
  Id: 1,
  Title: "Заявка ООБ",
  Body: "Просмотр видеоархива",
  Status: "Не начата",
  PercentComplete: 0,
  DueDate: null,
  Created: "2026-10-03T00:29:41Z",
  Modified: "2026-10-03T00:29:42Z",
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F0064B41D430E2B5D4AB18CF8F3FE9605CF",
  AssignedTo: { Id: 207, Title: "Поршаков Сергей" },
  Editor: { Id: 207, Title: "Поршаков Сергей" },
  RelatedItems: JSON.stringify([{ ItemId: 2, WebId: "4d397a16-e572-4dd6-9d81-9b6e83c4ab30", ListId: "21b5b544-bd98-4b06-891f-c5a137331394" }]),
};

const MISSING_FIELD_ERROR = {
  response: {
    status: 400,
    data: { error: { message: { value: "Столбец 'ResultSearchTHU' не существует. Возможно, он был удалён другим пользователем." } } },
  },
};

function missingFieldError(name) {
  return {
    response: {
      status: 400,
      data: { error: { message: { value: `Столбец '${name}' не существует. Возможно, он был удалён другим пользователем.` } } },
    },
  };
}

function makeClient({ failOn = [], listApi = "/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')" } = {}) {
  const calls = [];
  return {
    calls,
    apiBase: "/dob-api/sites/dob/doblogistic/_api",
    toRequestUrl: (url) => `/dob-api/sites/dob/doblogistic/_api${url}`,
    listApi: async () => listApi,
    get: vi.fn(async (url) => {
      calls.push(url);
      for (const bad of failOn) {
        // SharePoint называет в ошибке именно то поле, которого нет в списке
        if (url.includes(bad)) throw missingFieldError(bad);
      }
      return { data: { d: { results: [DOB_ITEM] } } };
    }),
  };
}

describe("spError", () => {
  it("распознаёт имя отсутствующего поля (RU)", () => {
    const msg = "Столбец 'ResultSearchTHU' не существует. Возможно, он был удалён другим пользователем.";
    expect(isMissingFieldError(msg)).toBe(true);
    expect(extractMissingField(msg)).toBe("ResultSearchTHU");
  });

  it("распознаёт имя отсутствующего поля (EN)", () => {
    const msg = "The property 'Location1' does not exist on type 'SP.Data.ListListItem'.";
    expect(extractMissingField(msg)).toBe("Location1");
  });

  it("достаёт текст ошибки из axios-объекта", () => {
    expect(extractSpErrorMessage(MISSING_FIELD_ERROR)).toContain("ResultSearchTHU");
  });
});

describe("fetchTasksForSource — авто-восстановление по отсутствующему полю", () => {
  it("внешний источник без загруженных полей: безопасный select, запрос не падает", async () => {
    const client = makeClient({ failOn: ["ResultSearchTHU", "Location1"] });
    const rows = await fetchTasksForSource(
      { id: "dob", clientKind: "dob", label: "DOB Logistic" },
      client,
      {
        currentUserId: 207,
        assignedIds: [207],
        taskFieldNames: [], // /fields не ответил — поля списка неизвестны
        selectProfile: "external",
        excludeCompleted: true,
      }
    );
    // Профиль external не запрашивает main-only поля вовсе → один запрос
    expect(client.get).toHaveBeenCalledTimes(1);
    const sel = decodeURIComponent(client.calls[0]);
    expect(sel).not.toContain("ResultSearchTHU");
    expect(sel).not.toContain("Location1");
    expect(rows).toHaveLength(1);
    expect(rows[0].Title).toBe("Заявка ООБ");
    expect(rows[0].AssignedToId).toBe(207);
  });

  it("основной профиль: SharePoint 400 на ResultSearchTHU/Location1 — исключает оба и повторяет", async () => {
    const client = makeClient({ failOn: ["ResultSearchTHU", "Location1"] });
    const rows = await fetchTasksForSource(
      { id: "dob", clientKind: "dob" },
      client,
      {
        currentUserId: 207,
        assignedIds: [207],
        taskFieldNames: [],
        selectProfile: "main",
        excludeCompleted: true,
      }
    );
    expect(client.calls[0]).toContain("ResultSearchTHU");
    expect(client.calls[0]).toContain("Location1");
    const last = decodeURIComponent(client.calls[client.calls.length - 1]);
    expect(last).not.toContain("ResultSearchTHU");
    expect(last).not.toContain("Location1");
    // $filter остаётся в правильной форме AssignedToId (без пинг-понга с AssignedTo/Id)
    expect(last).toContain("$filter=AssignedToId eq 207");
    expect(rows).toHaveLength(1);
  });

  it("поле из известного набора полей (Body) тоже восстанавливается", async () => {
    const client = makeClient({ failOn: ["Body"] });
    const rows = await fetchTasksForSource(
      { id: "dob", clientKind: "dob" },
      client,
      {
        currentUserId: 207,
        assignedIds: [207],
        taskFieldNames: ["Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified", "PercentComplete", "DueDate", "Editor", "ContentTypeId", "RelatedItems"],
        selectProfile: "external",
        excludeCompleted: true,
      }
    );
    expect(client.get).toHaveBeenCalledTimes(2);
    const last = decodeURIComponent(client.calls[1]);
    expect(last).not.toContain(",Body,");
    expect(last).not.toContain("=Body");
    expect(rows).toHaveLength(1);
  });

  it("URL собирается с префиксом прокси (/dob-api) и содержит фильтр по пользователю/группе", async () => {
    const client = makeClient();
    await fetchTasksForSource(
      { id: "dob", clientKind: "dob" },
      client,
      { currentUserId: 207, assignedIds: [207, 33], taskFieldNames: [], selectProfile: "external", excludeCompleted: true }
    );
    const url = client.calls[0];
    expect(url.startsWith("/dob-api/sites/dob/doblogistic/_api/web/lists(guid'")).toBe(true);
    expect(decodeURIComponent(url)).toContain("AssignedToId eq 207 or AssignedToId eq 33");
  });
});
