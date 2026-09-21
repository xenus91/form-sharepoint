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
 * Обогатить набор задач Recipient/SCNumber через fan-out к RelatedItems-элементам.
 * Concurrency ограничен `concurrency` (по умолчанию 5) — чтобы не заспамить SP.
 *
 * @param {Array} mapped массив наших Task
 * @param {{ concurrency?: number, onProgress?: (done:number, total:number) => void }} [opts]
 * @returns {Promise<{ recipientMap: Map<number,string>, scNumberMap: Map<number,string> }>}
 */
export async function enrichTasksWithRelated(mapped, opts = {}) {
  const { concurrency = 5 } = opts;
  const tasks = needsEnrichment(mapped);
  const recipientMap = new Map();
  const scNumberMap = new Map();
  const thuMap = new Map();
  if (tasks.length === 0) return { recipientMap, scNumberMap, thuMap };

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