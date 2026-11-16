// src/tasks/__tests__/assignedIds.test.js
// Требование: в роуте #tasks должны находиться ВСЕ задачи, назначенные
// пользователю ИЛИ группе из DcEmail.

import { describe, it, expect } from "vitest";
import { computeAssignedIds, toIdList } from "../multiSource";

describe("toIdList", () => {
  it("чистит мусор и дубликаты", () => {
    expect(toIdList([207, "33", 33, null, NaN, 0, -5])).toEqual([207, 33]);
    expect(toIdList(null)).toEqual([]);
    expect(toIdList(42)).toEqual([42]);
  });
});

describe("computeAssignedIds", () => {
  it("пользователь + срезолвленные группы на сайте-источнике", () => {
    const ids = computeAssignedIds(
      { id: "dob", clientKind: "dob" },
      { userId: 207, principalIds: [33, 34] },
      {}
    );
    expect(ids).toEqual([207, 33, 34]);
  });

  it("для основного сайта добавляются «родные» Id из DcEmail.Email", () => {
    const ids = computeAssignedIds(
      { id: "main", clientKind: "main" },
      { userId: 5, principalIds: [] },
      { nativePrincipalIds: [33, 34] }
    );
    expect(ids).toEqual([5, 33, 34]);
  });

  it("родные Id добавляются, даже если ни один принципал не срезолвился", () => {
    const ids = computeAssignedIds(
      { id: "main", clientKind: "main" },
      { userId: 5, principalIds: [] },
      { nativePrincipalIds: [77] }
    );
    expect(ids).toEqual([5, 77]);
  });

  it("для внешнего источника родные Id НЕ добавляются (другое Id-пространство)", () => {
    const ids = computeAssignedIds(
      { id: "dob", clientKind: "dob" },
      { userId: 207, principalIds: [] },
      { nativePrincipalIds: [33, 34] }
    );
    expect(ids).toEqual([207]);
  });

  it("assignedIdsBySource переопределяет всё", () => {
    const ids = computeAssignedIds(
      { id: "dob", clientKind: "dob" },
      { userId: 207, principalIds: [1, 2] },
      { assignedIdsBySource: { dob: [9999] } }
    );
    expect(ids).toEqual([9999]);
  });

  it("пустая identity → пустой список (источник будет пропущен со скипом no-ids-resolved)", () => {
    expect(computeAssignedIds({ id: "dob", clientKind: "dob" }, { userId: null, principalIds: [] }, {})).toEqual([]);
  });
});
