// src/features/tasks/lib/__tests__/groupSearch.test.js
// Поиск ГРУПП (только группы) для выбора рассылки при создании заявки.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../api", () => ({ default: { get: vi.fn() } }));

import apiClient from "../../../../api";
import { searchSiteGroups, matchesGroup, clearGroupSearchCache } from "../groupSearch";

const verbose = (results) => ({ data: { d: { results } } });

beforeEach(() => {
  vi.clearAllMocks();
  clearGroupSearchCache();
});

describe("searchSiteGroups", () => {
  it("ищет по sitegroups (а не siteusers) и возвращает только группы", async () => {
    apiClient.get.mockResolvedValue(verbose([
      { Id: 33, Title: "ООБ", LoginName: "ООБ", Description: "" },
      { Id: 44, Title: "Группа отгрузки", LoginName: "c:0-.f|rolemanager|grp", Description: "" },
    ]));
    const found = await searchSiteGroups("ООБ");
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    const url = apiClient.get.mock.calls[0][0];
    expect(url).toContain("/web/sitegroups");
    expect(url).not.toContain("siteusers");
    expect(found.map((g) => g.Id)).toEqual([33, 44]);
    expect(found[0]).toMatchObject({ Title: "ООБ" });
  });

  it("при ошибке серверного фильтра — фолбэк на страницу групп и локальный поиск", async () => {
    apiClient.get
      .mockRejectedValueOnce({ response: { status: 400 } })
      .mockResolvedValueOnce(verbose([
        { Id: 1, Title: "Отгрузка РЦ", LoginName: "x" },
        { Id: 2, Title: "Приёмка", LoginName: "y" },
      ]));
    const found = await searchSiteGroups("отгрузка");
    expect(found.map((g) => g.Id)).toEqual([1]);
    expect(found[0].Title).toBe("Отгрузка РЦ");
  });

  it("пустой запрос — без запросов", async () => {
    expect(await searchSiteGroups("  ")).toEqual([]);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("matchesGroup: по Title и LoginName, регистронезависимо", () => {
    const g = { Title: "ООБ Группа", LoginName: "c:0-.f|rolemanager|oob" };
    expect(matchesGroup(g, "ооб")).toBe(true);
    expect(matchesGroup(g, "rolemanager")).toBe(true);
    expect(matchesGroup(g, "нет")).toBe(false);
  });
});
