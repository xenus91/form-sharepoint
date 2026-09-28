// src/services/behaviourParser.js
// Парсер/валидатор/резолвер компактного JSON `Behaviour` (см. plan §2).
//
// Схема:
//   { "_default": {}, "*": {}, "<ResultValue>": { "p": [...], "c": bool, "aa": bool, "aar": bool } }
//   "p" → promptFields[] = [{ "f": fieldInternalName, "t": "text|multiline|number|choice",
//                              "r": bool, "ti": "title" }]
//
// Без Zod: валидация руками, аккуратные сообщения об ошибках.
// При ошибке парсинга фронт проваливается в legacy-слои (TaskPromptFields и т.д.).

const VALID_TYPES = new Set(["text", "multiline", "number", "choice"]);
const VALID_ANIMATIONS = new Set(["celebrate", "sherlock", "none"]);

/**
 * @typedef {{ internalName:string, type:string, required:boolean, title:string,
 *             sortOrder:number }} PromptFieldDef
 */

/** Нормализация строки-ключа choice. */
function normKey(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Парсит JSON-строку Behaviour → { ok, value, error }.
 * value — нормализованный объект: ключи в lowercase, promptFields развёрнуты в полный формат.
 */
export function parseBehaviour(text) {
  if (text === undefined || text === null || String(text).trim() === "") {
    return { ok: true, value: {} };
  }
  let raw;
  try {
    const cleaned = String(text)
      .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/<br\s*\/?>(\r?\n)?/gi, "\n")
      .replace(/<[^>]+>/g, "").trim();
    raw = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, value: {}, error: `Behaviour: invalid JSON — ${e.message}` };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, value: {}, error: "Behaviour: root must be a JSON object" };
  }
  return validateBehaviour(raw);
}

/**
 * Валидирует уже-распарсенный объект Behaviour, нормализует ключи и promptFields.
 * @returns {{ok:true,value:object}|{ok:false,value:{},error:string}}
 */
export function validateBehaviour(obj) {
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(obj)) {
    const key = normKey(rawKey);
    if (!key) continue;
    if (rawVal === null || typeof rawVal !== "object" || Array.isArray(rawVal)) {
      // Одиночные значения (string/number/bool) игнорируем; объекты-не-правила — пропускаем с warn
      if (typeof window !== "undefined" && window.__DBG_ENABLED__) {
        console.warn(`[behaviourParser] skip key "${rawKey}": not an object`);
      }
      continue;
    }
    const rule = {};

    // p → promptFields[]
    if (rawVal.p !== undefined) {
      if (!Array.isArray(rawVal.p)) {
        return { ok: false, value: {}, error: `Behaviour["${key}"].p must be an array` };
      }
      rule.promptFields = [];
      let sortOrder = 10;
      for (const [idx, pf] of rawVal.p.entries()) {
        if (!pf || typeof pf !== "object") {
          return { ok: false, value: {}, error: `Behaviour["${key}"].p[${idx}] must be an object` };
        }
        const f = String(pf.f || "").trim();
        if (!f) {
          return { ok: false, value: {}, error: `Behaviour["${key}"].p[${idx}].f (internalName) required` };
        }
        const t = normKey(pf.t);
        const type = VALID_TYPES.has(t) ? t : "text";
        const required = pf.r === true || pf.r === 1 || String(pf.r).toLowerCase() === "true";
        const title = pf.ti ? String(pf.ti).trim() : f;
        rule.promptFields.push({ internalName: f, type, required, title, sortOrder: sortOrder + idx });
      }
    }

    // c → requiresConfirmed
    if (rawVal.c !== undefined) {
      rule.requiresConfirmed = rawVal.c === true || rawVal.c === 1 || String(rawVal.c).toLowerCase() === "true";
    }

    // aa → showAdditionalActions
    if (rawVal.aa !== undefined) {
      rule.showAdditionalActions = rawVal.aa === true || rawVal.aa === 1 || String(rawVal.aa).toLowerCase() === "true";
    }

    // aar → additionalActionsRequired
    if (rawVal.aar !== undefined) {
      rule.additionalActionsRequired = rawVal.aar === true || rawVal.aar === 1 || String(rawVal.aar).toLowerCase() === "true";
    }

    // anim → animation при submit (celebrate=зелёная 🎉, sherlock=красная 🕵️, none=без анимации)
    if (rawVal.anim !== undefined) {
      const a = String(rawVal.anim).trim().toLowerCase();
      if (VALID_ANIMATIONS.has(a)) rule.animation = a;
      // unknown values ignored — не падаем, фронт использует flow default
    }

    out[key] = rule;
  }
  return { ok: true, value: out };
}

/**
 * Резолвер Behaviour для конкретного choice. Возвращает нормализованный объект
 * {promptFields, requiresConfirmed, showAdditionalActions, additionalActionsRequired, source}.
 *
 * Приоритеты внутри Behaviour:
 *   1) exact-ключ по нормализованному choice
 *   2) "*" wildcard
 *   3) "_default"
 *   4) пустой объект (ничего не задано)
 *
 * @param {string} choiceValue — значение choice из Result-поля
 * @param {object|null} parsedBehaviour — value из parseBehaviour
 * @returns {{promptFields: PromptFieldDef[], requiresConfirmed: boolean|null,
 *           showAdditionalActions: boolean|null, additionalActionsRequired: boolean|null,
 *           source: string}}
 */
export function resolveBehaviour(choiceValue, parsedBehaviour) {
  const norm = normKey(choiceValue);
  const empty = {
    promptFields: [],
    requiresConfirmed: null,
    showAdditionalActions: null,
    additionalActionsRequired: null,
    animation: null,
    source: "empty",
  };
  if (!parsedBehaviour || typeof parsedBehaviour !== "object") return empty;

  // 1) exact
  let rule = parsedBehaviour[norm];
  let src = "exact";
  // 2) wildcard
  if (!rule && parsedBehaviour["*"]) { rule = parsedBehaviour["*"]; src = "wildcard"; }
  // 3) _default
  if (!rule && parsedBehaviour._default) { rule = parsedBehaviour._default; src = "_default"; }
  if (!rule) return empty;

  return {
    promptFields: Array.isArray(rule.promptFields) ? rule.promptFields : [],
    requiresConfirmed: rule.requiresConfirmed === undefined ? null : !!rule.requiresConfirmed,
    showAdditionalActions: rule.showAdditionalActions === undefined ? null : !!rule.showAdditionalActions,
    additionalActionsRequired: rule.additionalActionsRequired === undefined ? null : !!rule.additionalActionsRequired,
    animation: rule.animation === undefined ? null : rule.animation,
    source: src,
  };
}

/**
 * Помощник: привести promptFields к формату, который ожидает TaskCard (renderPromptFields):
 * { internalName, title, type, required, sortOrder }
 */
export function toRenderPromptFields(parsedRule) {
  return Array.isArray(parsedRule?.promptFields) ? parsedRule.promptFields : [];
}