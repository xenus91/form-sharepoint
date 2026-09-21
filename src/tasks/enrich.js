// src/tasks/enrich.js
// Докачка Recipient/SCNumber/THU для задач с пустыми полями — через RelatedItems.
//
// Tier-1 оптимизация: вместо fan-out по одному запросу на каждую задачу
// (плюс до 3 fallback URL на каждый) делаем ОДИН POST /GetItems с CAML
// <In>...</In> для всех itemId по каждому listId. Экономия трафика:
//   N задач → 1 запрос на каждый уникальный listId (а не N*3 в худшем случае).
//
// Старый fan-out (fetchRelatedElement + runWithConcurrency) остаётся как
// fallback — на случай если серверный $top лимит /In> срежет результат
// (по факту SP обычно тянет до ~500 значений, наш типичный кейс 20-50).

import apiClient from "../api";
import { extractTKNumberFromTask } from "./formatters";
import { runWithConcurrency } from "../utils/concurrency";

/**
 * Парсит RelatedItems задачи. Может быть строкой-JSON или массивом объектов {ListId, ItemId}.
 */
function parseRelatedItems(related) {
  if (typeof related === "string") {
    try {
      return JSON.parse(related);
    } catch {
      return null;
    }
  }
  return related;
}

/**
 * Извлекает Recipient Title и SCNumber из сырого объекта Related-элемента.
 *
 * Поддерживает оба варианта: $expand=Recipient (один объект или {results:[...]})
 * и projected column `Recipient_x003a_SCNumberText` (если есть в ответе).
 */
function extractRecipientAndSC(d) {
  if (!d) return null;
  const rec = d.Recipient;
  let recTitle = "";
  let scVal = "";
  let thuVal = d.THU || d.DC_THU || "";
  if (rec) {
    if (rec.Title) recTitle = rec.Title;
    else if (rec.results && rec.results[0]?.Title) recTitle = rec.results[0].Title;
    if (rec.SCNumberText) scVal = rec.SCNumberText;
    else if (rec.SCNumber) scVal = rec.SCNumber;
    else if (rec.results && rec.results[0]?.SCNumberText) scVal = rec.results[0].SCNumberText;
  }
  if (!scVal) scVal = d.Recipient_x003a_SCNumberText || d.Recipient_x003A_SCNumberText || "";
  if (recTitle || scVal || thuVal) {
    return {
      recipient: recTitle,
      scNumber: scVal ? String(scVal) : "",
      thu: thuVal ? String(thuVal).trim() : "",
    };
  }
  return null;
}

/**
 * Группировка задач по listId из RelatedItems[0].ListId.
 * Возвращает Map<listId, Array<{task, itemId}>>.
 */
function groupByListId(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const related = parseRelatedItems(t.RelatedItems);
    if (!Array.isArray(related) || related.length === 0) continue;
    const first = related[0];
    const listIdRaw = first.ListId || first.listId;
    const itemId = first.ItemId || first.itemId || first.ItemID;
    if (!listIdRaw || !itemId) continue;
    const listId = String(listIdRaw).replace(/[{}]/g, "");
    let arr = groups.get(listId);
    if (!arr) {
      arr = [];
      groups.set(listId, arr);
    }
    arr.push({ task: t, itemId });
  }
  return groups;
}

/**
 * Batch-выборка связанных элементов через REST $filter (Id eq X or Id eq Y ...).
 *
 * Почему НЕ CAML /GetItems: запрос с CAML <In> + ViewFields (THU, DC_THU,
 * Recipient, Recipient_x003a_SCNumberText) падает с SPException -2130575340
 * "Один или несколько типов полей установлены неправильно" — потому что эти
 * поля живут в списке Tasks, а не в списке RelatedItems (например
 * ПроизводственныеЗадачи). CAML <In> + явный ViewFields ломается, если
 * хотя бы одно поле отсутствует.
 *
 * REST $filter устойчив: используем только универсальные поля (Id, Title)
 * + $expand=Recipient (он есть почти везде, где есть lookup на Tasks).
 * Если $expand упадёт — мы просто не получим Recipient, но не словим 500.
 *
 * @param {string} listId
 * @param {Array<number|string>} itemIds
 * @returns {Promise<Array>} массив raw-объектов (data.d.results)
 */
async function fetchRelatedElementsBatch(listId, itemIds) {
  if (!itemIds.length) return [];
  const filter = itemIds.map((id) => `Id eq ${Number(id)}`).join(" or ");
  const url =
    `/web/lists(guid'${listId}')/items?$filter=${encodeURIComponent(filter)}` +
    `&$select=Id,Title&$expand=Recipient($select=Title,SCNumberText)`;
  const { data } = await apiClient.get(url, {
    headers: { Accept: "application/json;odata=verbose" },
  });
  return data?.d?.results || [];
}

/**
 * Старый fallback — одиночный fetch с 3 fallback URL.
 * Используется только если batch не сработал (пустой ответ / ошибка).
 */
async function fetchRelatedElement(listId, itemId) {
  const tryFetch = async (url) => {
    const { data } = await apiClient.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    return data?.d;
  };
  const selects = ["Recipient/Title", "Recipient/Id", "Recipient/SCNumberText", "Title", "THU", "DC_THU"];
  const expands = ["Recipient"];
  try {
    return await tryFetch(
      `/web/lists(guid'${listId}')/items(${itemId})?$select=${selects.join(",")}&$expand=${expands.join(",")}`
    );
  } catch {
    try {
      const filterRes = await tryFetch(
        `/web/lists(guid'${listId}')/items?$filter=Id eq ${itemId}&$select=${selects.join(",")}&$expand=${expands.join(",")}&$top=1`
      );
      if (filterRes?.results && filterRes.results[0]) return filterRes.results[0];
      if (filterRes?.Id) return filterRes;
      throw new Error("filter empty");
    } catch {
      try {
        return await tryFetch(
          `/web/lists(guid'${listId}')/items(${itemId})?$select=Recipient/Title,Title,THU,DC_THU&$expand=Recipient`
        );
      } catch {
        return null;
      }
    }
  }
}

/**
 * Какие задачи нужно обогатить. Логика: только те, у которых пустой Recipient/SCNumber,
 * есть RelatedItems, и пока не определили TK-номер.
 */
export function needsEnrichment(mapped) {
  return mapped.filter(
    (m) => (!m.Recipient || !m.SCNumber) && m.RelatedItems && extractTKNumberFromTask(m) === "Без ТК"
  );
}

/**
 * Обогатить набор задач Recipient/SCNumber/THU через batch POST /GetItems
 * (по одному запросу на каждый уникальный listId).
 *
 * @param {Array} mapped массив наших Task
 * @param {{ concurrency?: number, onProgress?: (done:number, total:number) => void }} [opts]
 * @returns {Promise<{ recipientMap: Map<number,string>, scNumberMap: Map<number,string>, thuMap: Map<number,string> }>}
 */
export async function enrichTasksWithRelated(mapped, opts = {}) {
  const { concurrency = 5 } = opts;
  const tasks = needsEnrichment(mapped);
  const recipientMap = new Map();
  const scNumberMap = new Map();
  const thuMap = new Map();
  if (tasks.length === 0) return { recipientMap, scNumberMap, thuMap };

  const groups = groupByListId(tasks);

  // Build map itemId -> [tasks...] (одна и та же RelatedItems может повторяться)
  const idToTasks = new Map();
  for (const [, list] of groups) {
    for (const { task, itemId } of list) {
      const k = String(itemId);
      let arr = idToTasks.get(k);
      if (!arr) {
        arr = [];
        idToTasks.set(k, arr);
      }
      arr.push(task);
    }
  }

  // Параллельно шлём по одному POST /GetItems на каждый listId
  const groupEntries = Array.from(groups.entries());
  const groupResults = await runWithConcurrency(groupEntries, concurrency, async ([listId, list]) => {
    const itemIds = list.map((x) => x.itemId);
    let rawItems = [];
    try {
      rawItems = await fetchRelatedElementsBatch(listId, itemIds);
    } catch {
      // batch упал — ничего страшного, ниже уйдём в fan-out fallback
      rawItems = [];
    }
    if (rawItems.length === 0) {
      // Fallback: одиночные запросы с тремя fallback URL (старая логика)
      const singleResults = await runWithConcurrency(list, concurrency, async ({ task, itemId }) => {
        const d = await fetchRelatedElement(listId, itemId);
        return { id: task.Id, res: extractRecipientAndSC(d) };
      });
      return singleResults;
    }
    return rawItems.map((d) => {
      const r = extractRecipientAndSC(d);
      const id = d?.Id;
      return { id, res: r };
    });
  });

  for (const arr of groupResults) {
    for (const r of arr) {
      if (!r || !r.res || typeof r.res !== "object") continue;
      // Один raw item мог покрывать несколько наших задач (если RelatedItems совпадают)
      const ts = idToTasks.get(String(r.id));
      if (!ts) continue;
      for (const t of ts) {
        if (r.res.recipient) recipientMap.set(t.Id, r.res.recipient);
        if (r.res.scNumber) scNumberMap.set(t.Id, r.res.scNumber);
        if (r.res.thu) thuMap.set(t.Id, r.res.thu);
      }
    }
  }
  return { recipientMap, scNumberMap, thuMap };
}