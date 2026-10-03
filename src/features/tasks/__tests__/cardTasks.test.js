// src/features/tasks/__tests__/cardTasks.test.js
// Карточки #tasks должны показывать задачи ОБОИХ источников (main + dob),
// а не только основного списка.

import { describe, it, expect } from "vitest";
import { mergeCardTasks, markMainTasks, isExternalTask } from "../lib/cardTasks";

const mainTasks = [
  { Id: 10, Title: "Основная задача", Modified: "2026-10-03T10:00:00Z" },
  { Id: 11, Title: "Основная задача 2", Modified: "2026-10-01T10:00:00Z" },
];

const dobRows = [
  {
    Id: 1,
    Title: "Заявка ООБ",
    Modified: "2026-10-03T00:29:42Z",
    sourceId: "dob",
    sourceLabel: "DOB Logistic",
    compositeId: "dob:1",
    Status: "Не начата",
  },
];

describe("cardTasks", () => {
  it("markMainTasks проставляет sourceId/compositeId и идемпотентен", () => {
    const once = markMainTasks(mainTasks);
    expect(once[0].sourceId).toBe("main");
    expect(once[0].compositeId).toBe("main:10");
    const twice = markMainTasks(once);
    expect(twice[0]).toBe(once[0]);
  });

  it("isExternalTask: main — не внешняя, dob — внешняя", () => {
    expect(isExternalTask({ sourceId: "main", Id: 1 })).toBe(false);
    expect(isExternalTask({ sourceId: "dob", Id: 1 })).toBe(true);
    expect(isExternalTask({ Id: 1 })).toBe(false);
  });

  it("dob-задача попадает в список карточек", () => {
    const merged = mergeCardTasks(mainTasks, dobRows);
    expect(merged).toHaveLength(3);
    const dob = merged.find((t) => t.sourceId === "dob");
    expect(dob?.Title).toBe("Заявка ООБ");
    expect(dob?.compositeId).toBe("dob:1");
  });

  it("сортировка по Modified desc", () => {
    const merged = mergeCardTasks(mainTasks, dobRows);
    expect(merged.map((t) => t.compositeId)).toEqual(["main:10", "dob:1", "main:11"]);
  });

  it("одинаковые Id из разных источников не склеиваются", () => {
    const merged = mergeCardTasks([{ Id: 1, Modified: "2026-10-03T00:00:00Z" }], dobRows);
    expect(merged.map((t) => t.compositeId).sort()).toEqual(["dob:1", "main:1"]);
  });

  it("дубликаты по sourceId:Id отбрасываются", () => {
    const merged = mergeCardTasks(mainTasks, [...dobRows, { ...dobRows[0] }]);
    expect(merged).toHaveLength(3);
  });

  it("пустые входы не падают", () => {
    expect(mergeCardTasks(null, null)).toEqual([]);
    expect(mergeCardTasks(mainTasks, [])).toHaveLength(2);
  });
});
