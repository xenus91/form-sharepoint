// src/tasks/mutations/takeTaskInWork.js
// Взятие задачи в работу для ЛЮБОГО источника (main/dob/…).
//
// Как это работает на основном сайте (useTaskMutations.handleTakeInWork):
//   MERGE { Status: <статус «в работе»> } — SharePoint сам проставляет Editor
//   (последний изменивший), поэтому «Исполнитель» = Editor, а «Кому назначено»
//   остаётся AssignedTo.
//
// Для внешнего источника (dob, список RequestsTask) вокабуляр статусов другой,
// поэтому целевой статус не хардкодим, а выбираем из choice-поля Status самого
// списка (по маркерам «в работе»/«в процессе»/«выполняется»). Если подходящего
// choice нет — источник может задать его явно: source.inProgressStatus
// (в т.ч. через localStorage["tasks.sources"] = { "dob": { "inProgressStatus": "В работе" } }).

import { parseCompositeId } from "../multiSource";
import { getSourceById } from "../sources";
import { makeSourceClient } from "../sourceClient";
import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from "../status";

// Маркеры статуса «взято в работу» (нижний регистр, в порядке приоритета).
// ВАЖНО: без «начата»/«начато» — иначе «Не начата» ошибочно попадает под маркер.
export const IN_PROGRESS_CHOICE_MARKERS = [
  "в работе",
  "в процессе",
  "выполняется",
  "in progress",
  "принята",
];

/**
 * Выбирает из choice-значений поля Status значение «в работе».
 * Завершающие статусы («Завершена», «Выполнено», «Закрыт») исключаются.
 *
 * @param {string[]} choices
 * @returns {string|null}
 */
export function pickInProgressChoice(choices) {
  if (!Array.isArray(choices)) return null;
  const values = choices.map((c) => String(c)).filter((c) => c.trim());
  const candidates = values.filter(
    (c) => !isCompletedStatus(c, undefined) && !isNotStartedStatus(c)
  );
  for (const marker of IN_PROGRESS_CHOICE_MARKERS) {
    const hit = candidates.find((c) => c.toLowerCase().includes(marker));
    if (hit) return hit;
  }
  return null;
}

/**
 * Читает Choices поля Status у списка источника.
 * @param {import("../sourceClient").SourceClient} client
 * @param {string} listApi
 * @returns {Promise<string[]>}
 */
export async function fetchStatusChoices(client, listApi) {
  const url = client.toRequestUrl(
    `${listApi}/fields?$filter=InternalName eq 'Status'&$select=InternalName,Title,Choices`
  );
  const resp = await client.get(url, { headers: { Accept: "application/json;odata=verbose" } });
  const field = resp?.data?.d?.results?.[0] || resp?.data?.d || null;
  const raw = field?.Choices;
  if (Array.isArray(raw)) return raw.map(String);
  if (Array.isArray(raw?.results)) return raw.results.map(String);
  return [];
}

/**
 * @typedef {object} TakeResult
 * @property {boolean} ok
 * @property {string} [reason] — "already-taken" | "completed" | "no-status-choice" | "error" | "invalid-id"
 * @property {string} [status] — фактический/установленный статус
 * @property {string} [editorTitle]
 * @property {number|null} [editorId]
 * @property {string[]} [choices] — доступные варианты (для reason="no-status-choice")
 * @property {string} [message]
 */

/**
 * Взять задачу в работу на её сайте-владельце.
 *
 * @param {string} compositeKey — "<sourceId>:<id>"
 * @param {{allSources?:Array<any>, targetStatus?:string|null}} [opts]
 * @returns {Promise<TakeResult>}
 */
export async function takeTaskInWork(compositeKey, opts = {}) {
  const parsed = parseCompositeId(compositeKey);
  if (!parsed) return { ok: false, reason: "invalid-id", message: `Некорректный id задачи: ${compositeKey}` };
  const source = (opts.allSources || []).find((s) => s && s.id === parsed.sourceId) || getSourceById(parsed.sourceId);
  if (!source) return { ok: false, reason: "invalid-id", message: `Неизвестный источник: ${parsed.sourceId}` };

  const client = makeSourceClient(source);
  const listApi = typeof client.listApi === "function" ? await client.listApi() : "";
  if (!listApi) return { ok: false, reason: "invalid-id", message: `Не удалось определить список источника ${source.id}` };

  const itemUrl = client.toRequestUrl(`${listApi}/items(${parsed.id})`);
  const accept = { headers: { Accept: "application/json;odata=verbose" } };

  // 1) Свежее состояние: не перетираем чужое взятие/завершение.
  let fresh = {};
  try {
    const resp = await client.get(
      client.toRequestUrl(`${listApi}/items(${parsed.id})?$select=Id,Status,PercentComplete,Modified,Editor/Id,Editor/Title&$expand=Editor`),
      accept
    );
    fresh = resp?.data?.d || {};
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      message: String(e?.response?.data?.error?.message?.value || e?.message || e),
    };
  }
  const currentStatus = fresh.Status || "";
  const editorTitle = fresh.Editor?.Title || "";
  const editorId = fresh.Editor?.Id ?? null;

  if (isCompletedStatus(currentStatus, fresh.PercentComplete)) {
    return { ok: false, reason: "completed", status: currentStatus, editorTitle, editorId };
  }
  if (isInProgressStatus(currentStatus)) {
    return { ok: false, reason: "already-taken", status: currentStatus, editorTitle, editorId };
  }

  // 2) Целевой статус: явный (source/targetStatus) → первый подходящий choice.
  let target = opts.targetStatus || source.inProgressStatus || null;
  let choices = [];
  if (!target) {
    try {
      choices = await fetchStatusChoices(client, listApi);
    } catch (e) {
      choices = [];
    }
    target = pickInProgressChoice(choices);
  }
  if (!target) {
    return {
      ok: false,
      reason: "no-status-choice",
      status: currentStatus,
      editorTitle,
      editorId,
      choices,
      message: choices.length
        ? `В списке нет статуса «в работе». Доступные: ${choices.join(", ")}`
        : "В списке не найден статус «в работе»",
    };
  }

  // 3) MERGE — SharePoint проставит Editor (это и есть «взял в работу»).
  try {
    await client.merge(
      itemUrl,
      { Status: target },
      { headers: { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" } }
    );
  } catch (e) {
    const status = e?.response?.status;
    const message = String(e?.response?.data?.error?.message?.value || e?.message || e);
    if (status === 412) {
      return { ok: false, reason: "already-taken", message, status: currentStatus, editorTitle, editorId };
    }
    return { ok: false, reason: "error", status: currentStatus, message };
  }

  return { ok: true, status: target, previousStatus: currentStatus };
}
