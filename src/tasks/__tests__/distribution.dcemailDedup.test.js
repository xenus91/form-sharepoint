// @vitest-environment jsdom
// @filename: src/tasks/__tests__/distribution.dcemailDedup.test.js
// DcEmail резолвят два независимых места, оба стартуют из одного тика после
// получения текущего пользователя:
//   • App.jsx:1756  resolveDistributionViaDcEmailApp
//   • tasks/distribution.js:105 через useDistribution.js:13
// Пока $select у них различался (Email/Id против Email/Id,Email/Title), ключи
// кэша расходились и уходило два запроса. Теперь URL идентичны — проверяем,
// что одновременные вызовы схлопываются в один сетевой запрос.
import { describe, it, expect, beforeEach } from "vitest";
import apiClient from "../../api";
import { clearCache } from "../../sp/cache";
import { resolveDistributionViaDcEmail } from "../distribution";

describe("DcEmail: два резолвера → один сетевой запрос", () => {
  let hits;

  beforeEach(() => {
    clearCache();
    hits = [];
    apiClient.defaults.adapter = (config) => {
      hits.push(config.url);
      return Promise.resolve({
        data: {
          d: {
            results: [
              { Id: 1, OffDepKey: "РЦ-8117Группа отгрузки", Email: { Id: 7, Title: "ship@lenta.com" } },
            ],
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    };
  });

  it("одновременные вызовы (App + useDistribution) дают один запрос", async () => {
    const [a, b] = await Promise.all([
      resolveDistributionViaDcEmail("РЦ-8117", "Группа отгрузки"),
      resolveDistributionViaDcEmail("РЦ-8117", "Группа отгрузки"),
    ]);
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain("$select=Id,OffDepKey,Email/Id,Email/Title");
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it("повторный вызов позже тоже не идёт в сеть (кэш справочника)", async () => {
    await resolveDistributionViaDcEmail("РЦ-8117", "Группа отгрузки");
    await resolveDistributionViaDcEmail("РЦ-8117", "Группа отгрузки");
    expect(hits.length).toBe(1);
  });
});
