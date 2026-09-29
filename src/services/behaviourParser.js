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

/**
 * Достаёт первую непустую строку из объекта по списку ключей.
 * @param {object} obj
 * @param {string[]} keys
 * @param {string} _primary — основной ключ (для диагностики)
 * @returns {string}
 */
function pickStr(obj, keys, _primary) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

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
  // Уже распарсенный объект (например, из кэша) — не гоняем через JSON.parse.
  if (typeof text === "object" && !Array.isArray(text) && text !== null) {
    return validateBehaviour(text);
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

    // ic → inlineConfirm: подтверждение двумя кнопками В КАРТОЧКЕ, без диалога.
    // Допустимая альтернативная запись: "c": "inline".
    if (rawVal.ic !== undefined) {
      rule.inlineConfirm = rawVal.ic === true || rawVal.ic === 1 || String(rawVal.ic).toLowerCase() === "true";
    }
    if (typeof rawVal.c === "string" && String(rawVal.c).toLowerCase() === "inline") {
      rule.inlineConfirm = true;
      rule.requiresConfirmed = false;
    }

    // aa → showAdditionalActions
    if (rawVal.aa !== undefined) {
      rule.showAdditionalActions = rawVal.aa === true || rawVal.aa === 1 || String(rawVal.aa).toLowerCase() === "true";
    }

    // aar → additionalActionsRequired
    if (rawVal.aar !== undefined) {
      rule.additionalActionsRequired = rawVal.aar === true || rawVal.aar === 1 || String(rawVal.aar).toLowerCase() === "true";
    }

    // rf → relatedFields: данные из связанного элемента (RelatedItems → ProblemsPallet).
    //   "rf": [ { "f": "THU", "ti": "ЕО" }, { "f": "Recipient/SCNumberText", "ti": "Получатель" } ]
    //   "rf": [ "THU", "DC_THU" ]                        — короткая запись (title = имя поля)
    // Поддерживается выборка lookup-полей через "/": Поле/Подполе (например Recipient/SCNumberText).
    if (rawVal.rf !== undefined || rawVal.relatedFields !== undefined) {
      const rawRf = rawVal.rf !== undefined ? rawVal.rf : rawVal.relatedFields;
      if (!Array.isArray(rawRf)) {
        return { ok: false, value: {}, error: `Behaviour["${key}"].rf must be an array` };
      }
      rule.relatedFields = [];
      for (const [idx, item] of rawRf.entries()) {
        let internalName = "";
        let title = "";
        let zone = "header";
        if (typeof item === "string") {
          internalName = item.trim();
          title = internalName;
        } else if (item && typeof item === "object") {
          internalName = String(item.f || item.field || item.name || "").trim();
          title = String(item.ti || item.title || "").trim() || internalName;
          // z/pos/zone — где показывать поле: "header" (шапка, по умолчанию) или "body" (перед описанием)
          const zoneRaw = String(item.z || item.pos || item.zone || "").trim().toLowerCase();
          zone = zoneRaw === "body" || zoneRaw === "b" || zoneRaw === "description" ? "body" : "header";
        } else {
          return { ok: false, value: {}, error: `Behaviour["${key}"].rf[${idx}] must be a string or object` };
        }
        if (!internalName) {
          return { ok: false, value: {}, error: `Behaviour["${key}"].rf[${idx}].f (field) required` };
        }
        rule.relatedFields.push({ internalName, title, zone, sortOrder: 10 + idx });
      }
    }

    // ct/cm/ok/no → тексты диалога подтверждения (Behaviour.c=true открывает диалог).
    //   "ct": "Подтверждение результата"   — заголовок
    //   "cm": "Вы уверены...?"             — сообщение
    //   "ok": "Подтвердить «Не исправлено»" — кнопка подтверждения
    //   "no": "Отмена"                      — кнопка отмены
    const confirmTitle = pickStr(rawVal, ["ct", "confirmTitle", "confirmTitleText"], "ct");
    const confirmMessage = pickStr(rawVal, ["cm", "confirmMessage", "confirmText"], "cm");
    const confirmOk = pickStr(rawVal, ["ok", "confirmOk", "confirmOkText", "confirmButton"], "ok");
    const confirmCancel = pickStr(rawVal, ["no", "confirmCancel", "confirmCancelText", "cancelText"], "no");
    if (confirmTitle || confirmMessage || confirmOk || confirmCancel) {
      rule.confirmTexts = {
        title: confirmTitle || "",
        message: confirmMessage || "",
        okText: confirmOk || "",
        cancelText: confirmCancel || "",
      };
    }

    // loc → requiresLocation: открыть диалог «Где найдена ЕО?» перед submit.
    //   "loc": true  (синоним: "requiresLocation": true)
    if (rawVal.loc !== undefined || rawVal.requiresLocation !== undefined) {
      const rawLoc = rawVal.loc !== undefined ? rawVal.loc : rawVal.requiresLocation;
      rule.requiresLocation = rawLoc === true || rawLoc === 1 || String(rawLoc).trim().toLowerCase() === "true";
    }

    // anim → animation при submit. Можно передать строку или объект с текстами:
    // "anim":"celebrate"
    // "anim":{"type":"celebrate","title":"Задача исправлена","text":"Отличная работа!"}
    if (rawVal.anim !== undefined) {
      const animationValue = rawVal.anim;
      const animationName = animationValue && typeof animationValue === "object"
        ? (animationValue.type || animationValue.a || animationValue.name)
        : animationValue;
      const a = String(animationName || "").trim().toLowerCase();
      if (VALID_ANIMATIONS.has(a)) rule.animation = a;
      if (animationValue && typeof animationValue === "object") {
        rule.animationConfig = {
          title: animationValue.title || animationValue.ti || "",
          text: animationValue.text || animationValue.message || animationValue.subtitle || "",
          emoji: animationValue.emoji || "",
        };
      }
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
    inlineConfirm: null,
    requiresConfirmed: null,
    showAdditionalActions: null,
    additionalActionsRequired: null,
    animation: null,
    animationConfig: null,
    requiresLocation: null,
    confirmTexts: null,
    relatedFields: [],
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
    inlineConfirm: rule.inlineConfirm === undefined ? null : !!rule.inlineConfirm,
    requiresConfirmed: rule.requiresConfirmed === undefined ? null : !!rule.requiresConfirmed,
    showAdditionalActions: rule.showAdditionalActions === undefined ? null : !!rule.showAdditionalActions,
    additionalActionsRequired: rule.additionalActionsRequired === undefined ? null : !!rule.additionalActionsRequired,
    animation: rule.animation === undefined ? null : rule.animation,
    animationConfig: rule.animationConfig || null,
    requiresLocation: rule.requiresLocation === undefined ? null : !!rule.requiresLocation,
    confirmTexts: rule.confirmTexts || null,
    relatedFields: Array.isArray(rule.relatedFields) ? rule.relatedFields : [],
    source: src,
  };
}

/**
 * Карточные (не зависящие от choice) настройки из Behaviour.
 * Сейчас это `rf` — поля связанного элемента, которые нужно показать в карточке задачи.
 * Приоритет: "_card" → "*" → "_default".
 *
 * @param {object|null} parsedBehaviour — value из parseBehaviour
 * @returns {{relatedFields: Array<{internalName:string,title:string,sortOrder:number}>, source: string}}
 */
export function resolveBehaviourCard(parsedBehaviour) {
  const empty = { relatedFields: [], source: "empty" };
  if (!parsedBehaviour || typeof parsedBehaviour !== "object") return empty;
  const order = ["_card", "*", "_default"];
  for (const key of order) {
    const rule = parsedBehaviour[key];
    if (rule && Array.isArray(rule.relatedFields) && rule.relatedFields.length > 0) {
      return { relatedFields: rule.relatedFields, source: key };
    }
  }
  return empty;
}

/**
 * Помощник: привести promptFields к формату, который ожидает TaskCard (renderPromptFields):
 * { internalName, title, type, required, sortOrder }
 */
export function toRenderPromptFields(parsedRule) {
  return Array.isArray(parsedRule?.promptFields) ? parsedRule.promptFields : [];
}