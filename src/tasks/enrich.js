// src/tasks/enrich.js
// Докачка Recipient/SCNumber для задач с пустыми полями — через RelatedItems -> ProblemsPallet.
// Fan-out с concurrency-ограничением, неблокирующий (запускается в фоне после основного рендера).
//
// Раньше жило inline в loadTasks (~60 строк) — вынесено сюда в рамках Tier 3 (Q11).

import apiClient from "../api";
import { extractTKNumberFromTask } from "./formatters";
import { runWithConcurrency } from "../utils/concurrency";

/**
 * Парсит RelatedItems задачи. Может быть строкой-JSON или массивом объектов {ListId, ItemId}.
 */
function parseRelatedItems(related) {
  if (typeof related === "string") {
    try { return JSON.parse(related); } catch { return null; }
  }
  return related;
}

/**
 * Делает GET к связанному элементу с тремя fallback-стратегиями:
 *   1) items(itemId) с расширенным select
 *   2) items?$filter=Id eq itemId
 *   3) items(itemId) с минимальным select
 */
async function fetchRelatedElement(listId, itemId) {
  const tryFetch = async (url) => {
    const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
    return data?.d;
  };
  // THU — номер ЕО, берём напрямую из связанного элемента (шаг 1)
  const selects = ["Recipient/Title", "Recipient/Id", "Recipient/SCNumberText", "Title", "THU", "DC_THU"];
  const expands = ["Recipient"];
  try {
    return await tryFetch(`/web/lists(guid'${listId}')/items(${itemId})?$select=${selects.join(",")}&$expand=${expands.join(",")}`);
  } catch {
    try {
      const filterRes = await tryFetch(`/web/lists(guid'${listId}')/items?$filter=Id eq ${itemId}&$select=${selects.join(",")}&$expand=${expands.join(",")}&$top=1`);
      if (filterRes?.results && filterRes.results[0]) return filterRes.results[0];
      if (filterRes?.Id) return filterRes;
      throw new Error("filter empty");
    } catch {
      try {
        return await tryFetch(`/web/lists(guid'${listId}')/items(${itemId})?$select=Recipient/Title,Title,THU,DC_THU&$expand=Recipient`);
      } catch {
        return null;
      }
    }
  }
}

/**
 * Извлекает Recipient Title и SCNumber из сырого объекта Related-элемента.
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
  if (recTitle || scVal || thuVal) return { recipient: recTitle, scNumber: scVal ? String(scVal) : "", thu: thuVal ? String(thuVal).trim() : "" };
  return null;
}

/**
 * Докачивает Recipient/SCNumber для одной задачи.
 * @param {object} task наш Task
 * @returns {Promise<{recipient:string, scNumber:string}|null>}
 */
async function fetchRecipientForTask(task) {
  try {
    const related = parseRelatedItems(task.RelatedItems);
    if (!Array.isArray(related) || related.length === 0) return null;
    const first = related[0];
    const listIdRaw = first.ListId || first.listId;
    const itemId = first.ItemId || first.itemId || first.ItemID;
    if (!listIdRaw || !itemId) return null;
    const listId = String(listIdRaw).replace(/[{}]/g, "");
    const d = await fetchRelatedElement(listId, itemId);
    return extractRecipientAndSC(d);
  } catch {
    return null;
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
 * Группирует ItemId по ListId для батч-запроса.
 * @param {Array} tasks
 * @returns {Map<string, { itemIds:number[], taskIds:number[] }>}
 */
function groupByListId(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    try {
      const related = parseRelatedItems(t.RelatedItems);
      if (!Array.isArray(related) || related.length===0) continue;
      const first = related[0];
      const listIdRaw = first.ListId || first.listId;
      const itemId = first.ItemId || first.itemId || first.ItemID;
      if (!listIdRaw || !itemId) continue;
      const listId = String(listIdRaw).replace(/[{}]/g, "");
      const numId = Number(itemId);
      if (!listId || Number.isNaN(numId)) continue;
      let g = groups.get(listId);
      if (!g) { g = { itemIds: [], taskIds: [], taskIdToItemId: new Map() }; groups.set(listId, g); }
      if (!g.itemIds.includes(numId)) g.itemIds.push(numId);
      g.taskIds.push(t.Id);
      g.taskIdToItemId.set(t.Id, numId);
    } catch {}
  }
  return groups;
}

function chunk(arr, size) {
  const out = [];
  for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}

async function fetchRelatedBatch(listId, itemIds) {
  const selects = ["Recipient/Title", "Recipient/Id", "Recipient/SCNumberText", "Title", "THU", "DC_THU"];
  const expands = ["Recipient"];
  const selectStr = selects.join(",");
  const expandStr = expands.join(",");
  // SharePoint REST $filter с Or: (Id eq 1) or (Id eq 2) — URL может быть длинным, батчим по 30
  const chunks = chunk(itemIds, 30);
  const results = [];
  for (const c of chunks) {
    const filter = c.map((id)=> `(Id eq ${id})`).join(" or ");
    const url = `/web/lists(guid'${listId}')/items?$filter=${encodeURIComponent(filter)}&$select=Id,${selectStr}&$expand=${expandStr}&$top=${c.length * 2}`;
    try {
      const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
      const arr = data?.d?.results || [];
      results.push(...arr);
    } catch (e) {
      // fallback to single fetch for this chunk if batch failed
      console.warn("[enrich] batch failed for", listId, c.length, e?.response?.status);
      for (const id of c) {
        try {
          const d = await fetchRelatedElement(listId, id);
          if (d) results.push(d);
        } catch {}
      }
    }
  }
  return results;
}

/**
 * Обогатить набор задач Recipient/SCNumber через fan-out к RelatedItems-элементам.
 * Concurrency ограничен `concurrency` (по умолчанию 5) — чтобы не заспамить SP.
 *
 * @param {Array} mapped массив наших Task
 * @param {{ concurrency?: number, onProgress?: (done:number, total:number) => void }} [opts]
 * @returns {Promise<{ recipientMap: Map<number,string>, scNumberMap: Map<number,string> }>}
 */
export async function enrichTasksWithRelated(mapped, opts = {}) {
  const { concurrency = 5, useBatch = true } = opts;
  const tasks = needsEnrichment(mapped);
  const recipientMap = new Map();
  const scNumberMap = new Map();
  const thuMap = new Map();
  if (tasks.length === 0) return { recipientMap, scNumberMap, thuMap };

  // Батч-режим: один GET с $filter=(Id eq 1) or ... вместо 5 параллельных на каждую задачу
  if (useBatch) {
    try {
      const groups = groupByListId(tasks);
      if (groups.size === 0) return { recipientMap, scNumberMap, thuMap };
      // Map ItemId -> raw data
      const itemById = new Map(); // `${listId}:${id}` -> data
      for (const [listId, g] of groups.entries()) {
        const raws = await fetchRelatedBatch(listId, g.itemIds);
        for (const r of raws) {
          if (r && r.Id != null) itemById.set(`${listId}:${r.Id}`, r);
          // Fallback where Id may be missing but we have data
          if (r && !r.Id && r.Title) {
            // try to keep without Id? skip
          }
        }
      }
      for (const tsk of tasks) {
        try {
          const related = parseRelatedItems(tsk.RelatedItems);
          if (!Array.isArray(related) || related.length===0) continue;
          const first = related[0];
          const listIdRaw = first.ListId || first.listId;
          const itemId = first.ItemId || first.itemId || first.ItemID;
          if (!listIdRaw || !itemId) continue;
          const listId = String(listIdRaw).replace(/[{}]/g, "");
          const key = `${listId}:${Number(itemId)}`;
          let d = itemById.get(key);
          // если не нашли в батче (например, разные кейсы), пробуем одиночный фолбэк
          if (!d) {
            d = await fetchRelatedElement(listId, itemId);
          }
          const res = extractRecipientAndSC(d);
          if (res) {
            if (res.recipient) recipientMap.set(tsk.Id, res.recipient);
            if (res.scNumber) scNumberMap.set(tsk.Id, res.scNumber);
            if (res.thu) thuMap.set(tsk.Id, res.thu);
          }
        } catch {}
      }
      return { recipientMap, scNumberMap, thuMap };
    } catch (e) {
      console.warn("[enrich] batch failed, fallback to fan-out", e?.message);
      // fallback to fan-out
    }
  }

  const results = await runWithConcurrency(tasks, concurrency, async (t) => {
    const res = await fetchRecipientForTask(t);
    return { id: t.Id, res };
  });

  for (const r of results) {
    if (!r || !r.res || typeof r.res !== "object") continue;
    if (r.res.recipient) recipientMap.set(r.id, r.res.recipient);
    if (r.res.scNumber) scNumberMap.set(r.id, r.res.scNumber);
    if (r.res.thu) thuMap.set(r.id, r.res.thu);
  }
  return { recipientMap, scNumberMap, thuMap };
}