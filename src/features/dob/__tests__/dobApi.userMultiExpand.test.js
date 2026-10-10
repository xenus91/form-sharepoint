// @vitest-environment jsdom
// src/features/dob/__tests__/dobApi.userMultiExpand.test.js
//
// Многозначное «Пользователь или группа» (TypeAsString = "UserMulti") должно
// попадать в $expand, как и одиночное "User".
//
// Регрессия: фильтр колонок для $expand проверял только 'user'. Многократная
// колонка («Виновные») в $expand НЕ попадала, поэтому SharePoint не возвращал
// поле — в форме выполненной заявки вместо виновных была пустота.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { gets: [] };

// Как в SharePoint: одиночный человек — "User", многократный — "UserMulti".
const LIST_FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  { InternalName: "Guilty", Title: "Виновные", TypeAsString: "UserMulti", AllowMultipleValues: true, Hidden: false },
  { InternalName: "UserFail", Title: "Кто ошибся", TypeAsString: "User", Hidden: false },
  { InternalName: "Author", Title: "Кем создано", TypeAsString: "User", Hidden: false },
];

const dobAxios = {
  get: vi.fn(async (url) => {
    state.gets.push(String(url));
    const u = String(url);
    if (u.includes("/fields")) return { data: { d: { results: LIST_FIELDS } } };
    if (u.includes("/items(")) return { data: { d: { Id: 906, Title: "Заявка ООБ" } } };
    return { data: { d: { results: [] } } };
  }),
  post: vi.fn(async () => ({ data: { d: {} }, status: 204 })),
};

vi.mock("../api/dobClient", () => ({
  DOB_LIST_GUID: "21B5B544-BD98-4B06-891F-C5A137331394",
  dobApiBase: () => "/dob-api/sites/dob/doblogistic/_api",
  dobListApi: (guid) => `/dob-api/sites/dob/doblogistic/_api/web/lists(guid'${guid}')`,
  dobAxios,
  getDobDigest: async () => "digest",
}));

const { getDobItem } = await import("../api/dobApi");

describe("dobApi.getDobItem — $expand для колонок людей", () => {
  beforeEach(() => { state.gets.length = 0; });

  it("многозначное поле людей (UserMulti) раскрывается, как и одиночное", async () => {
    await getDobItem(906);
    const url = state.gets.find((u) => u.includes("/items(906)")) || "";
    expect(url).toBeTruthy();
    const expand = decodeURIComponent(url).match(/\$expand=([^&]*)/)?.[1] || "";
    expect(expand).toContain("Guilty"); // ← без этого «Виновные» приходят пустыми
    expect(expand).toContain("UserFail"); // одиночное тоже на месте
  });

  it("в $select есть Title/Id для раскрытых колонок людей", async () => {
    await getDobItem(906);
    const url = decodeURIComponent(state.gets.find((u) => u.includes("/items(906)")));
    const select = url.match(/\$select=([^&]*)/)?.[1] || "";
    expect(select).toContain("Guilty/Title");
    expect(select).toContain("Guilty/Id");
  });

  it("Author/Editor раскрываются как служебные, а не как поля формы", async () => {
    await getDobItem(906);
    const url = decodeURIComponent(state.gets.find((u) => u.includes("/items(906)")));
    const expand = url.match(/\$expand=([^&]*)/)?.[1] || "";
    // Author не дублируется в списке expands
    expect(expand.split(",").filter((x) => x === "Author").length).toBe(1);
  });
});
