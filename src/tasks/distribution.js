// src/tasks/distribution.js
// Резолвинг distribution (DcEmail) + определение полей в Tasks list.
// Раньше жили inline в TasksView.jsx на module-scope (~100 строк) —
// вынесены в Tier 3 (Q11).

import apiClient from "../api";
import { TASKS_LIST_API } from "./config";

export const DCEMAIL_LIST_TITLE = "DcEmail";

/**
 * Извлечь group IDs из dist.Email (поле Пользователь/Группа в DcEmail).
 * Поле Email — множественный выбор (Allow Multiple = true), поэтому для одного
 * OffDepKey может быть указано несколько групп. Поддерживаем все формы:
 *  - Email: [{Id:1},{Id:2}] , {results:[{Id:1},{Id:2}]} , {Id:1} , 5
 *  - EmailId: {results:[1,2]} , [1,2] , 5  (без expand)
 *  - Email_x002e_Id и подобные encoded-имена
 * @param {object|null|undefined} dist
 * @returns {number[]}
 */
export function getGroupIdsFromDistribution(dist) {
  if (!dist) return [];
  const extractIds = (val) => {
    if (val == null) return [];
    if (Array.isArray(val)) {
      return val.map((v) => (v != null && typeof v === "object" ? v.Id ?? v : v)).filter((v) => v != null && v !== "").map(Number).filter((n) => !Number.isNaN(n));
    }
    if (typeof val === "object") {
      if (Array.isArray(val.results)) {
        return val.results.map((v) => (v != null && typeof v === "object" ? v.Id ?? v : v)).filter((v) => v != null && v !== "").map(Number).filter((n) => !Number.isNaN(n));
      }
      if (val.Id != null) {
        const n = Number(val.Id);
        return Number.isNaN(n) ? [] : [n];
      }
      // Неexpanded deferred — нет данных
      if (val.__deferred) return [];
    }
    if (typeof val === "number" || typeof val === "string") {
      const n = Number(val);
      return Number.isNaN(n) ? [] : [n];
    }
    return [];
  };

  // 1) Пробуем expanded Email
  if (dist.Email != null) {
    const ids = extractIds(dist.Email);
    if (ids.length) return [...new Set(ids)];
  }
  // 2) Фолбэк на EmailId-колонки (без expand, множественный = {results:[…]})
  for (const key of ["EmailId", "Email_x002e_Id", "Email_x0020_Id", "EMailId", "Email_X002e_Id"]) {
    if (dist[key] != null) {
      const ids = extractIds(dist[key]);
      if (ids.length) return [...new Set(ids)];
    }
  }
  // 3) На всякий — перебираем все ключи, содержащие Email + Id
  for (const k of Object.keys(dist)) {
    if (/email/i.test(k) && /id/i.test(k) && dist[k] != null) {
      const ids = extractIds(dist[k]);
      if (ids.length) return [...new Set(ids)];
    }
  }
  return [];
}

/**
 * Резолвить OffDepKey = Office + Department (слитно) через DcEmail list.
 * Поддерживает локальную смену РЦ: пробует несколько вариантов ключа
 * (full "РЦ-8117Группа…", suffix "8117Группа…", без дефиса и т.д.),
 * чтобы задачи перепоискались при смене РЦ в модалке.
 * Возвращает item из DcEmail или null.
 * @param {string} office
 * @param {string} department
 * @returns {Promise<object|null>}
 */
export async function resolveDistributionViaDcEmail(office, department) {
  if (!office || !department) return null;
  const officeStr = String(office).trim();
  const deptStr = String(department).trim();
  const full = `${officeStr}${deptStr}`;
  const candidates = [full];
  // Варианты для локального РЦ: suffix, "РЦ-XXXX…", без дефиса
  const suffix = officeStr.includes("-") ? officeStr.split("-").pop().trim() : "";
  if (suffix && suffix !== officeStr) {
    const v1 = `${suffix}${deptStr}`;
    if (!candidates.includes(v1)) candidates.push(v1);
    const v2 = `РЦ-${suffix}${deptStr}`;
    if (!candidates.includes(v2)) candidates.push(v2);
    const v3 = officeStr.replace("-", "") + deptStr;
    if (!candidates.includes(v3)) candidates.push(v3);
  }
  // Серверный фильтр — пробуем каждый кандидат по очереди ($top=1)
  for (const offDepKey of candidates) {
    const offDepKeyEsc = offDepKey.replace(/'/g, "''");
    try {
      const { data } = await apiClient.get(
        `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items?$select=Id,OffDepKey,Email/Id&$expand=Email&$filter=OffDepKey eq '${offDepKeyEsc}'&$top=1`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const items = data?.d?.results || [];
      if (items.length) {
        if (offDepKey !== full) console.log(`[DcEmail] resolved via variant "${offDepKey}" (full "${full}")`);
        return items[0];
      }
    } catch {}
  }
  // Фолбэк: ни один точный фильтр не нашёл — тянем 100 и ищем case-insensitive по всем кандидатам
  try {
    const { data: data2 } = await apiClient.get(
      `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items?$select=Id,OffDepKey,Email/Id&$expand=Email&$top=100`,
      { headers: { Accept: "application/json;odata=verbose" } }
    );
    const items2 = data2?.d?.results || [];
    for (const cand of candidates) {
      const norm = cand.trim().toLowerCase();
      const found = items2.find((it) => String(it.OffDepKey || "").trim().toLowerCase() === norm);
      if (found) {
        if (cand !== full) console.log(`[DcEmail] resolved via client fallback variant "${cand}"`);
        return found;
      }
    }
  } catch {}
  // Fallback без expand если Email expand не поддерживается — тоже по кандидатам
  for (const offDepKey of candidates) {
    const offDepKeyEsc = offDepKey.replace(/'/g, "''");
    try {
      const { data } = await apiClient.get(
        `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items?$select=Id,OffDepKey,EmailId&$filter=OffDepKey eq '${offDepKeyEsc}'&$top=1`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const items = data?.d?.results || [];
      if (items.length) return items[0];
    } catch (e2) {
      console.warn("DcEmail resolve failed", e2?.message);
    }
  }
  return null;
}

// --- Single-flight cache for /fields (сливаем 3 параллельных запроса в один) ---
let _fieldsCache = null;
let _fieldsPromise = null;
let _fieldsAt = 0;
const _FIELDS_TTL_MS = 5 * 60 * 1000; // 5 минут — поля списка меняются редко, но кэш не должен протухать слишком долго

async function fetchAllTasksFieldsRaw() {
  const now = Date.now();
  if (_fieldsCache && now - _fieldsAt < _FIELDS_TTL_MS) return _fieldsCache;
  if (_fieldsPromise) return _fieldsPromise;
  _fieldsPromise = (async () => {
    try {
      const { data } = await apiClient.get(
        `${TASKS_LIST_API}/fields?$select=InternalName,Title,TypeAsString`,
        { headers: { Accept: "application/json;odata=verbose" } }
      );
      const fields = data?.d?.results || [];
      _fieldsCache = fields;
      _fieldsAt = Date.now();
      return fields;
    } catch (e) {
      // fallback to cached if available, else empty
      if (_fieldsCache) return _fieldsCache;
      throw e;
    } finally {
      _fieldsPromise = null;
    }
  })();
  return _fieldsPromise;
}

function detectRecipientFromFields(fields) {
  let f = fields.find((x) => x.InternalName === "Recipient");
  if (f) return f.InternalName;
  f = fields.find((x) => x.Title && x.Title.toLowerCase().includes("получатель"));
  if (f) return f.InternalName;
  f = fields.find((x) => x.InternalName.toLowerCase().includes("recipient"));
  if (f) return f.InternalName;
  f = fields.find((x) => x.TypeAsString === "Lookup" && x.Title && x.Title.toLowerCase().includes("recipient"));
  if (f) return f.InternalName;
  return null;
}

function detectSCNumberFromFields(fields) {
  const candidates = ["SCNumber","ScNumber","SC_x0020_Number","SCNumber_x0020_","OrderNumber","ТК","SCNo"];
  for (const c of candidates) {
    const f = fields.find((x) => x.InternalName === c || x.InternalName.toLowerCase() === c.toLowerCase());
    if (f) return f.InternalName;
  }
  let f = fields.find((x) => x.Title && /\bSC\b/i.test(x.Title) && x.Title.toLowerCase().includes("number"));
  if (f) return f.InternalName;
  f = fields.find((x) => x.InternalName.toLowerCase().includes("sc") && x.InternalName.toLowerCase().includes("number"));
  if (f) return f.InternalName;
  return null;
}

/**
 * Одним запросом получить всё: fieldNames + recipientField + scNumberField.
 * Критично для трафика: раньше TasksView делал 3 параллельных GET на один и тот же /fields.
 * @returns {Promise<{ fieldNames:string[], recipientField:string|null, scNumberField:string|null, fields:any[] }>}
 */
export async function getTasksListFieldsOverview() {
  try {
    const fields = await fetchAllTasksFieldsRaw();
    const fieldNames = fields.map((f) => f.InternalName);
    const recipientField = detectRecipientFromFields(fields);
    const scNumberField = detectSCNumberFromFields(fields);
    return { fieldNames, recipientField, scNumberField, fields };
  } catch {
    return { fieldNames: [], recipientField: null, scNumberField: null, fields: [] };
  }
}

export function clearTasksFieldsCache() {
  _fieldsCache = null;
  _fieldsPromise = null;
  _fieldsAt = 0;
}

/**
 * Получить InternalName всех полей в Tasks list (для динамического определения
 * какие поля доступны — Recipient, RelatedItems, WorkflowItemId, OffDepKey и т.д.).
 * @returns {Promise<string[]>}
 */
export async function getTaskFieldNames() {
  try {
    const fields = await fetchAllTasksFieldsRaw();
    return fields.map((f) => f.InternalName);
  } catch {
    return [];
  }
}

/**
 * Определить InternalName поля Recipient в Tasks list.
 * Ищет: "Recipient" → title "получатель" → InternalName "recipient" → Lookup "recipient".
 * @returns {Promise<string|null>}
 */
export async function detectRecipientField() {
  try {
    const fields = await fetchAllTasksFieldsRaw();
    return detectRecipientFromFields(fields);
  } catch {
    return null;
  }
}

/**
 * Определить InternalName поля SCNumber (ТК номер) в Tasks list.
 * Ищет по списку кандидатов + по title содержащему SC + number.
 * @returns {Promise<string|null>}
 */
export async function detectSCNumberField() {
  try {
    const fields = await fetchAllTasksFieldsRaw();
    return detectSCNumberFromFields(fields);
  } catch {
    return null;
  }
}