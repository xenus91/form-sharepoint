// src/tasks/resultField.js
// Динамическое определение поля результата задачи по TypeDisplayName / TypeShortDescription
// и кэш по ContentType. Позволяет не хардкодить InternalName ResultSearchTHU.

import { TASKS_LIST_API } from "./config";

export const RESULT_FIELD_TYPE_DISPLAY_NAME = "Результирующий выбор";
export const RESULT_FIELD_SHORT_DESC = "Результат задачи";

// In-memory кэш — результаты меняются редко, кэшируем надолго
let _resultFieldsCache = null; // Array<{ internalName, title, choices, id, stringId }>
let _resultFieldsCacheAt = 0;
let _ctMapCache = null; // Map<string CtStringId -> fieldMeta>
let _ctMapCacheAt = 0;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней — поле результата меняется
                                          // крайне редко (новый ContentType админы
                                          // создают раз в месяцы). Если нужно
                                          // сбросить — clearResultFieldsCache().
const STORAGE_KEY_FIELDS = "sp:resultFields:meta";
const STORAGE_KEY_CTMAP = "sp:resultFields:ctMap";

// Универсальный сторадж: localStorage для долгого кэша, fallback на sessionStorage
function getStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {}
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {}
  return null;
}

function loadFromStorage() {
  try {
    const storage = getStorage();
    if (!storage) return;
    const rawF = storage.getItem(STORAGE_KEY_FIELDS);
    const rawC = storage.getItem(STORAGE_KEY_CTMAP);
    if (rawF) {
      const parsed = JSON.parse(rawF);
      if (Array.isArray(parsed.fields) && parsed.at) {
        // Check TTL
        if (Date.now() - parsed.at < CACHE_TTL_MS) {
          _resultFieldsCache = parsed.fields;
          _resultFieldsCacheAt = parsed.at;
        }
      }
    }
    if (rawC) {
      const parsed = JSON.parse(rawC);
      if (parsed.map && parsed.at) {
        if (Date.now() - parsed.at < CACHE_TTL_MS) {
          // Map serialized as array of entries
          _ctMapCache = new Map(parsed.map);
          _ctMapCacheAt = parsed.at;
        }
      }
    }
  } catch {}
}

function saveToStorage() {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (_resultFieldsCache) {
      storage.setItem(STORAGE_KEY_FIELDS, JSON.stringify({ fields: _resultFieldsCache, at: _resultFieldsCacheAt }));
    }
    if (_ctMapCache) {
      storage.setItem(STORAGE_KEY_CTMAP, JSON.stringify({ map: Array.from(_ctMapCache.entries()), at: _ctMapCacheAt }));
    }
  } catch {}
}

// Нормализация строки для сравнения
function norm(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Получить все поля списка, у которых TypeDisplayName === "Результирующий выбор" и
 * TypeShortDescription === "Результат задачи".
 * Кэшируется в памяти + localStorage на 24 часа (редкие изменения).
 * @param {import('axios').AxiosInstance} apiClient
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Array<{ internalName:string, title:string, choices:string[], id:string, stringId:string, typeDisplayName:string, shortDesc:string }>>}
 */
export async function fetchResultFieldsMeta(apiClient, opts = {}) {
  const { forceRefresh = false } = opts;
  loadFromStorage();
  if (!forceRefresh && _resultFieldsCache && Date.now() - _resultFieldsCacheAt < CACHE_TTL_MS) {
    return _resultFieldsCache;
  }
  // Пробуем серверный фильтр, но если не поддерживается — fallback на все поля с клиентской фильтрацией
  let url = `${TASKS_LIST_API}/fields?$select=InternalName,Title,TypeDisplayName,TypeShortDescription,Choices,Id,StringId,Hidden,ReadOnlyField&$top=200`;
  // Попытка с фильтром (если поддерживается — вернёт уже отфильтрованные)
  // Но TypeDisplayName/TypeShortDescription — текстовые, должны фильтроваться.
  // Чтобы не зависеть от поддержки, делаем fallback.
  try {
    const tryUrl = `${TASKS_LIST_API}/fields?$filter=TypeDisplayName eq '${RESULT_FIELD_TYPE_DISPLAY_NAME}' and TypeShortDescription eq '${RESULT_FIELD_SHORT_DESC}'&$select=InternalName,Title,TypeDisplayName,TypeShortDescription,Choices,Id,StringId&$top=20`;
    const { data } = await apiClient.get(tryUrl, { headers: { Accept: "application/json;odata=verbose" }, __noCache: forceRefresh });
    const results = data?.d?.results || [];
    if (results.length > 0) {
      const mapped = results
        .filter((f) => !f.Hidden)
        .map((f) => ({
          internalName: f.InternalName,
          title: f.Title,
          choices: f.Choices?.results ? [...f.Choices.results] : Array.isArray(f.Choices) ? [...f.Choices] : [],
          id: f.Id,
          stringId: f.StringId || f.Id,
          typeDisplayName: f.TypeDisplayName,
          shortDesc: f.TypeShortDescription,
          raw: f,
        }));
      if (mapped.length > 0) {
        _resultFieldsCache = mapped;
        _resultFieldsCacheAt = Date.now();
        saveToStorage();
        return mapped;
      }
    }
  } catch (e) {
    // fallback to all fields
    console.warn("[resultField] filtered fetch failed, fallback to all", e?.response?.status);
  }

  // Fallback: все поля и клиентская фильтрация
  const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" }, __noCache: forceRefresh });
  const results = data?.d?.results || data?.d || [];
  const all = Array.isArray(results) ? results : [];
  const filtered = all
    .filter((f) => {
      if (f.Hidden) return false;
      const td = norm(f.TypeDisplayName);
      const ts = norm(f.TypeShortDescription);
      return td === norm(RESULT_FIELD_TYPE_DISPLAY_NAME) && ts === norm(RESULT_FIELD_SHORT_DESC);
    })
    .map((f) => ({
      internalName: f.InternalName,
      title: f.Title,
      choices: f.Choices?.results ? [...f.Choices.results].map((v) => String(v).trim()).filter(Boolean) : Array.isArray(f.Choices) ? [...f.Choices].map((v) => String(v).trim()).filter(Boolean) : [],
      id: f.Id,
      stringId: f.StringId || f.Id,
      typeDisplayName: f.TypeDisplayName,
      shortDesc: f.TypeShortDescription,
      raw: f,
    }));

  // Если ничего не нашли — пробуем fallback на старый ResultSearchTHU (для совместимости)
  if (filtered.length === 0) {
    const fallback = all.find((f) => f.InternalName === "ResultSearchTHU");
    if (fallback) {
      const m = {
        internalName: fallback.InternalName,
        title: fallback.Title,
        choices: fallback.Choices?.results ? [...fallback.Choices.results] : Array.isArray(fallback.Choices) ? [...fallback.Choices] : [],
        id: fallback.Id,
        stringId: fallback.StringId || fallback.Id,
        typeDisplayName: fallback.TypeDisplayName,
        shortDesc: fallback.TypeShortDescription,
        raw: fallback,
      };
      _resultFieldsCache = [m];
      _resultFieldsCacheAt = Date.now();
      saveToStorage();
      return [m];
    }
  }

  _resultFieldsCache = filtered;
  _resultFieldsCacheAt = Date.now();
  saveToStorage();
  return filtered;
}

/**
 * Построить карту ContentTypeId.StringId -> fieldMeta для полей результата.
 * Использует /contenttypes?$expand=FieldLinks
 * @param {import('axios').AxiosInstance} apiClient
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Map<string, { internalName, choices, id, title }>>}
 */
export async function fetchContentTypeResultMap(apiClient, opts = {}) {
  const { forceRefresh = false } = opts;
  loadFromStorage();
  if (!forceRefresh && _ctMapCache && Date.now() - _ctMapCacheAt < CACHE_TTL_MS) {
    return _ctMapCache;
  }

  const resultFields = await fetchResultFieldsMeta(apiClient, { forceRefresh });
  if (resultFields.length === 0) {
    _ctMapCache = new Map();
    _ctMapCacheAt = Date.now();
    saveToStorage();
    return _ctMapCache;
  }

  // Если только одно поле — маппим все CT на него (упрощение, когда нет разбивки по CT)
  if (resultFields.length === 1) {
    // Попробуем всё равно получить список CT, чтобы закэшировать все Id -> одно поле
    try {
      const ctUrl = `${TASKS_LIST_API}/contenttypes?$select=Id,StringId,Name&$expand=FieldLinks&$top=50`;
      const { data } = await apiClient.get(ctUrl, { headers: { Accept: "application/json;odata=verbose" }, __noCache: forceRefresh });
      const cts = data?.d?.results || [];
      const map = new Map();
      const fieldIdNorm = norm(resultFields[0].id);
      for (const ct of cts) {
        const ctId = ct.StringId || ct.Id?.StringValue || "";
        // Если у CT есть линк на это поле — маппим, иначе тоже маппим как fallback для упрощения
        map.set(ctId, resultFields[0]);
        // также маппим короткий id для поиска по префиксу
        if (ctId) map.set(ctId, resultFields[0]);
      }
      // Fallback для задач без CT
      map.set("__default", resultFields[0]);
      _ctMapCache = map;
      _ctMapCacheAt = Date.now();
      saveToStorage();
      return map;
    } catch (e) {
      console.warn("[resultField] contenttypes fetch failed, fallback single field", e?.message);
      const map = new Map();
      map.set("__default", resultFields[0]);
      _ctMapCache = map;
      _ctMapCacheAt = Date.now();
      saveToStorage();
      return map;
    }
  }

  // Множество полей — нужно маппить по FieldLinks
  try {
    const ctUrl = `${TASKS_LIST_API}/contenttypes?$select=Id,StringId,Name&$expand=FieldLinks&$top=50`;
    const { data } = await apiClient.get(ctUrl, { headers: { Accept: "application/json;odata=verbose" }, __noCache: forceRefresh });
    const cts = data?.d?.results || [];
    const map = new Map();
    // Для каждого CT ищем какой из resultFields у него есть
    for (const ct of cts) {
      const ctId = ct.StringId || ct.Id?.StringValue || "";
      const links = ct.FieldLinks?.results || ct.FieldLinks || [];
      const linkIds = new Set(links.map((l) => norm(l.Id || l.StringId || "")));
      // Ищем поле, чей Id есть в links
      let matched = null;
      for (const f of resultFields) {
        if (linkIds.has(norm(f.id)) || linkIds.has(norm(f.stringId))) {
          matched = f;
          break;
        }
      }
      if (matched) {
        map.set(ctId, matched);
      }
    }
    // Дефолт — первое поле
    map.set("__default", resultFields[0]);
    _ctMapCache = map;
    _ctMapCacheAt = Date.now();
    saveToStorage();
    return map;
  } catch (e) {
    console.warn("[resultField] ct map failed, fallback merge", e?.message);
    const map = new Map();
    // Merge all choices as fallback? Но лучше первое
    map.set("__default", resultFields[0]);
    _ctMapCache = map;
    _ctMapCacheAt = Date.now();
    saveToStorage();
    return map;
  }
}

/**
 * Для задачи вернуть поле результата (internalName + choices) по её ContentTypeId.
 * Требует, чтобы task.raw.ContentTypeId или task.ContentTypeId был доступен.
 * @param {object} task — объект задачи из mapRawTask (с raw)
 * @param {Map<string, any>} ctMap
 * @param {Array} resultFields
 * @returns {{ internalName:string, choices:string[], fieldId:string, title:string } | null}
 */
export function getResultFieldForTask(task, ctMap, resultFields) {
  if (!task) return null;
  const raw = task.raw || task;
  // ContentTypeId может быть объектом { StringValue: "0x0100..." } или строкой
  let ctId = null;
  if (raw.ContentTypeId) {
    if (typeof raw.ContentTypeId === "string") ctId = raw.ContentTypeId;
    else if (raw.ContentTypeId.StringValue) ctId = raw.ContentTypeId.StringValue;
    else if (raw.ContentTypeId.StringId) ctId = raw.ContentTypeId.StringId;
    else if (raw.ContentTypeId.Id) ctId = raw.ContentTypeId.Id;
  }
  if (!ctId && task.ContentTypeId) {
    if (typeof task.ContentTypeId === "string") ctId = task.ContentTypeId;
    else if (task.ContentTypeId.StringValue) ctId = task.ContentTypeId.StringValue;
  }

  if (ctId && ctMap) {
    // Точное совпадение
    if (ctMap.has(ctId)) return ctMap.get(ctId);
    // Префиксный поиск — ContentTypeId наследуются (дочерний начинается с родительского)
    // Ищем самый длинный префикс
    let best = null;
    let bestLen = -1;
    for (const [key, val] of ctMap.entries()) {
      if (key === "__default") continue;
      if (ctId.startsWith(key) && key.length > bestLen) {
        best = val;
        bestLen = key.length;
      }
    }
    if (best) return best;
  }

  // Fallback: пробуем найти поле, у которого в raw есть значение
  if (resultFields && resultFields.length > 0) {
    for (const f of resultFields) {
      if (raw[f.internalName] != null && String(raw[f.internalName]).trim() !== "") {
        return f;
      }
    }
    // Ещё fallback: поле, чей choices содержит текущее значение ResultSearchTHU
    const curVal = raw.ResultSearchTHU || task.ResultSearchTHU;
    if (curVal) {
      for (const f of resultFields) {
        if (f.choices.includes(String(curVal).trim())) return f;
      }
    }
    return resultFields[0];
  }

  if (ctMap && ctMap.has("__default")) return ctMap.get("__default");
  return null;
}

/**
 * Унифицированный геттер значения результата задачи (динамическое поле).
 * @param {object} task
 * @param {{ internalName:string } | null} fieldMeta
 * @returns {string}
 */
export function getTaskResultValue(task, fieldMeta) {
  if (!task) return "";
  if (fieldMeta && fieldMeta.internalName) {
    const v = task.raw?.[fieldMeta.internalName] ?? task[fieldMeta.internalName] ?? task.ResultSearchTHU ?? "";
    return String(v || "").trim();
  }
  return String(task.ResultSearchTHU || task.raw?.ResultSearchTHU || "").trim();
}

/**
 * Hook для получения choices для открытой задачи с кэшем по ContentType.
 * Использует TanStack Query под капотом, но здесь — простой async с кэшем.
 * Кэширование уже внутри fetchResultFieldsMeta / fetchContentTypeResultMap.
 */
export async function getResultChoicesForTask(apiClient, task, { forceRefresh = false } = {}) {
  const fields = await fetchResultFieldsMeta(apiClient, { forceRefresh });
  const ctMap = await fetchContentTypeResultMap(apiClient, { forceRefresh });
  const field = getResultFieldForTask(task, ctMap, fields);
  if (!field) return { choices: [], internalName: "ResultSearchTHU", field: null };
  return { choices: field.choices || [], internalName: field.internalName, field };
}

export function clearResultFieldCache() {
  _resultFieldsCache = null;
  _ctMapCache = null;
  _resultFieldsCacheAt = 0;
  _ctMapCacheAt = 0;
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(STORAGE_KEY_FIELDS);
      storage.removeItem(STORAGE_KEY_CTMAP);
    }
    // Чистим и fallback
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY_FIELDS);
      sessionStorage.removeItem(STORAGE_KEY_CTMAP);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_FIELDS);
      localStorage.removeItem(STORAGE_KEY_CTMAP);
    }
  } catch {}
}
