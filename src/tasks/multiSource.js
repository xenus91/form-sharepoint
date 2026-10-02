// src/tasks/multiSource.js
// Multi-source: parallel fetch от нескольких источников, compositeId, merge.
//
// План: см. artifacts/plan.md (этап 5).

import { makeSourceClient } from "./sourceClient";
import { resolveSourceIdentity } from "./identity";
import { fetchTasksForSource } from "./fetchTasks";
import { listDistributionPrincipals } from "./distribution";

/**
 * Составной идентификатор задачи: "<sourceId>:<id>".
 * Используется в кэше React Query, ключах строк AG Grid, записи результата.
 * @param {string} sourceId
 * @param {number|string} id
 * @returns {string}
 */
export function compositeId(sourceId, id) {
  if (id == null) throw new Error("[compositeId] id required");
  return `${sourceId}:${id}`;
}

/**
 * Обратная функция — split "<sourceId>:<id>" → {sourceId, id} | null.
 * @param {string} key
 * @returns {{sourceId:string, id:number}|null}
 */
export function parseCompositeId(key) {
  if (typeof key !== "string") return null;
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const sourceId = key.slice(0, idx);
  const idStr = key.slice(idx + 1);
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;
  return { sourceId, id };
}

/**
 * Детерминированная сортировка после слияния.
 * По умолчанию — Modified desc; отсутствующий Modified в шапке строки = -Infinity.
 * @param {Array<any>} items
 * @param {string} [orderByField="Modified"]
 * @param {"asc"|"desc"} [dir="desc"]
 */
export function mergeSort(items, orderByField = "Modified", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const aRaw = a?.raw?.[orderByField] ?? a?.[orderByField] ?? null;
    const bRaw = b?.raw?.[orderByField] ?? b?.[orderByField] ?? null;
    const aT = aRaw ? Date.parse(aRaw) : NaN;
    const bT = bRaw ? Date.parse(bRaw) : NaN;
    const aN = Number.isFinite(aT) ? aT : -Infinity;
    const bN = Number.isFinite(bT) ? bT : -Infinity;
    if (aN !== bN) return (aN - bN) * sign;
    // стабильный tiebreak по compositeId (или Id+sourceId)
    const aKey = a?.compositeId ?? String(a?.Id ?? "");
    const bKey = b?.compositeId ?? String(b?.Id ?? "");
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

/**
 * Параллельная загрузка задач от нескольких источников.
 * Каждому источнику — свой resolveSourceIdentity + fetchTasksForSource.
 * Частичная деградация: если часть источников упала — возвращаем остальные + errors[].
 * Если упали все — throw MultiSourceError.
 *
 * @param {{
 *   sources: Array<{id:string, clientKind:"main"|"dob", listApi?:string|null, enabled?:boolean}>,
 *   principals?: Array<any>,
 *   taskFieldNames?: string[],
 *   recipientField?: string|null,
 *   scNumberField?: string|null,
 *   resultFieldInternalNames?: string[],
 *   distribution?: any,
 *   currentUserId?: number|null,
 *   assignedIds?: number[]|null,
 * }} opts
 * @returns {Promise<{items:Array<any>, errors:Array<{sourceId:string,status:number|string,message:string}>, perSourceStats:object}>}
 */
export async function fetchTasksMultiSource(opts) {
  const sources = (opts.sources || []).filter((s) => s && s.enabled !== false);
  const principals = opts.principals || (opts.distribution ? listDistributionPrincipals(opts.distribution) : []);

  const perSourceStats = {};
  const errors = [];
  if (sources.length === 0) {
    return { items: [], errors, perSourceStats };
  }

  // Шаг 1: per-source resolve identity (параллельно, source-независимо)
  const identityTasks = sources.map(async (source) => {
    const id = await resolveSourceIdentity(source, principals);
    perSourceStats[source.id] = { identity: id };
    return { source, id };
  });
  const identityResults = await Promise.allSettled(identityTasks);

  // Шаг 2: per-source fetch (параллельно, Promise.allSettled)
  const fetchTasks2 = sources.map(async (source, idx) => {
    const ident = identityResults[idx];
    if (ident.status === "rejected") {
      const reason = ident.reason;
      throw { sourceId: source.id, status: reason?.response?.status || "identity-rejected", message: String(reason?.message || reason) };
    }
    const identity = ident.value.id;
    const client = makeSourceClient(source);
    const assignedIds = identity?.principalIds?.length
      ? [...new Set([...(identity.principalIds || []), identity.userId].filter(Number.isFinite))]
      : (identity?.userId != null ? [identity.userId] : []);

    if (assignedIds.length === 0) {
      // На источнике не срезолвился ни один Id — пропускаем с пометкой
      perSourceStats[source.id].skipped = "no-ids-resolved";
      return [];
    }

    try {
      const rows = await fetchTasksForSource(source, client, {
        currentUserId: identity?.userId ?? null,
        distribution: opts.distribution,
        taskFieldNames: opts.taskFieldNames,
        recipientField: opts.recipientField,
        scNumberField: opts.scNumberField,
        resultFieldInternalNames: opts.resultFieldInternalNames,
        assignedIds,
      });
      // К каждой строке приклеиваем compositeId + sourceId
      for (const r of rows) {
        r.compositeId = compositeId(source.id, r.Id);
        r.sourceId = source.id;
      }
      perSourceStats[source.id].fetched = rows.length;
      return rows;
    } catch (e) {
      const status = e?.response?.status || "fetch-error";
      const msg = String(e?.response?.data?.error?.message?.value || e?.message || e);
      throw { sourceId: source.id, status, message: msg };
    }
  });

  const fetchResults = await Promise.allSettled(fetchTasks2);
  let all = [];
  for (const r of fetchResults) {
    if (r.status === "fulfilled") {
      all = all.concat(r.value);
    } else {
      errors.push(r.reason);
    }
  }

  if (all.length === 0 && errors.length === sources.length) {
    const err = new Error(`All ${sources.length} task sources failed`);
    err.code = "MultiSourceError";
    err.errors = errors;
    err.perSourceStats = perSourceStats;
    throw err;
  }

  return {
    items: mergeSort(all),
    errors,
    perSourceStats,
  };
}