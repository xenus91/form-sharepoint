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
 * Поддерживает:
 *   - $expand=Recipient / $expand=Получатель / $expand=Исполнитель и т.п.
 *     (один объект или {results:[...]})
 *   - projected column `Recipient_x003a_SCNumberText` / `Получатель_x003a_SCNumberText`
 *     (если есть в ответе без $expand)
 *   - fallback: прямые поля `Title`, `THU`, `DC_THU`
 */
const LOOKUP_FIELD_NAMES = [
  "Recipient",
  "Получатель",
  "Исполнитель",
  "Receiver",
  "Assignee",
  "Tasks",
  "Task",
];

function extractRecipientAndSC(d) {
  if (!d) return null;
  let rec = null;
  for (const f of LOOKUP_FIELD_NAMES) {
    if (d[f] !== undefined) {
      rec = d[f];
      break;
    }
  }
  let recTitle = "";
  let scVal = "";
  let thuVal = d.THU || d.DC_THU || "";
  if (rec && typeof rec === "object") {
    if (rec.Title) recTitle = rec.Title;
    else if (Array.isArray(rec.results) && rec.results[0]?.Title) recTitle = rec.results[0].Title;
    if (rec.SCNumberText) scVal = rec.SCNumberText;
    else if (rec.SCNumber) scVal = rec.SCNumber;
    else if (Array.isArray(rec.results) && rec.results[0]?.SCNumberText) scVal = rec.results[0].SCNumberText;
  }
  if (!scVal) {
    for (const f of LOOKUP_FIELD_NAMES) {
      const projKey = `${f}_x003a_SCNumberText`;
      const projKeyUpper = `${f}_x003A_SCNumberText`;
      if (d[projKey]) { scVal = d[projKey]; break; }
      if (d[projKeyUpper]) { scVal = d[projKeyUpper]; break; }
    }
  }
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
 * Почему НЕ CAML /GetItems, хотя он компактнее (1 запрос на N ItemId):
 *   - Primary key в CAML — это `FieldRef Name='ID'` (ЗАГЛАВНЫЕ!), а не `Id`.
 *     Если написать `Id` — SP отвечает SPException -2130575340
 *     "field types installed improperly" — пугающее misleading-сообщение
 *     при ЛЮБОМ <Where> с lowercase Id (воспроизведено на проблемной ферме).
 *   - ViewFields в CAML требуют жёсткое знание списка; если поля нет —
 *     тот же SPException. REST $select прощает отсутствие полей.
 *   - REST $filter выразительнее (`or`-цепочка), меньше шанс опечататься.
 *
 * Поле-получатель в RelatedItems-list называется по-разному (Recipient,
 * Получатель, Исполнитель, Tasks…), поэтому используем автодискавери:
 *   1) пробуем $expand=Recipient ($select=Title,SCNumberText);
 *   2) если в ответе нет поля Recipient — пробуем $expand=Получатель;
 *   3) затем Исполнитель / Receiver / Assignee / Tasks / Task;
 *   4) если и так пусто — fallback на «все поля» и client-side извлечение.
 *
 * Кэш обнаруженного поля — по listId, чтобы не пробовать каждый раз.
 *
 * @param {string} listId
 * @param {Array<number|string>} itemIds
 * @returns {Promise<Array>} массив raw-объектов (data.d.results)
 */
const _discoveredLookupField = new Map(); // listId → { field, scField }
const LOOKUP_CANDIDATES = [
  { field: "Recipient", scField: "SCNumberText" },
  { field: "Получатель", scField: "SCNumberText" },
  { field: "Исполнитель", scField: "SCNumberText" },
  { field: "Receiver", scField: "SCNumberText" },
  { field: "Assignee", scField: "SCNumberText" },
  { field: "Tasks", scField: "SCNumberText" },
  { field: "Task", scField: "SCNumberText" },
];

async function tryExpandLookup(listId, itemIds, candidate) {
  const filter = itemIds.map((id) => `Id eq ${Number(id)}`).join(" or ");
  const url =
    `/web/lists(guid'${listId}')/items?$filter=${encodeURIComponent(filter)}` +
    `&$select=Id,Title&$expand=${candidate.field}($select=Title,${candidate.scField})`;
  try {
    const { data } = await apiClient.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    const results = data?.d?.results || [];
    if (results.length === 0) return null;
    const first = results[0];
    if (!first) return null;
    const hasField = Object.prototype.hasOwnProperty.call(first, candidate.field);
    // Поле либо есть (даже если null), либо нет — определяем по наличию ключа
    if (!hasField) return null;
    return { results, candidate };
  } catch {
    return null;
  }
}

async function fetchRelatedElementsBatch(listId, itemIds) {
  if (!itemIds.length) return [];
  const cached = _discoveredLookupField.get(listId);
  if (cached) {
    const tried = await tryExpandLookup(listId, itemIds, cached);
    if (tried) return tried.results;
    _discoveredLookupField.delete(listId);
  }
  for (const cand of LOOKUP_CANDIDATES) {
    const tried = await tryExpandLookup(listId, itemIds, cand);
    if (tried) {
      _discoveredLookupField.set(listId, cand);
      return tried.results;
    }
  }
  // Fallback: без $expand, берём все поля — extractRecipientAndSC сам
  // найдёт Recipient/Title/THU/DC_THU если они есть в выдаче.
  try {
    const filter = itemIds.map((id) => `Id eq ${Number(id)}`).join(" or ");
    const url = `/web/lists(guid'${listId}')/items?$filter=${encodeURIComponent(filter)}&$top=${itemIds.length}`;
    const { data } = await apiClient.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    return data?.d?.results || [];
  } catch {
    return [];
  }
}

/**
 * Сбросить кэш автодискавери lookup-поля (например, после изменения схемы
 * RelatedItems-list). Полезно дёрнуть из DevTools.
 */
export function clearEnrichDiscoveryCache() {
  _discoveredLookupField.clear();
}

/**
 * Старый fallback — одиночный fetch с 3 fallback URL.
 * Используется только если batch не сработал (пустой ответ / ошибка).
 * Берёт обнаруженное поле из кэша, если есть.
 */
async function fetchRelatedElement(listId, itemId) {
  const lookup = _discoveredLookupField.get(listId);
  const field = lookup?.field || "Recipient";
  const tryFetch = async (url) => {
    const { data } = await apiClient.get(url, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    return data?.d;
  };
  const selects = [
    `${field}/Title`,
    `${field}/Id`,
    `${field}/SCNumberText`,
    "Title",
    "THU",
    "DC_THU",
  ];
  const expands = [field];
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
          `/web/lists(guid'${listId}')/items(${itemId})?$select=${field}/Title,Title,THU,DC_THU&$expand=${field}`
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