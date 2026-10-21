// @vitest-environment node
// @filename: src/tasks/__tests__/problemsPallet.dedup.test.js
// fetchProblemsPalletItem: данные списков глобальным кэшем не кэшируются,
// поэтому дедуп живёт в самом модуле. Без него элемент ProblemsPallet
// запрашивался дважды за одно открытие #tasks/<Id> — эффект useHashElement
// перезапускается, когда поздно приходит distribution.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ calls: [], item: { Id: 1, Title: "Элемент" } }));

vi.mock("../../api", () => ({
  default: {
    get: (url) => {
      state.calls.push(url);
      return Promise.resolve({ data: { d: { ...state.item, Id: Number(url.match(/items\((\d+)\)/)?.[1] || 0) } } });
    },
  },
}));

import { fetchProblemsPalletItem } from "../problemsPallet";

describe("fetchProblemsPalletItem — дедупликация", () => {
  beforeEach(() => { state.calls = []; });

  it("два одновременных запроса одного элемента → один сетевой вызов", async () => {
    const [a, b] = await Promise.all([
      fetchProblemsPalletItem(25393),
      fetchProblemsPalletItem(25393),
    ]);
    expect(state.calls.length).toBe(1);
    expect(a).toEqual(b);
    expect(a.Id).toBe(25393);
  });

  it("повтор в пределах TTL берётся из локального кэша", async () => {
    await fetchProblemsPalletItem(25401);
    await fetchProblemsPalletItem(25401);
    expect(state.calls.length).toBe(1);
  });

  it("разные элементы → отдельные запросы", async () => {
    await fetchProblemsPalletItem(25402);
    await fetchProblemsPalletItem(25403);
    expect(state.calls.length).toBe(2);
  });
});
