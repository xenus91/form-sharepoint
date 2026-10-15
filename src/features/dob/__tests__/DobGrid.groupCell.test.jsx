// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.groupCell.test.jsx
//
// Строка группы: подпись «Открыт» и счётчик «(2)» должны стоять на одной линии.
// В DOM AG Grid подпись — это .ag-group-value (обычный inline), а счётчик —
// .ag-group-child-count, который тема грида превращает во flex-бокс с высотой
// min(--ag-line-height, row-height - 2px): из-за этого «(2)» уезжало и
// выглядело подстрочным. jsdom не считает layout, поэтому проверяем и разметку,
// и наличие переопределения в src/index.css.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, it, expect, beforeEach } from "vitest";
import { renderDobGrid } from "./helpers/dobGridHarness";
import { gridStateKey } from "../lib/gridStateStorage";

// vitest запускается из корня репозитория
const indexCss = readFileSync(resolve(cwd(), "src/index.css"), "utf8");

describe("DobGrid — ячейка группы", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  const renderGrouped = async (scope) => {
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      rowGroup: { groupColIds: ["Status"] },
      partialColumnState: true,
    }));
    return renderDobGrid({ stateScope: scope });
  };

  it("подпись и счётчик — соседние элементы ячейки группы", async () => {
    const { host } = await renderGrouped("group_cell");
    const cell = host.querySelector(".ag-cell-wrapper.ag-row-group");
    expect(cell).toBeTruthy();

    const title = cell.querySelector(".ag-group-value");
    const count = cell.querySelector(".ag-group-child-count");
    expect((title?.textContent || "").trim()).toBe("Открыт");
    expect((count?.textContent || "").trim()).toBe("(2)");
    // оба — прямые дети ячейки группы, то есть выстраиваются в одну строку
    expect(count?.parentElement).toBe(cell);
    expect(title?.parentElement).toBe(cell);
  });

  it("счётчик остаётся у каждой группы", async () => {
    const { host } = await renderGrouped("group_cell_counts");
    const counts = [...host.querySelectorAll(".ag-cell-wrapper.ag-row-group .ag-group-child-count")]
      .map((e) => (e.textContent || "").trim())
      .filter(Boolean);
    expect([...new Set(counts)]).toEqual(["(2)", "(1)"]);
  });

  it("в index.css есть выравнивание счётчика по базовой линии", () => {
    expect(indexCss).toContain(".ag-cell-wrapper.ag-row-group > .ag-group-child-count");
    expect(indexCss).toContain("vertical-align: baseline");
  });
});
