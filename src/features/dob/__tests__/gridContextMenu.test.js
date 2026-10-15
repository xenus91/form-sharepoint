// src/features/dob/__tests__/gridContextMenu.test.js
//
// Контекстное меню таблицы: сворачивание/разворачивание ВСЕХ групп —
// встроенными пунктами AG Grid, а не своими действиями.

import { describe, it, expect, vi } from "vitest";
import { buildContextMenuItems } from "../lib/gridContextMenu";

describe("buildContextMenuItems", () => {
  it("содержит встроенные пункты свернуть/развернуть все группы", () => {
    const items = buildContextMenuItems();
    expect(items).toContain("expandAll");
    // ключ пункта в AG Grid — contractAll (а не collapseAll)
    expect(items).toContain("contractAll");
  });

  it("копирование, экспорт и группировка на месте, пункты AG Grid — в конце", () => {
    const items = buildContextMenuItems({ defaultItems: ["chartRange"] });
    expect(items).toContain("copy");
    expect(items).toContain("copyWithHeaders");
    expect(items).toContain("paste");
    expect(items).toContain("export");
    expect(items).toContain("rowGrouping");
    expect(items[items.length - 1]).toBe("chartRange");
  });

  it("сброс сохранённых настроек — свой пункт с русским названием", () => {
    const onResetState = vi.fn();
    const items = buildContextMenuItems({ onResetState });
    const reset = items.find((item) => typeof item === "object" && item !== null);
    expect(reset.name).toBe("Сбросить настройки таблицы");
    reset.action();
    expect(onResetState).toHaveBeenCalledTimes(1);
  });
});
