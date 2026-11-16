// @vitest-environment jsdom
// src/tasks/__tests__/relatedAttachments.test.js
//
// Скрепка на карточке: определение вложений у СВЯЗАННОГО элемента
// (RelatedItems → ProblemsPallet) и открытие его через ?ID=<Id>.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getMock = vi.hoisted(() => vi.fn());

vi.mock("../../api", () => ({
  default: {
    get: (...args) => getMock(...args),
    post: vi.fn(),
    defaults: { headers: {} },
  },
  invalidate: vi.fn(),
}));

const {
  relatedItemIdOf,
  fetchRelatedAttachmentCounts,
  openRelatedItem,
} = await import("../relatedAttachments");

const related = (itemId) => JSON.stringify([{ ListId: "{11111111-2222-3333-4444-555555555555}", ItemId: itemId }]);

describe("relatedItemIdOf", () => {
  it("достаёт Id связанного элемента из RelatedItems-строки", () => {
    expect(relatedItemIdOf({ RelatedItems: related(25202) })).toBe(25202);
  });

  it("работает и с уже разобранным массивом, и с raw", () => {
    expect(relatedItemIdOf({ RelatedItems: [{ ListId: "{x}", ItemId: 7 }] })).toBe(7);
    expect(relatedItemIdOf({ raw: { RelatedItems: related(9) } })).toBe(9);
  });

  it("без RelatedItems — null (скрепки не будет)", () => {
    expect(relatedItemIdOf({ Id: 1 })).toBeNull();
    expect(relatedItemIdOf({ RelatedItems: "не json" })).toBeNull();
    expect(relatedItemIdOf(null)).toBeNull();
  });
});

describe("fetchRelatedAttachmentCounts", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("все Id страницы уходят ОДНИМ запросом с $expand=AttachmentFiles", async () => {
    getMock.mockResolvedValue({ data: { d: { results: [] } } });
    await fetchRelatedAttachmentCounts([1, 2, 3, 4, 5]);

    expect(getMock).toHaveBeenCalledTimes(1);
    const url = getMock.mock.calls[0][0];
    expect(url).toContain("getbytitle('ProblemsPallet')/items?");
    expect(url).toContain("$expand=AttachmentFiles");
    expect(url).toContain("Id eq 1 or Id eq 2 or Id eq 3 or Id eq 4 or Id eq 5");
  });

  it("считает вложения по каждому Id", async () => {
    getMock.mockResolvedValue({
      data: {
        d: {
          results: [
            { Id: 25202, AttachmentFiles: { results: [{ FileName: "1.jpg" }, { FileName: "2.jpg" }] } },
            { Id: 25203, AttachmentFiles: { results: [] } },
          ],
        },
      },
    });
    const counts = await fetchRelatedAttachmentCounts([25202, 25203]);
    expect(counts.get(25202)).toBe(2);
    expect(counts.get(25203)).toBe(0);
  });

  it("дубликаты Id схлопываются", async () => {
    getMock.mockResolvedValue({ data: { d: { results: [] } } });
    await fetchRelatedAttachmentCounts([5, 5, 5]);
    expect(getMock.mock.calls[0][0].match(/Id eq 5/g).length).toBe(1);
  });

  it("пустой список — запроса нет", async () => {
    const counts = await fetchRelatedAttachmentCounts([]);
    expect(getMock).not.toHaveBeenCalled();
    expect(counts.size).toBe(0);
  });

  it("ошибка SharePoint не роняет карточки — просто нет счётчиков", async () => {
    getMock.mockRejectedValue(new Error("403"));
    const counts = await fetchRelatedAttachmentCounts([1, 2]);
    expect(counts.size).toBe(0);
  });

  it("много Id режутся на пачки (URL не распухает)", async () => {
    getMock.mockResolvedValue({ data: { d: { results: [] } } });
    await fetchRelatedAttachmentCounts(Array.from({ length: 90 }, (_, i) => i + 1));
    // 90 Id при пачке 40 → 3 запроса
    expect(getMock).toHaveBeenCalledTimes(3);
  });
});

describe("openRelatedItem", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/sites/x/SitePages/app.aspx#tasks");
  });

  it("ставит ?ID=<Id связанного элемента>, hash сохраняет", () => {
    expect(openRelatedItem(25202)).toBe(true);
    expect(window.location.search).toBe("?ID=25202");
    expect(window.location.hash).toBe("#tasks");
  });

  it("прежние query-параметры не теряются", () => {
    window.history.replaceState(null, "", "/sites/x/SitePages/app.aspx?dbg=1#tasks");
    openRelatedItem(77);
    const usp = new URLSearchParams(window.location.search);
    expect(usp.get("ID")).toBe("77");
    expect(usp.get("dbg")).toBe("1");
  });

  it("на некорректном Id ничего не меняет", () => {
    expect(openRelatedItem(0)).toBe(false);
    expect(openRelatedItem("abc")).toBe(false);
    expect(window.location.search).toBe("");
  });

  it("шлёт popstate, чтобы приложение подхватило новый адрес", () => {
    const seen = [];
    const handler = () => seen.push(1);
    window.addEventListener("popstate", handler);
    openRelatedItem(5);
    window.removeEventListener("popstate", handler);
    expect(seen.length).toBe(1);
  });
});
