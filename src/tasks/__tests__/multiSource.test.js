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
    { compositeId: "main:2", raw: {} }, // нет Modified — должен уехать в конец
  ];

  it("Modified desc по умолчанию", () => {
    const sorted = mergeSort(sample);
    expect(sorted[0].compositeId).toBe("main:1"); // 10-05
    expect(sorted[1].compositeId).toBe("dob:2");  // 10-04
    expect(sorted[2].compositeId).toBe("main:3"); // 10-03
    expect(sorted[3].compositeId).toBe("main:2"); // без Modified — низ
  });

  it("стабильный tiebreak по compositeId", () => {
    const eq = [
      { compositeId: "main:2", raw: { Modified: "2026-10-03T10:00:00Z" } },
      { compositeId: "main:1", raw: { Modified: "2026-10-03T10:00:00Z" } },
    ];
    const sorted = mergeSort(eq);
    expect(sorted.map((s) => s.compositeId)).toEqual(["main:1", "main:2"]);
  });
});