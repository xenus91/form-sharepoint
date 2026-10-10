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
 * Timestamp для сортировки: сначала запрошенное поле (в шапке строки или в raw),
 * затем фолбэк Created → Modified. У строк сайтов-источников нужного поля может
 * не быть вовсе — тогда лучше сортировать по тому, что приехало, чем сваливать
 * задачу в конец списка.
 * @param {any} item
 * @param {string} orderByField
 * @returns {number|null}
 */
function sortTimeOf(item, orderByField) {
  const candidates = [
    item?.[orderByField], item?.raw?.[orderByField],
    item?.Created, item?.raw?.Created,
    item?.Modified, item?.raw?.Modified,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const t = c instanceof Date ? c.getTime() : Date.parse(c);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/**
 * Стабильный tiebreak при равных датах: сначала числовой Id (в SharePoint он
 * растёт вместе с временем создания), затем compositeId.
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function mergeTiebreak(a, b) {
  const aId = Number(a?.Id);
  const bId = Number(b?.Id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
  const aKey = a?.compositeId ?? String(a?.Id ?? "");
  const bKey = b?.compositeId ?? String(b?.Id ?? "");
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

/**
 * Детерминированная сортировка после слияния.
 *
 * По умолчанию — Created ASC: список задач читается «от самых старых к самым
 * новым» (требование 2026-10-10). Именно Created, а не Modified: когда задачу
 * берут в работу, SharePoint обновляет Modified, и при Modified desc карточка
 * улетала в самый верх списка.
 *
 * Строки, у которых дату определить не удалось, всегда в конце — и при asc, и
 * при desc (иначе они прыгали бы из конца в начало при смене направления).
 *
 * @param {Array<any>} items
 * @param {string} [orderByField="Created"]
 * @param {"asc"|"desc"} [dir="asc"]
 */
export function mergeSort(items, orderByField = "Created", dir = "asc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const aN = sortTimeOf(a, orderByField);
    const bN = sortTimeOf(b, orderByField);
    if (aN === null && bN === null) return mergeTiebreak(a, b);
    if (aN === null) return 1;
    if (bN === null) return -1;
    if (aN !== bN) return (aN - bN) * sign;
    return mergeTiebreak(a, b);
  });
}

/**
 * Приводит значение к массиву уникальных положительных Id.
 * @param {any} value
 * @returns {number[]}
 */
export function toIdList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out = [];
  for (const v of arr) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return [...new Set(out)];
}

/**
 * Собирает AssignedToId-фильтр для одного источника.
 *
 * Требование: в #tasks должны находиться ВСЕ задачи пользователя и групп из DcEmail.
 *   • userId  — Id текущего пользователя НА ЭТОМ сайте (resolveSourceIdentity);
 *   • principalIds — Id групп/пользователей из DcEmail, срезолвленные на этом сайте;
 *   • nativePrincipalIds — «родные» Id из DcEmail.Email. Для основного сайта это и
 *     есть Id принципалов (поле — Person-or-Group на этом же сайте), поэтому
 *     добавляем их напрямую: даже если резолв по email/Title не удался,
 *     задачи группы не потеряются.
 *
 * @param {{id:string, clientKind?:string}} source
 * @param {{userId?:number|null, principalIds?:number[]}|null} identity
 * @param {{nativePrincipalIds?:number[], assignedIdsBySource?:{[k:string]:number[]}}} [opts]
 * @returns {number[]}
 */
export function computeAssignedIds(source, identity, opts = {}) {
  const bySource = opts.assignedIdsBySource || {};
  const override = bySource[source?.id];
  if (Array.isArray(override)) return toIdList(override);
  const ids = [];
  if (identity?.userId != null) ids.push(identity.userId);
  for (const p of identity?.principalIds || []) ids.push(p);
  const isMain = source?.clientKind === "main" || source?.id === "main";
  if (isMain) {
    for (const id of toIdList(opts.nativePrincipalIds)) ids.push(id);
  }
  return toIdList(ids);
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
 *   sourceFieldsById?: {[sourceId:string]:string[]}    — per-source fields
 *   sitePrincipalIds?: {[sourceId:string]:{userId:number|null, principalIds:number[], ok:boolean}}
 *     — per-source identity, предварительно резолвлено
 *     (useEnrichDistributionForSources). Если передано — используется
 *     вместо resolveSourceIdentity() на лету.
 *   nativePrincipalIds?: number[]  — «родные» Id принципалов из DcEmail.Email
 *     (Id основного сайта). Для источника main добавляются в AssignedToId-фильтр
 *     напрямую — страховка, что задачи групп найдутся даже без резолва по email.
 *   assignedIdsBySource?: {[sourceId:string]: number[]} — явный override фильтра
 *   omitResultFields?: boolean (default true) — не запрашивать поля результата
 *     (табличный режим: результат-поля не отображаются и на dob их нет → 400).
 * }} opts
 * @returns {Promise<{items:Array<any>, errors:Array<{sourceId:string,status:number|string,message:string}>, perSourceStats:object}>}
 */
export async function fetchTasksMultiSource(opts) {
  const sources = (opts.sources || []).filter((s) => s && s.enabled !== false);
  const principals = opts.principals || (opts.distribution ? listDistributionPrincipals(opts.distribution) : []);

  // Per-source подготовка полей. Caller может передать opts.sourceFields[sourceId]
  // (готовый кэш), либо мы используем opts.taskFieldNames как fallback (для main).
  // Для источников без готового списка полей — fallback на переданный общий taskFieldNames.
  const sourceFieldsById = opts.sourceFieldsById || {};

  const perSourceStats = {};
  const errors = [];
  if (sources.length === 0) {
    return { items: [], errors, perSourceStats };
  }

  // Шаг 1: per-source resolve identity. Используем opts.sitePrincipalIds если есть
  // (предварительно резолвлено через useEnrichDistributionForSources), иначе —
  // резолвим на лету через resolveSourceIdentity().
  const preResolved = opts.sitePrincipalIds || {};

  const identityTasks = sources.map(async (source) => {
    if (preResolved[source.id]) {
      const r = preResolved[source.id];
      // Приводим к формату resolveSourceIdentity
      const identity = {
        userId: r.userId,
        principalIds: r.principalIds || [],
        unresolved: r.unresolved || [],
        ok: !!r.ok,
        reason: r.reason || null,
      };
      perSourceStats[source.id] = { identity };
      return { source, identity };
    }
    const identity = await resolveSourceIdentity(source, principals);
    perSourceStats[source.id] = { identity };
    return { source, identity };
  });
  const identityResults = await Promise.allSettled(identityTasks);

  // Шаг 2: per-source fetch (параллельно, Promise.allSettled)
  const fetchTasks2 = sources.map(async (source, idx) => {
    const ident = identityResults[idx];
    if (ident.status === "rejected") {
      const reason = ident.reason;
      throw { sourceId: source.id, status: reason?.response?.status || "identity-rejected", message: String(reason?.message || reason) };
    }
    const identity = ident.value.identity;
    const client = makeSourceClient(source);
    const isMain = source.clientKind === "main" || source.id === "main";
    const assignedIds = computeAssignedIds(source, identity, {
      nativePrincipalIds: opts.nativePrincipalIds,
      assignedIdsBySource: opts.assignedIdsBySource,
    });

    perSourceStats[source.id].assignedIds = assignedIds;
    perSourceStats[source.id].assignedIdsCount = assignedIds.length;

    if (assignedIds.length === 0) {
      // На источнике не срезолвился ни один Id — пропускаем с пометкой
      perSourceStats[source.id].skipped = "no-ids-resolved";
      return [];
    }

    // Per-source fields: prefer pre-fetched, fallback to opts.taskFieldNames
    const fieldsForSource = sourceFieldsById[source.id] || opts.taskFieldNames || [];

    // Per-source recipientField / scNumberField / resultFieldInternalNames.
    // Для источника main используем opts (там поля могут существовать).
    // Для dob (или любого другого) — обнуляем расширенные поля, чтобы не
    // запрашивать несуществующие (ResultSearchTHU, AdditionalsActionsRequired, ...)
    // и не ловить 400. Если они есть на этом источнике — caller должен передать
    // их через opts.sourceExtraFieldsById[sourceId].
    const recipientField = isMain ? opts.recipientField : null;
    const scNumberField = isMain ? opts.scNumberField : null;
    // Результат-поля в multi-source выборке по умолчанию НЕ запрашиваем
    // (табличный режим их не показывает, на dob их нет). См. omitResultFields.
    const omitResultFields = opts.omitResultFields !== false;
    const resultFieldInternalNames = (isMain && !omitResultFields) ? (opts.resultFieldInternalNames || []) : [];

    try {
      const rows = await fetchTasksForSource(source, client, {
        currentUserId: identity?.userId ?? null,
        distribution: opts.distribution,
        taskFieldNames: fieldsForSource,
        recipientField,
        scNumberField,
        resultFieldInternalNames,
        assignedIds,
        // Внешние источники (dob) — консервативный select: только поля,
        // которые реально есть в списке (иначе 400 «Столбец не существует»).
        selectProfile: isMain ? "main" : "external",
      });
      // К каждой строке приклеиваем compositeId + sourceId (+ label для UI-бейджа)
      for (const r of rows) {
        r.compositeId = compositeId(source.id, r.Id);
        r.sourceId = source.id;
        r.sourceLabel = source.label || source.id;
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
      const reason = r.reason || {};
      errors.push(reason);
      // Пометка в perSourceStats, чтобы UI мог показать «часть источников недоступна»
      // вместе с причинами (TasksView читает perSourceStats[id].error).
      if (reason.sourceId) {
        perSourceStats[reason.sourceId] = {
          ...(perSourceStats[reason.sourceId] || {}),
          error: { status: reason.status ?? "fetch-error", message: reason.message || "unknown" },
        };
      }
    }
  }

  if (all.length === 0 && errors.length === sources.length) {
    // Все источники упали — лог в консоль для отладки, но НЕ throw,
    // чтобы UI мог показать частичные данные (errors) и пустую таблицу,
    // а не "All N task sources failed" поверх.
    if (typeof window !== "undefined" && window.localStorage?.getItem("dbg_tasks") === "1") {
      // eslint-disable-next-line no-console
      console.warn(`[multiSource] all ${sources.length} sources failed`, errors.map((e) => ({sourceId: e.sourceId, status: e.status, msg: e.message?.slice(0, 200)})));
    }
  }

  return {
    // По умолчанию — от самых старых к самым новым (Created asc).
    items: mergeSort(all, "Created", "asc"),
    errors,
    perSourceStats,
  };
}