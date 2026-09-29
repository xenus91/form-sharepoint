// TaskBehaviour: единственная загрузка конфигурации, sessionStorage-кэш и CT.Name → Title resolver.
import { parseBehaviour, resolveBehaviour } from "./behaviourParser";
import { parseStyling } from "./stylingConfig";

const LIST_TITLE = "TaskBehaviour";
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "sp:taskBehaviour:map:v2";
const STORAGE_AT = "sp:taskBehaviour:at:v2";
const FIELD_SELECT = "Id,Title,Description,Behaviour,StylingResultButton,StylingActions,Enabled,Modified";
const debugEnabled = () => {
  try { return typeof window !== "undefined" && (new URLSearchParams(location.search).get("dbg") === "1" || localStorage.getItem("dbg_tasks") === "1"); } catch { return false; }
};
const tbDebug = (...args) => { if (debugEnabled()) console.info("[TaskBehaviour]", ...args); };

let cache = null;
let cacheAt = 0;
let inflight = null;

function getStorage() { try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; } }
function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  const valueNorm = String(value).trim().toLowerCase();
  if (["да", "true", "yes"].includes(valueNorm)) return true;
  if (["нет", "false", "no"].includes(valueNorm)) return false;
  return fallback;
}
function normaliseRecord(raw) {
  if (!raw || raw.Id == null) return null;
  return {
    id: Number(raw.Id),
    title: String(raw.Title || "").trim(),
    description: String(raw.Description || "").trim(),
    behaviour: String(raw.Behaviour || ""),
    styling: String(raw.StylingResultButton || ""),
    stylingActions: String(raw.StylingActions || ""),
    enabled: parseBool(raw.Enabled, true),
    modified: String(raw.Modified || ""),
  };
}
function loadFromStorage() {
  try {
    const store = getStorage();
    const at = Number(store?.getItem(STORAGE_AT) || 0);
    const saved = JSON.parse(store?.getItem(STORAGE_KEY) || "null");
    if (!saved || !at || Date.now() - at >= CACHE_TTL_MS || !Array.isArray(saved.records)) return false;
    cache = new Map(saved.records.map((record) => [record.id, record]));
    cacheAt = at;
    return true;
  } catch { return false; }
}
function saveToStorage() {
  try {
    const store = getStorage();
    if (!store || !cache) return;
    store.setItem(STORAGE_KEY, JSON.stringify({ records: [...cache.values()] }));
    store.setItem(STORAGE_AT, String(cacheAt));
  } catch {}
}

/** Получает активные записи одним запросом и сохраняет полный ответ в sessionStorage. */
export async function fetchTaskBehaviour(apiClient, { forceRefresh = false } = {}) {
  if (!forceRefresh && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  if (!forceRefresh && loadFromStorage()) return cache;
  if (!forceRefresh && inflight) return inflight;

  const request = (async () => {
    const url = `/web/lists/getbytitle('${LIST_TITLE}')/items?$filter=Enabled eq 1&$select=${FIELD_SELECT}&$top=500`;
    try {
      const { data } = await apiClient.get(url, {
        headers: { Accept: "application/json;odata=verbose" },
        __noCache: forceRefresh,
      });
      const records = (data?.d?.results || []).map(normaliseRecord).filter(Boolean);
      cache = new Map(records.map((record) => [record.id, record]));
      cacheAt = Date.now();
      saveToStorage();
      tbDebug("loaded", { request: url, count: cache.size, cache: "sessionStorage", fields: FIELD_SELECT });
      return cache;
    } catch (error) {
      tbDebug("request failed", { status: error?.response?.status, message: error?.message });
      if (cache) return cache;
      cache = new Map();
      cacheAt = Date.now();
      return cache;
    }
  })();
  if (!forceRefresh) inflight = request;
  try { return await request; } finally { if (!forceRefresh) inflight = null; }
}
export function clearTaskBehaviourCache() {
  cache = null; cacheAt = 0; inflight = null;
  try { getStorage()?.removeItem(STORAGE_KEY); getStorage()?.removeItem(STORAGE_AT); } catch {}
}
export function getTaskBehaviourDebug() { return { size: cache?.size || 0, age_ms: cacheAt ? Date.now() - cacheAt : null, cached: !!cache }; }
function norm(value) { return String(value || "").trim().toLowerCase(); }

// ── «Мягкое» сравнение названий ──────────────────────────────────────────────────
// В SharePoint имя типа контента и Title записи часто расходятся морфологией:
//   ContentType.Name  = «Исправление проблемной ЕО»
//   TaskBehaviour.Title = «Задача исправления проблемной ЕО»
// Простое вхождение подстроки тут не работает («исправление» ≠ «исправления»),
// поэтому сравниваем наборы основ слов.
function stemTokens(value) {
  const words = (norm(value).match(/[a-z\u0430-\u044f\u04510-9]+/gi) || []).filter((w) => w.length >= 2);
  // грубая основа: обрезаем окончание у длинных слов
  return new Set(words.map((w) => (w.length > 6 ? w.slice(0, w.length - 2) : w)));
}
/** true, если названия «почти одинаковые»: все основы одного входят в другое и разница не более одного слова. */
function namesLookSame(a, b) {
  const sa = stemTokens(a);
  const sb = stemTokens(b);
  if (sa.size < 2 || sb.size < 2) return false;
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  if (big.size - small.size > 1) return false;
  for (const token of small) if (!big.has(token)) return false;
  return true;
}
const warnedPartial = new Set();

// Записи с таким Title считаются «общими»: они применяются к любому типу контента,
// у которого нет собственной записи в TaskBehaviour.
const FALLBACK_TITLES = new Set(["*", "_default", "default"]);

export function resolveTaskBehaviourByName(contentTypeName, taskBehaviourMap) {
  if (!contentTypeName || !taskBehaviourMap?.size) return null;
  const records = [...taskBehaviourMap.values()].filter((item) => item.enabled);
  // 1) точное совпадение ContentType.Name → TaskBehaviour.Title
  let record = records.find((item) => norm(item.title) === norm(contentTypeName));
  let matchedBy = "ContentType.Name → TaskBehaviour.Title";
  // 2) частичное совпадение: названия входят друг в друга.
  //    Пример: тип контента «Исправление проблемной ЕО», запись «Задача исправления проблемной ЕО».
  //    Берём самую длинную подходящую запись (самую специфичную).
  if (!record) {
    const partial = records
      .filter((item) => {
        const title = norm(item.title);
        if (!title || FALLBACK_TITLES.has(title)) return false;
        return namesLookSame(title, contentTypeName);
      })
      .sort((a, b) => norm(b.title).length - norm(a.title).length);
    if (partial.length) {
      record = partial[0];
      matchedBy = "ContentType.Name ⇄ TaskBehaviour.Title (частичное совпадение)";
      const warnKey = `${norm(contentTypeName)}::${record.id}`;
      if (!warnedPartial.has(warnKey)) {
        warnedPartial.add(warnKey);
        // Видно в консоли без ?dbg=1 — рекомендуем сделать названия одинаковыми.
        console.warn(
          `[TaskBehaviour] тип контента «${contentTypeName}» найден по частичному совпадению с записью «${record.title}». ` +
          `Рекомендуется переименовать запись TaskBehaviour в точное имя типа контента: «${contentTypeName}».`
        );
      }
    }
  }
  // 3) общая запись («*» / «_default») — если своей у типа контента нет
  if (!record) {
    record = records.find((item) => FALLBACK_TITLES.has(norm(item.title)));
    matchedBy = "TaskBehaviour fallback ('*' / '_default')";
    if (record) tbDebug("fallback used", { contentTypeName, fallbackTitle: record.title, id: record.id });
  }
  if (!record) {
    tbDebug("not resolved", { contentTypeName, available: records.map((r) => r.title) });
    return null;
  }
  const behaviour = parseBehaviour(record.behaviour);
  const styling = parseStyling(record.styling);
  const stylingActions = parseStyling(record.stylingActions);
  // ⚠️ Ошибку разбора пишем ВСЕГДА: невалидный JSON молча отключает всё поведение
  // (задача завершается по нажатию, без подтверждений и анимаций) — это очень похоже
  // на «код не работает», хотя причина в тексте конфига.
  if (!behaviour.ok) {
    console.warn("[TaskBehaviour] Behaviour не разобран — настройки НЕ применяются", {
      title: record.title,
      id: record.id,
      error: behaviour.error,
      raw: String(record.behaviour || "").slice(0, 400),
    });
  }
  if (!styling.ok) console.warn("[TaskBehaviour] StylingResultButton не разобран", { title: record.title, error: styling.error });
  if (!stylingActions.ok) console.warn("[TaskBehaviour] StylingActions не разобран", { title: record.title, error: stylingActions.error });
  tbDebug("resolved", { contentTypeName, title: record.title, id: record.id, matchedBy, behaviourOk: behaviour.ok, stylingOk: styling.ok, stylingActionsOk: stylingActions.ok });
  return { configId: record.id, raw: record, behaviour, styling, stylingActions, matchedBy };
}

export function findContentTypeMeta(contentTypeId, ctMetaMap) {
  if (!contentTypeId || !ctMetaMap?.size) return null;
  const target = norm(contentTypeId);
  let best = null;
  let bestLength = -1;
  for (const [key, value] of ctMetaMap.entries()) {
    const candidate = norm(key);
    if ((target === candidate || target.startsWith(candidate)) && candidate.length > bestLength) {
      best = value; bestLength = candidate.length;
    }
  }
  return best;
}

/**
 * Правило Behaviour для конкретной задачи и выбранного результата.
 * Единая точка входа, чтобы TasksView и TaskCard считали правила одинаково.
 *
 * @param {object} task — наша задача (нужен ContentTypeId/contentTypeId)
 * @param {string} choiceValue — выбранное значение Result-поля
 * @param {object|null} config — taskConfiguration.data ({ taskBehaviour, ctMetaMap })
 * @returns {object|null} результат resolveBehaviour() или null, если записи/правила нет
 */
export function resolveTaskRule(task, choiceValue, config) {
  const ctId = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
  if (!ctId || !config?.taskBehaviour || !config?.ctMetaMap) return null;
  const ctMeta = findContentTypeMeta(ctId, config.ctMetaMap);
  if (!ctMeta?.name) return null;
  const tb = resolveTaskBehaviourByName(ctMeta.name, config.taskBehaviour);
  if (!tb || !tb.behaviour || !tb.behaviour.ok) return null;
  return resolveBehaviour(choiceValue, tb.behaviour.value);
}

export function resolveTaskBehaviour(contentType, taskBehaviourMap) { return null; }
export const TASK_BEHAVIOUR_LIST_TITLE = LIST_TITLE;

// Удобная диагностика без автоматических запросов: await window.__debugTaskBehaviour().
if (typeof window !== "undefined") {
  window.__debugTaskBehaviour = () => getTaskBehaviourDebug();
  window.__taskBehaviourForceRefresh = async (client) => {
    clearTaskBehaviourCache();
    const api = client || (await import("../api/sharepoint/client.js").then((module) => module.default).catch(() => null));
    return api ? fetchTaskBehaviour(api, { forceRefresh: true }) : null;
  };
}
