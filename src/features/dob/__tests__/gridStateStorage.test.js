// @vitest-environment jsdom
// src/features/dob/__tests__/gridStateStorage.test.js
//
// Хранение пользовательских настроек AG Grid в localStorage.

import { describe, it, expect, beforeEach } from "vitest";
import {
  gridStateKey,
  loadGridState,
  saveGridState,
  clearGridState,
  pickPersistedState,
} from "../lib/gridStateStorage";

describe("gridStateStorage", () => {
  beforeEach(() => { localStorage.clear(); });

  it("ключ — по разделу таблицы", () => {
    expect(gridStateKey()).toBe("dob:grid-state:requests");
    expect(gridStateKey("dob_requests")).toBe("dob:grid-state:dob_requests");
    expect(gridStateKey("  DOB_Requests ")).toBe("dob:grid-state:dob_requests");
  });

  it("сохраняет настройки и читает их обратно", () => {
    const state = {
      columnOrder: { orderedColIds: ["ID", "Title"] },
      columnVisibility: { hiddenColIds: ["Status"] },
      filter: { filterModel: { Status: { filterType: "set", values: ["Открыт"] } } },
      rowGroup: { groupColIds: ["Status"] },
    };
    expect(saveGridState(gridStateKey("t1"), state)).toBe(true);
    expect(loadGridState(gridStateKey("t1"))).toEqual(state);
  });

  it("прокрутку, фокус и выделение не сохраняет", () => {
    const picked = pickPersistedState({
      scroll: { top: 400, left: 0 },
      focusedCell: { rowIndex: 3, colId: "ID" },
      rowSelection: ["1", "2"],
      cellSelection: { cellRanges: [] },
      sort: { sortModel: [{ colId: "ID", sort: "asc" }] },
    });
    expect(picked).toEqual({ sort: { sortModel: [{ colId: "ID", sort: "asc" }] } });
  });

  it("битый JSON и пустые значения — «настроек нет»", () => {
    localStorage.setItem(gridStateKey("bad"), "{не json");
    expect(loadGridState(gridStateKey("bad"))).toBe(null);
    localStorage.setItem(gridStateKey("empty"), "{}");
    expect(loadGridState(gridStateKey("empty"))).toBe(null);
    expect(loadGridState(gridStateKey("нет-такого-ключа"))).toBe(null);
  });

  it("сброс удаляет сохранённые настройки", () => {
    saveGridState(gridStateKey("t2"), { sort: { sortModel: [] } });
    expect(clearGridState(gridStateKey("t2"))).toBe(true);
    expect(loadGridState(gridStateKey("t2"))).toBe(null);
    expect(clearGridState(gridStateKey("t2"))).toBe(false);
  });
});
