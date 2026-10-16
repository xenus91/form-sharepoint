// src/tasks/mutations/updateTaskResult.js
// Запись результата в правильный список-владелец через per-source client.
// План: см. artifacts/plan.md (этап 8).

import { parseCompositeId } from "../multiSource";
import { getSourceById } from "../sources";
import { makeSourceClient } from "../sourceClient";

/**
 * @typedef {object} UpdateTaskResultPayload
 * @property {string} [Status="Завершена"]
 * @property {number} [PercentComplete=1]
 * @property {string|null} [resultField] — InternalName поля результата
 * @property {any} [resultValue]
 * @property {string|null} [ResultSearchTHU]
 * @property {string|null} [Location1]
 * @property {boolean} [AdditionalsActionsRequired]
 * @property {string[]} [AdditionalActions]
 */

/**
 * @param {string} compositeKey — "<sourceId>:<id>"
 * @param {UpdateTaskResultPayload} payload
 * @returns {Promise<{ok:boolean, sourceId:string, id:number, status:number, body?:any}>}
 */
export async function updateTaskResult(compositeKey, payload = {}) {
  const parsed = parseCompositeId(compositeKey);
  if (!parsed) throw new Error(`[updateTaskResult] invalid compositeId: ${compositeKey}`);
  const source = getSourceById(parsed.sourceId);
  if (!source) throw new Error(`[updateTaskResult] unknown source: ${parsed.sourceId}`);
  const client = makeSourceClient(source);
  const listApi = typeof client.listApi === "function" ? await client.listApi() : "";
  // listApi — путь относительно api-base источника; приводим к request-ready виду
  // (main: без префикса — его добавит axios; dob: /dob-api/sites/dob/doblogistic/_api/…)
  const url = typeof client.toRequestUrl === "function"
    ? client.toRequestUrl(`${listApi}/items(${parsed.id})`)
    : `${listApi}/items(${parsed.id})`;

  const body = {
    Status: payload.Status || "Завершена",
    PercentComplete: payload.PercentComplete ?? 1,
  };
  if (payload.resultField && payload.resultValue != null) {
    body[payload.resultField] = payload.resultValue;
  }
  if (payload.ResultSearchTHU != null) body.ResultSearchTHU = payload.ResultSearchTHU;
  if (payload.Location1 != null) body.Location1 = payload.Location1;
  if (payload.AdditionalsActionsRequired != null) body.AdditionalsActionsRequired = payload.AdditionalsActionsRequired;
  if (payload.AdditionalActions != null) body.AdditionalActions = payload.AdditionalActions;

  try {
    const resp = await client.merge(url, body, {
      headers: { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" },
    });
    return {
      ok: true,
      sourceId: parsed.sourceId,
      id: parsed.id,
      status: resp?.status || 200,
      body: resp?.data,
    };
  } catch (e) {
    const status = e?.response?.status || 0;
    const message = String(e?.response?.data?.error?.message?.value || e?.message || e);
    return {
      ok: false,
      sourceId: parsed.sourceId,
      id: parsed.id,
      status,
      body: e?.response?.data,
      message,
    };
  }
}