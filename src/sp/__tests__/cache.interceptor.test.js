// @vitest-environment node
// @filename: src/sp/__tests__/cache.interceptor.test.js
import { describe, expect, it, vi, beforeEach } from "vitest";
import axios from "axios";
import { installCacheInterceptor, isReferenceDataRequest, clearCache } from "../cache";

describe("installCacheInterceptor — read-through + dedup", () => {
  let hits;
  let api;

  beforeEach(() => {
    clearCache();
    hits = [];
    api = axios.create({
      adapter: (config) => {
        hits.push(config.url);
        return Promise.resolve({ data: { d: { n: hits.length } }, status: 200, statusText: "OK", headers: {}, config });
      },
    });
    installCacheInterceptor(api, { defaultTtlMs: 60_000, referenceTtlMs: 600_000 });
  });

  it("справочный GET выполняется один раз, повтор берётся из кэша", async () => {
    const url = "/web/currentuser?$select=Id,LoginName,Title";
    const a = await api.get(url);
    const b = await api.get(url);
    expect(hits).toEqual([url]);
    expect(b.data).toEqual(a.data);
  });

  it("одновременные идентичные запросы схлопываются в один (in-flight dedup)", async () => {
    const url = "/web/lists/getbytitle('TaskBehaviour')/items?$filter=Enabled eq 1";
    const [a, b, c] = await Promise.all([api.get(url), api.get(url), api.get(url)]);
    expect(hits).toEqual([url]);
    expect(b.data).toEqual(a.data);
    expect(c.data).toEqual(a.data);
  });

  it("данные списков не кэшируются — каждый запрос идёт в сеть", async () => {
    const url = "/web/lists/getbytitle('Tasks')/items?$top=100";
    await api.get(url);
    await api.get(url);
    expect(hits.length).toBe(2);
  });

  it("разные $filter дают разные ключи кэша", async () => {
    await api.get("/web/lists(guid'X')/fields?$filter=InternalName eq 'Status'");
    await api.get("/web/lists(guid'X')/fields?$filter=InternalName eq 'ResultSearchTHU'");
    expect(hits.length).toBe(2);
  });

  it("__noCache обходит кэш", async () => {
    const url = "/web/currentuser?$select=Id";
    await api.get(url);
    await api.get(url, { __noCache: true });
    expect(hits.length).toBe(2);
  });

  it("isReferenceDataRequest", () => {
    expect(isReferenceDataRequest("/web/currentuser")).toBe(true);
    expect(isReferenceDataRequest("/SP.UserProfiles.PeopleManager/GetMyProperties")).toBe(true);
    expect(isReferenceDataRequest("/web/lists(guid'X')/fields?$filter=InternalName eq 'Status'")).toBe(true);
    expect(isReferenceDataRequest("/web/lists(getbytitle('TaskBehaviour')/items?$filter=Enabled eq 1")).toBe(true);
    expect(isReferenceDataRequest("/web/lists/getbytitle('Tasks')/items?$top=100")).toBe(false);
    expect(isReferenceDataRequest("/web/lists(guid'X')/GetItems")).toBe(false);
    expect(isReferenceDataRequest("/web/lists/getbytitle('ProblemsPallet')/items(25393)?$expand=AttachmentFiles")).toBe(false);
  });
});
