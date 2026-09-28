import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTaskBehaviour, resolveTaskBehaviourByName, resolveTaskBehaviour, findContentTypeMeta, clearTaskBehaviourCache } from "../taskBehaviour";

function makeApiClient(handler) {
  return { get: vi.fn().mockImplementation((url, opts = {}) => handler(url, opts)) };
}

describe("taskBehaviour", () => {
  beforeEach(() => {
    clearTaskBehaviourCache();
    if (typeof globalThis.sessionStorage === "undefined") {
      const mem = new Map();
      globalThis.sessionStorage = {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: (k) => mem.delete(k),
        clear: () => mem.clear(),
      };
    } else {
      globalThis.sessionStorage.clear();
    }
  });

  describe("fetchTaskBehaviour", () => {
    it("fetches items and returns Map<configId, record>", async () => {
      const api = makeApiClient((url) => {
        if (url.includes("$select=Id,Modified,Enabled")) {
          return Promise.resolve({ data: { d: { results: [
            { Id: 1, Modified: "2026-09-28T01:24:59Z", Enabled: true },
            { Id: 2, Modified: "2026-09-28T02:00:00Z", Enabled: true },
          ] } } });
        }
        return Promise.resolve({ data: { d: { results: [
          { Id: 1, Title: "Config A", Behaviour: '{"X":{"c":true}}', StylingResultButton: '{"X":{"bg":"#f00"}}', Enabled: true, Modified: "2026-09-28T01:24:59Z" },
          { Id: 2, Title: "Config B", Behaviour: '{"Y":{}}', StylingResultButton: '{"Y":{"bg":"#0f0"}}', Enabled: false, Modified: "2026-09-28T02:00:00Z" },
        ] } } });
      });
      const m = await fetchTaskBehaviour(api, { forceRefresh: true });
      expect(m).toBeInstanceOf(Map);
      expect(m.size).toBe(2);
      expect(m.get(1).title).toBe("Config A");
      expect(m.get(1).behaviour).toContain("c\":true");
      expect(m.get(2).enabled).toBe(false);
    });

    it("returns null on 404 (list not in SP)", async () => {
      const api = makeApiClient(() => Promise.reject({ response: { status: 404, data: { error: { message: { value: "Not Found" } } } } }));
      const m = await fetchTaskBehaviour(api, { forceRefresh: true });
      expect(m).toBeNull();
    });

    it("returns empty Map on non-404 error (graceful fallback)", async () => {
      const api = makeApiClient(() => Promise.reject({ response: { status: 500, data: { error: { message: { value: "Server Error" } } } } }));
      const m = await fetchTaskBehaviour(api, { forceRefresh: true });
      expect(m).toBeInstanceOf(Map);
      expect(m.size).toBe(0);
    });

    it("saves to sessionStorage and loads from it on subsequent call", async () => {
      const api = makeApiClient((url) => {
        if (url.includes("$select=Id,Modified,Enabled")) {
          return Promise.resolve({ data: { d: { results: [
            { Id: 1, Modified: "2026-09-28T01:24:59Z", Enabled: true },
          ] } } });
        }
        return Promise.resolve({ data: { d: { results: [
          { Id: 1, Title: "X", Behaviour: '{"A":{"p":[{"f":"F"}]}}', StylingResultButton: '{}', Enabled: true, Modified: "2026-09-28T01:24:59Z" },
        ] } } });
      });
      await fetchTaskBehaviour(api, { forceRefresh: true });
      const api2 = makeApiClient(() => Promise.reject(new Error("Should not be called")));
      const m = await fetchTaskBehaviour(api2);
      expect(m).toBeInstanceOf(Map);
      expect(m.get(1).title).toBe("X");
    });
  });

  describe("resolveTaskBehaviourByName (NEW: маппинг CT.Name → Title)", () => {
    function makeMap() {
      return new Map([
        [1, { id: 1, title: "Исправление проблемной ЕО", behaviour: '{"Исправлено":{"p":[{"f":"CommentResult"}]}}', styling: '{"Исправлено":{"bg":"#f00"}}', enabled: true, modified: "" }],
        [2, { id: 2, title: "Завершение поиска", behaviour: '{"A":{}}', styling: '{}', enabled: false, modified: "" }],
        [3, { id: 3, title: "  Поиск ЕО  ", behaviour: '{"B":{}}', styling: '{}', enabled: true, modified: "" }],
      ]);
    }

    it("находит exact match (case-insensitive, normalized)", () => {
      const r = resolveTaskBehaviourByName("исправление проблемной ео", makeMap());
      expect(r).not.toBeNull();
      expect(r.configId).toBe(1);
      expect(r.matchedBy).toBe("name");
      expect(r.behaviour.ok).toBe(true);
    });

    it("находит exact match с разным регистром", () => {
      const r = resolveTaskBehaviourByName("Исправление Проблемной ЕО", makeMap());
      expect(r?.configId).toBe(1);
    });

    it("trim в Title и в ctName — всё равно матчит", () => {
      const r = resolveTaskBehaviourByName("  Исправление проблемной ЕО  ", makeMap());
      expect(r?.configId).toBe(1);
    });

    it("trim в Title (id=3) — нормализация работает", () => {
      const r = resolveTaskBehaviourByName("Поиск ЕО", makeMap());
      expect(r?.configId).toBe(3);
    });

    it("returns null для отсутствующего CT.Name", () => {
      const r = resolveTaskBehaviourByName("Несуществующий CT", makeMap());
      expect(r).toBeNull();
    });

    it("returns null для disabled записи", () => {
      const r = resolveTaskBehaviourByName("Завершение поиска", makeMap());
      expect(r).toBeNull();
    });

    it("returns null для пустой строки / null", () => {
      expect(resolveTaskBehaviourByName("", makeMap())).toBeNull();
      expect(resolveTaskBehaviourByName(null, makeMap())).toBeNull();
      expect(resolveTaskBehaviourByName("X", null)).toBeNull();
    });

    it("graceful: битый JSON в Behaviour → behaviour.ok=false, продолжает работу", () => {
      const m = new Map([[1, { id: 1, title: "X", behaviour: "not json {", styling: '{}', enabled: true, modified: "" }]]);
      const r = resolveTaskBehaviourByName("X", m);
      expect(r).not.toBeNull();
      expect(r.behaviour.ok).toBe(false);
      expect(r.behaviour.error).toContain("invalid JSON");
      expect(r.styling.ok).toBe(true);
    });

    it("возвращает matchedBy: 'name'", () => {
      const r = resolveTaskBehaviourByName("Исправление проблемной ЕО", makeMap());
      expect(r.matchedBy).toBe("name");
    });

    it("выбирает первую enabled запись при множественных матчах (теоретически)", () => {
      const m = new Map([
        [1, { id: 1, title: "Dup", behaviour: '{}', styling: '{}', enabled: false, modified: "" }],
        [2, { id: 2, title: "Dup", behaviour: '{"A":{}}', styling: '{}', enabled: true, modified: "" }],
      ]);
      const r = resolveTaskBehaviourByName("Dup", m);
      expect(r?.configId).toBe(2);
    });
  });

  describe("resolveTaskBehaviour (DEPRECATED — lookup-поле на CT)", () => {
    it("всегда возвращает null", () => {
      const m = new Map([[1, { id: 1, title: "X", behaviour: '{}', styling: '{}', enabled: true, modified: "" }]]);
      expect(resolveTaskBehaviour({ BehaviourConfigId: 1 }, m)).toBeNull();
      expect(resolveTaskBehaviour({ BehaviourConfig: { Id: 1 } }, m)).toBeNull();
      expect(resolveTaskBehaviour({}, null)).toBeNull();
    });
  });

  describe("findContentTypeMeta", () => {
    it("returns exact match (lowercase)", () => {
      const m = new Map([["0x010800abc", { name: "Исправление", stringId: "0x010800abc" }]]);
      expect(findContentTypeMeta("0x010800abc", m)).toEqual({ name: "Исправление", stringId: "0x010800abc" });
    });

    it("falls back to longest prefix match", () => {
      const m = new Map([
        ["0x01", { name: "Base", stringId: "0x01" }],
        ["0x0108", { name: "Mid", stringId: "0x0108" }],
        ["0x010800abc", { name: "Exact", stringId: "0x010800abc" }],
      ]);
      expect(findContentTypeMeta("0x010800abcdef", m)).toEqual({ name: "Exact", stringId: "0x010800abc" });
    });

    it("returns null for empty map / null ctId", () => {
      expect(findContentTypeMeta("0x01", new Map())).toBeNull();
      expect(findContentTypeMeta("0x01", null)).toBeNull();
      expect(findContentTypeMeta(null, new Map())).toBeNull();
    });
  });
});