// src/features/dob/lib/__tests__/dobUserSearch.url.test.js
//
// Проверка «по-настоящему»: настоящие `searchSiteUsers`/`getUserPositions`
// (без моков) + настоящий `dobApiBase`, подменён только сетевой вызов.
// Так видно РЕАЛЬНЫЙ URL, который уйдёт в SharePoint.
import { describe, it, expect, vi, afterEach } from "vitest";
import apiClient from "../../../../api";
import { dobAxios } from "../../api/dobClient";
import { searchDobUsers, dobUserPositions } from "../dobUserSearch";

const ok = { data: { d: { results: [] } } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("куда физически уходит поиск людей для заявки ДОБ", () => {
  it("поиск — в /sites/dob/doblogistic, основной клиент не трогается", async () => {
    const dobSpy = vi.spyOn(dobAxios, "get").mockResolvedValue(ok);
    const mainSpy = vi.spyOn(apiClient, "get").mockResolvedValue(ok);

    await searchDobUsers("иванов");

    const url = String(dobSpy.mock.calls[0][0]);
    expect(url.startsWith("/dob-api/sites/dob/doblogistic/_api/web/siteusers?")).toBe(true);
    expect(mainSpy).not.toHaveBeenCalled();
  });

  it("сведения о человеке (должность/департамент/офис) — тоже в /sites/dob/doblogistic", async () => {
    const dobSpy = vi.spyOn(dobAxios, "get").mockResolvedValue(ok);
    const mainSpy = vi.spyOn(apiClient, "get").mockResolvedValue(ok);

    await dobUserPositions([{ Id: 5, LoginName: "i|ivanov" }]);

    // getUserPositions ходит относительными путями — база сайта ДОБ
    // достраивается в dobGet (у dobAxios нет baseURL)
    const urls = dobSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u.startsWith("/dob-api/sites/dob/doblogistic/_api/")).toBe(true);
    }
    expect(mainSpy).not.toHaveBeenCalled();
  });
});
