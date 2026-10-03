// src/features/dob/lib/relatedItem.js
// Поиск «связанной заявки» для задачи/заявки ДОБ.
//
// Связь хранится в поле RelatedItems (SharePoint RelatedItemManager) — это
// JSON-строка вида [{"ItemId":2,"WebId":"…","ListId":"21b5b544-…"}].
// Тот же формат разбирает карточка main-задачи (src/tasks/relatedFields.js,
// parseRelatedRef) — при недоступности RelatedItems пробуем lookup-поле,
// которое ссылается на список заявок.

import { DOB_LIST_GUID } from "../api/dobClient";

/** GUID в любом регистре/с фигурными скобками → нижний регистр без скобок. */
export function normalizeGuid(value) {
  return String(value ?? "").replace(/[{}]/g, "").trim().toLowerCase();
}

/** Разбирает RelatedItems → { listId, itemId } (первый связанный элемент). */
export function parseRelatedItems(related) {
  let parsed = related;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (_e) {
      void _e;
      return null;
    }
  }
  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === "object" && (parsed.ListId || parsed.listId)) parsed = [parsed];
    else return null;
  }
  const first = parsed[0];
  if (!first) return null;
  const listId = first.ListId || first.listId;
  const itemIdRaw = first.ItemId ?? first.itemId ?? first.ItemID;
  const itemId = Number(itemIdRaw);
  if (!listId || !Number.isFinite(itemId) || itemId <= 0) return null;
  return { listId: normalizeGuid(listId), itemId };
}

/**
 * Определяет связанный элемент для задачи ДОБ.
 *
 * 1) RelatedItems самого элемента (основной путь);
 * 2) fallback: lookup-поле, ссылающееся на список заявок ДОБ (LookupList == DOB_LIST_GUID),
 *    у которого заполнено значение (`<Field>Id`).
 *
 * @param {object} item — элемент из getDobItem
 * @param {Array<object>} [fields] — метаданные полей списка (getDobFields)
 * @param {{fallbackListId?: string}} [opts]
 * @returns {{listId:string,itemId:number}|null}
 */
export function resolveRelatedRef(item, fields = [], { fallbackListId = DOB_LIST_GUID } = {}) {
  const fromRelated = parseRelatedItems(item?.RelatedItems ?? item?.OData__RelatedItems);
  if (fromRelated) return fromRelated;

  const targetGuid = normalizeGuid(fallbackListId);
  for (const field of fields || []) {
    const type = String(field?.TypeAsString || "").toLowerCase();
    if (type !== "lookup" && type !== "lookupmulti") continue;
    if (normalizeGuid(field?.LookupList) !== targetGuid) continue;
    const internal = field?.InternalName;
    if (!internal) continue;
    const rawId = item?.[`${internal}Id`] ?? item?.[`OData__${internal}Id`];
    const node = item?.[internal];
    const candidate = rawId ?? (node && typeof node === "object" ? node.Id ?? node.ID : node);
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0) return { listId: targetGuid, itemId: id };
  }
  return null;
}

/** Маршрут формы связанной заявки (та же форма dob_tasks, но с ?list=). */
export function relatedItemRoute(ref) {
  if (!ref?.itemId) return "";
  const list = ref.listId ? `?list=${ref.listId}` : "";
  return `#dob_tasks/${ref.itemId}${list}`;
}
