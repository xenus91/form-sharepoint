// @vitest-environment jsdom
// src/features/dob/__tests__/dobApi.updateItem.test.js
//
// Сохранение задачи/заявки — MERGE в SharePoint. Регрессия: основной клиент
// (apiClient) по умолчанию шлёт Content-Type: application/json (nometadata), и
// SharePoint отвечал «An unexpected 'PrimitiveValue' node was found when reading
// from the JSON reader. A 'StartObject' node was expected.» на inline __metadata.
// Теперь MERGE всегда идёт с Content-Type: application/json;odata=verbose —
// как во всех остальных записях проекта.

import { describe, it, expect, vi, beforeEach } from "vitest";

const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";

const state = { posts: [], gets: [] };

const apiClient = {
  get: vi.fn(async (url, cfg) => {
    state.gets.push({ url, cfg });
    return { data: { d: { ListItemEntityTypeFullName: "SP.Data.TasksListItem" } } };
  }),
  post: vi.fn(async (url, body, cfg) => {
    state.posts.push({ url, body, cfg });
    return { data: { d: { Id: 712 } } };
  }),
};

vi.mock("../../../api", () => ({ default: apiClient }));
vi.mock("../api/dobClient", () => ({
  DOB_LIST_GUID: "21B5B544-BD98-4B06-891F-C5A137331394",
  dobApiBase: () => "/dob-api/sites/dob/doblogistic/_api",
  dobListApi: (guid) => `/dob-api/sites/dob/doblogistic/_api/web/lists(guid'${guid}')`,
  dobAxios: axiosStub(),
}));

function axiosStub() {
  return {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  };
}

const { updateDobItem } = await import("../api/dobApi");

describe("dobApi.updateDobItem — MERGE задачи в основной список", () => {
  beforeEach(() => {
    state.posts.length = 0;
    state.gets.length = 0;
  });

  it("шлёт verbose Content-Type (иначе SP отвечает PrimitiveValue/StartObject), MERGE и IF-MATCH", async () => {
    await updateDobItem(712, { Status: "Завершена", PercentComplete: 1, DobSearchResult: "Годен" }, MAIN_GUID);
    const post = state.posts[0];
    expect(post.url).toContain(`/items(712)`);
    expect(post.cfg.headers["X-HTTP-Method"]).toBe("MERGE");
    expect(post.cfg.headers["IF-MATCH"]).toBe("*");
    expect(post.cfg.headers["Content-Type"]).toBe("application/json;odata=verbose");
    expect(post.cfg.headers.Accept).toBe("application/json;odata=verbose");
    // Тип элемента обязателен в verbose-теле, иначе «запись без имени типа»
    expect(post.body.__metadata).toEqual({ type: "SP.Data.TasksListItem" });
    expect(post.body.DobSearchResult).toBe("Годен");
  });

  it("люди уходят как <Field>Id: один — число, несколько — Collection(Edm.Int32)", async () => {
    await updateDobItem(
      712,
      {
        GuiltyId: { __metadata: { type: "Collection(Edm.Int32)" }, results: [5, 7] },
        CheckedById: 9,
      },
      MAIN_GUID,
    );
    const body = state.posts[0].body;
    expect(body.GuiltyId.__metadata.type).toBe("Collection(Edm.Int32)");
    expect(body.GuiltyId.results).toEqual([5, 7]);
    expect(body.CheckedById).toBe(9);
  });

  it("список ДОБ идёт через dob-клиент и тоже с verbose", async () => {
    const dob = await import("../api/dobClient");
    await updateDobItem(5, { Title: "Заявка" }, "21B5B544-BD98-4B06-891F-C5A137331394");
    const post = dob.dobAxios.post.mock.calls[0];
    expect(String(post[0])).toContain("doblogistic");
    expect(post[2].headers["Content-Type"]).toBe("application/json;odata=verbose");
    expect(post[2].headers["X-HTTP-Method"]).toBe("MERGE");
  });
});
