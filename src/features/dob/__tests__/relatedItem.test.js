// src/features/dob/__tests__/relatedItem.test.js
// Связь задачи ДОБ со «связанной заявкой»: RelatedItems → { listId, itemId }
// и fallback через lookup-поле на список заявок (DOB_LIST_GUID).

import { describe, it, expect } from "vitest";
import { parseRelatedItems, resolveRelatedRef, relatedItemRoute, normalizeGuid } from "../lib/relatedItem";
import { DOB_LIST_GUID } from "../api/dobClient";

const DOB_LIST = "21b5b544-bd98-4b06-891f-c5a137331394";

describe("dob/lib/relatedItem", () => {
  it("normalizeGuid убирает скобки и регистр", () => {
    expect(normalizeGuid("{21B5B544-BD98-4B06-891F-C5A137331394}")).toBe(DOB_LIST);
    expect(normalizeGuid(null)).toBe("");
  });

  it("parseRelatedItems разбирает JSON-строку, массив и объект", () => {
    expect(parseRelatedItems(JSON.stringify([{ ListId: `{${DOB_LIST}}`, ItemId: 2 }])))
      .toEqual({ listId: DOB_LIST, itemId: 2 });
    expect(parseRelatedItems([{ listId: DOB_LIST, itemId: "17" }])).toEqual({ listId: DOB_LIST, itemId: 17 });
    expect(parseRelatedItems({ ListId: DOB_LIST, ItemId: 5 })).toEqual({ listId: DOB_LIST, itemId: 5 });
  });

  it("parseRelatedItems отбрасывает мусор и пустые значения", () => {
    expect(parseRelatedItems("не json")).toBeNull();
    expect(parseRelatedItems([])).toBeNull();
    expect(parseRelatedItems([{ ListId: DOB_LIST }])).toBeNull();
    expect(parseRelatedItems(null)).toBeNull();
  });

  it("resolveRelatedRef берёт первый связанный элемент задачи", () => {
    const item = { Id: 1, RelatedItems: JSON.stringify([{ ListId: DOB_LIST, ItemId: 2, WebId: "x" }]) };
    expect(resolveRelatedRef(item, [])).toEqual({ listId: DOB_LIST, itemId: 2 });
  });

  it("resolveRelatedRef читает OData-вариант поля RelatedItems", () => {
    const item = { Id: 1, OData__RelatedItems: JSON.stringify([{ ListId: DOB_LIST, ItemId: 7 }]) };
    expect(resolveRelatedRef(item, [])).toEqual({ listId: DOB_LIST, itemId: 7 });
  });

  it("resolveRelatedRef: fallback — lookup-поле на список заявок ДОБ", () => {
    const fields = [
      { InternalName: "Title", TypeAsString: "Text" },
      { InternalName: "Request", TypeAsString: "Lookup", LookupList: `{${DOB_LIST_GUID}}` },
      { InternalName: "Other", TypeAsString: "Lookup", LookupList: "{00000000-0000-0000-0000-000000000000}" },
    ];
    const item = { Id: 1, RequestId: 42, OtherId: 3 };
    expect(resolveRelatedRef(item, fields)).toEqual({ listId: DOB_LIST_GUID.toLowerCase(), itemId: 42 });
  });

  it("resolveRelatedRef: нет связи → null", () => {
    expect(resolveRelatedRef({ Id: 1 }, [{ InternalName: "Title", TypeAsString: "Text" }])).toBeNull();
    expect(resolveRelatedRef(null, null)).toBeNull();
  });

  it("relatedItemRoute ведёт в форму заявки с её списком", () => {
    expect(relatedItemRoute({ listId: DOB_LIST, itemId: 2 })).toBe(`#dob_tasks/2?list=${DOB_LIST}`);
    expect(relatedItemRoute(null)).toBe("");
  });
});
