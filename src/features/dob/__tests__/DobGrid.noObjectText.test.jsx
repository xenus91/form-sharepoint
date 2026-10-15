// @vitest-environment jsdom
// src/features/dob/__tests__/DobGrid.noObjectText.test.jsx
//
// «[object Object]» не должен появляться НИГДЕ в таблице: ни в ячейках, ни в
// подписях групп (группировка по полю-объекту), ни в значениях фильтра.

import { describe, it, expect, beforeEach } from "vitest";
import { renderDobGrid, textOf } from "./helpers/dobGridHarness";
import { gridStateKey } from "../lib/gridStateStorage";

const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "Title", Title: "Название", TypeAsString: "Text" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice" },
  { InternalName: "Initiator", Title: "Инициатор", TypeAsString: "User" },
  { InternalName: "Members", Title: "Участники", TypeAsString: "UserMulti" },
  // lookup и «выбор» объектом — типы, у которых значение приходит объектом
  { InternalName: "Responsible", Title: "Ответственный", TypeAsString: "Lookup" },
  { InternalName: "Kind", Title: "Вид", TypeAsString: "Choice" },
];

const ROWS = [
  {
    ID: 1, Title: "Первая", Status: { Value: "Открыт" },
    Initiator: { __deferred: { uri: "http://sp/x" } },
    Members: { __metadata: { type: "Collection(SP.User)" }, results: [] },
    Responsible: { LookupId: 3, LookupValue: "Иванов Иван" },
    Kind: { Value: "Проверка" },
  },
  {
    ID: 2, Title: "Вторая", Status: { Value: "Открыт" },
    Initiator: {}, Members: {}, Responsible: {}, Kind: {},
  },
  {
    ID: 3, Title: "Третья", Status: { Value: "Завершена" },
    Initiator: null, Members: null, Responsible: null, Kind: null,
  },
];

describe("DobGrid — никакого «[object Object]»", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("в ячейках объектов не видно", async () => {
    const { host } = await renderDobGrid({ fields: FIELDS, rows: ROWS, contentTypes: [], stateScope: "no_obj" });
    expect(textOf(host)).not.toContain("[object Object]");
    // lookup показывает имя, пустые поля людей — прочерк
    expect(textOf(host)).toContain("Иванов Иван");
    expect(host.querySelectorAll('[data-testid="dob-person-empty"]').length).toBeGreaterThan(0);
  });

  it("в подписях ГРУПП тоже (группировка по полю-объекту)", async () => {
    const scope = "no_obj_group";
    localStorage.setItem(gridStateKey(scope), JSON.stringify({
      rowGroup: { groupColIds: ["Responsible"] },
      rowGroupExpansion: { expandedRowGroupIds: [] },
      partialColumnState: true,
    }));
    const { host } = await renderDobGrid({ fields: FIELDS, rows: ROWS, contentTypes: [], stateScope: scope });
    const labels = [...host.querySelectorAll(".ag-group-value")].map((e) => (e.textContent || "").trim()).filter(Boolean);
    expect(textOf(host)).not.toContain("[object Object]");
    expect(labels).toContain("Иванов Иван");
    expect(labels.some((l) => l.includes("[object Object]"))).toBe(false);
  });

  it("тип поля «Пользователь или группа» по-русски тоже обрабатывается", async () => {
    const ruFields = [
      { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
      { InternalName: "Initiator", Title: "Инициатор", TypeAsString: "Пользователь или группа" },
    ];
    const ruRows = [
      { ID: 1, Initiator: { Id: 7, Title: "Иванов Иван" } },
      { ID: 2, Initiator: { __deferred: { uri: "x" } } },
    ];
    const { host } = await renderDobGrid({ fields: ruFields, rows: ruRows, contentTypes: [], stateScope: "ru_type" });
    expect(textOf(host)).not.toContain("[object Object]");
    expect(textOf(host)).toContain("Иванов Иван");
    expect(host.querySelectorAll('[data-testid="dob-person-cell"]').length).toBeGreaterThan(0);
  });
});
