// src/tasks/fieldsMeta.js
// Консолидированный fetcher метаданных полей списка Tasks.
//
// Раньше в TasksView делалось 3 параллельных запроса к /fields
// (getTaskFieldNames, detectRecipientField, detectSCNumberField) —
// все к одному и тому же URL, без in-flight dedup, без общего кэша.
// Сейчас все три обёртки вызывают единый fetcher, который:
//   1) дедуплицирует параллельные вызовы через _inFlight;
//   2) кэширует результат на 10 минут (схема меняется редко);
//   3) расширяет select (Choices/Id/StringId/Hidden) — единый запрос
//      покрывает все три варианта использования + будущие.

import apiClient from "../api";
import { TASKS_LIST_API } from "./config";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут

// Возможные InternalName для поля SCNumber (ТК-номер). Совпадает с тем,
// что было в detectSCNumberField — поведение сохраняем 1-в-1.
const SC_CANDIDATES = [
  "SCNumber",
  "ScNumber",
  "SC_x0020_Number",
  "SCNumber_x0020_",
  "OrderNumber",
  "ТК",
  "SCNo",
];

let _cached = null; // { at, fields, recipientField, scNumberField, taskFieldNames, fieldsByName }
let _inFlight = null; // Promise<_cached> — дедуп параллельных вызовов

function deriveRecipient(fields) {
  let f = fields.find((x) => x.InternalName === "Recipient");
  if (f) return f.InternalName;
  f = fields.find((x) => x.Title && x.Title.toLowerCase().includes("получатель"));
  if (f) return f.InternalName;
  f = fields.find((x) => x.InternalName.toLowerCase().includes("recipient"));
  if (f) return f.InternalName;
  f = fields.find(
    (x) => x.TypeAsString === "Lookup" && x.Title && x.Title.toLowerCase().includes("recipient")
  );
  if (f) return f.InternalName;
  return null;
}

function deriveScNumber(fields) {
  for (const c of SC_CANDIDATES) {
    const f = fields.find((x) => x.InternalName === c || x.InternalName.toLowerCase() === c.toLowerCase());
    if (f) return f.InternalName;
  }
  let f = fields.find((x) => x.Title && /\bSC\b/i.test(x.Title) && x.Title.toLowerCase().includes("number"));
  if (f) return f.InternalName;
  f = fields.find(
    (x) => x.InternalName.toLowerCase().includes("sc") && x.InternalName.toLowerCase().includes("number")
  );
  if (f) return f.InternalName;
  return null;
}

async function loadFresh() {
  const { data } = await apiClient.get(
    `${TASKS_LIST_API}/fields?$select=InternalName,Title,TypeAsString,Choices,Id,StringId,Hidden`,
    { headers: { Accept: "application/json;odata=verbose" } }
  );
  const fields = data?.d?.results || [];
  const fieldsByName = new Map();
  for (const f of fields) {
    if (f?.InternalName) fieldsByName.set(f.InternalName, f);
  }
  return {
    at: Date.now(),
    fields,
    fieldsByName,
    recipientField: deriveRecipient(fields),
    scNumberField: deriveScNumber(fields),
    taskFieldNames: fields.map((f) => f.InternalName).filter(Boolean),
  };
}

/**
 * Возвращает консолидированные метаданные полей списка Tasks.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{
 *   at:number, fields:Array, fieldsByName:Map<string,object>,
 *   recipientField:string|null, scNumberField:string|null, taskFieldNames:string[]
 * }>}
 */
export async function fetchTasksFieldsMeta(opts = {}) {
  const { forceRefresh = false } = opts;
  const now = Date.now();
  if (!forceRefresh && _cached && now - _cached.at < CACHE_TTL_MS) return _cached;
  if (!forceRefresh && _inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const fresh = await loadFresh();
      _cached = fresh;
      return fresh;
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

/**
 * Сбросить кэш (например, после ручного refresh-действия админа).
 */
export function clearTasksFieldsMetaCache() {
  _cached = null;
  _inFlight = null;
}

/**
 * Синхронный геттер последнего кэша (может быть null до первой загрузки).
 * Используется для отображения UI без сетевого вызова.
 */
export function getCachedTasksFieldsMeta() {
  return _cached;
}

// ────────────────────────────────────────────────────────────────────────────
// Обёртки для обратной совместимости со старыми импортами в TasksView/App.
// Каждая из них была раньше отдельным GET /fields?$select=… — теперь все
// они идут через единый fetcher с in-flight dedup и общим кэшем.
// ────────────────────────────────────────────────────────────────────────────

export async function getTaskFieldNames() {
  const meta = await fetchTasksFieldsMeta();
  return meta.taskFieldNames;
}

export async function detectRecipientField() {
  const meta = await fetchTasksFieldsMeta();
  return meta.recipientField;
}

export async function detectSCNumberField() {
  const meta = await fetchTasksFieldsMeta();
  return meta.scNumberField;
}