// src/features/dob/__tests__/agGridLocaleRu.test.js
//
// Русская локаль AG Grid: ключи должны совпадать с теми, что грид реально
// спрашивает (они взяты из бандлов ag-grid-community/enterprise), иначе
// опечатка молча оставит английский текст.

import { describe, it, expect } from "vitest";
import { AG_GRID_LOCALE_RU } from "../lib/agGridLocaleRu";

// Ключи, которые видно в таблице #dob_requests (фильтры, панели, меню, строка
// состояния, пагинация).
const VISIBLE_KEYS = [
  "applyFilter", "clearFilter", "resetFilter", "cancelFilter", "setFilter", "filterOoo",
  "equals", "notEqual", "contains", "notContains", "startsWith", "endsWith", "inRange",
  "lessThan", "greaterThan", "blank", "notBlank", "andCondition", "orCondition",
  "selectAll", "selectAllSearchResults", "searchOoo", "blanks", "noMatches",
  "columns", "filters", "values", "groups", "valueAggregation", "chooseColumns",
  "rowGroupColumnsEmptyMessage", "valueColumnsEmptyMessage",
  "expandAll", "collapseAll", "ungroupAll", "groupBy", "ungroupBy",
  "addToValues", "removeFromValues", "sum", "min", "max", "avg", "count", "noAggregation",
  "copy", "copyWithHeaders", "paste", "export", "excelExport", "csvExport",
  "pinLeft", "pinRight", "noPin", "pinColumn", "autosizeThisColumn", "autosizeAllColumns",
  "resetColumns", "sortAscending", "sortDescending", "sortUnSort",
  "totalAndFilteredRows", "totalRows", "filteredRows", "selectedRows", "footerTotal",
  "page", "of", "to", "nextPage", "previousPage", "firstPage", "lastPage",
  "pageSizeSelectorLabel", "loadingOoo", "noRowsToShow",
];

describe("AG_GRID_LOCALE_RU", () => {
  it("все видимые строки переведены", () => {
    const missing = VISIBLE_KEYS.filter((key) => !AG_GRID_LOCALE_RU[key]);
    expect(missing).toEqual([]);
  });

  it("значения — кириллица, без латинских слов", () => {
    const suspicious = Object.entries(AG_GRID_LOCALE_RU)
      .filter(([key]) => key !== "dateFormatOoo")
      .filter(([, value]) => !/[а-яА-ЯёЁ]/.test(value));
    expect(suspicious).toEqual([]);
  });

  it("подстановка имени колонки идёт через ${variable} (так подставляет AG Grid)", () => {
    expect(AG_GRID_LOCALE_RU.addToValues).toContain("${variable}");
    expect(AG_GRID_LOCALE_RU.removeFromValues).toContain("${variable}");
  });

  it("ключевые переводы", () => {
    expect(AG_GRID_LOCALE_RU.groups).toBe("Группы строк");
    expect(AG_GRID_LOCALE_RU.values).toBe("Значения");
    expect(AG_GRID_LOCALE_RU.expandAll).toBe("Развернуть все группы");
    expect(AG_GRID_LOCALE_RU.collapseAll).toBe("Свернуть все группы");
    expect(AG_GRID_LOCALE_RU.totalAndFilteredRows).toBe("Строки");
    expect(AG_GRID_LOCALE_RU.applyFilter).toBe("Применить");
    expect(AG_GRID_LOCALE_RU.selectAll).toBe("Выбрать все");
  });
});
