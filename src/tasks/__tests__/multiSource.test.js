// src/tasks/__tests__/multiSource.test.js
// vitest тесты для multiSource.js (см. план, этап 5).

import { describe, it, expect } from "vitest";
import { compositeId, parseCompositeId, mergeSort } from "../multiSource";

describe("multiSource.compositeId / parseCompositeId", () => {
  it("compositeId формирует строку", () => {
    expect(compositeId("main", 1)).toBe("main:1");
    expect(compositeId("dob", 42)).toBe("dob:42");
  });

  it("parseCompositeId обратен compositeId", () => {
    expect(parseCompositeId("main:1")).toEqual({ sourceId: "main", id: 1 });
    expect(parseCompositeId("dob:42")).toEqual({ sourceId: "dob", id: 42 });
  });

  it("parseCompositeId возвращает null для мусора", () => {
    expect(parseCompositeId("nocolon")).toBeNull();
    expect(parseCompositeId(":1")).toBeNull();
    expect(parseCompositeId("main:abc")).toBeNull();
    expect(parseCompositeId(null)).toBeNull();
  });

  it("пересекающиеся Id в источниках не склеиваются", () => {
    const a = compositeId("main", 1);
    const b = compositeId("dob", 1);
    expect(a).not.toBe(b);
    expect(parseCompositeId(a).sourceId).toBe("main");
    expect(parseCompositeId(b).sourceId).toBe("dob");
  });
});

describe("multiSource.mergeSort", () => {
  const sample = [
    { compositeId: "main:3", raw: { Modified: "2026-10-03T10:00:00Z" } },
    { compositeId: "main:1", raw: { Modified: "2026-10-05T10:00:00Z" } },
    { compositeId: "dob:2", raw: { Modified: "2026-10-04T10:00:00Z" } },
    { compositeId: "main:2", raw: {} }, // нет даты — должен уехать в конец
  ];

  it("по умолчанию — от самых старых к самым новым (Created asc)", () => {
    const sorted = mergeSort([
      { compositeId: "main:3", Created: "2026-10-03T10:00:00Z" },
      { compositeId: "main:1", Created: "2026-10-05T10:00:00Z" },
      { compositeId: "dob:2", Created: "2026-10-04T10:00:00Z" },
    ]);
    expect(sorted.map((t) => t.compositeId)).toEqual(["main:3", "dob:2", "main:1"]);
  });

  it("нет Created — фолбэк на Modified (а не в конец списка)", () => {
    const sorted = mergeSort(sample);
    expect(sorted.map((t) => t.compositeId)).toEqual(["main:3", "dob:2", "main:1", "main:2"]);
  });

  it("строки без даты — в конце и при asc, и при desc", () => {
    const asc = mergeSort(sample, "Created", "asc").map((t) => t.compositeId);
    const desc = mergeSort(sample, "Created", "desc").map((t) => t.compositeId);
    expect(asc[asc.length - 1]).toBe("main:2");
    expect(desc[desc.length - 1]).toBe("main:2");
    expect(desc.slice(0, 3)).toEqual(["main:1", "dob:2", "main:3"]);
  });

  it("при равных датах — по числовому Id (в SharePoint он растёт со временем)", () => {
    const eq = [
      { compositeId: "dob:2", Id: 12, Created: "2026-10-03T10:00:00Z" },
      { compositeId: "main:9", Id: 9, Created: "2026-10-03T10:00:00Z" },
    ];
    expect(mergeSort(eq).map((t) => t.compositeId)).toEqual(["main:9", "dob:2"]);
  });

  it("стабильный tiebreak по compositeId, если Id нет или равен", () => {
    const eq = [
      { compositeId: "main:2", raw: { Created: "2026-10-03T10:00:00Z" } },
      { compositeId: "main:1", raw: { Created: "2026-10-03T10:00:00Z" } },
    ];
    expect(mergeSort(eq).map((t) => t.compositeId)).toEqual(["main:1", "main:2"]);
  });
});
