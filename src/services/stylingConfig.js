// src/services/stylingConfig.js
// Парсер/резолвер компактного JSON `StylingResultButton` (см. plan §4).
//
// Схема:
//   { "_default": {...}, "<choice>": { "bg": "<css>", "c": "<css>", "v": "ctd|out|tx", "i": "<muiIcon>" } }
//
// Никакого HTML, всё идёт через MUI `sx`. Неизвестные ключи — игнорируются.

const MAX_STR = 500; // максимум для bg/c/v/i
const VALID_VARIANTS = new Set(["ctd", "out", "tx"]); // contained|outlined|text (компактно)

function normKey(s) { return String(s || "").trim().toLowerCase(); }

/**
 * Парсит JSON StylingResultButton → { ok, value, error }.
 * value — нормализованный объект, ключи в lowercase, валидные поля приведены к типам.
 */
export function parseStyling(text) {
  if (text === undefined || text === null || String(text).trim() === "") {
    return { ok: true, value: {} };
  }
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch (e) {
    return { ok: false, value: {}, error: `StylingResultButton: invalid JSON — ${e.message}` };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, value: {}, error: "StylingResultButton: root must be a JSON object" };
  }

  const out = {};
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const key = normKey(rawKey);
    if (!key) continue;
    if (!rawVal || typeof rawVal !== "object" || Array.isArray(rawVal)) continue;

    const entry = {};
    if (typeof rawVal.bg === "string" && rawVal.bg.length <= MAX_STR) entry.bg = rawVal.bg;
    if (typeof rawVal.c === "string" && rawVal.c.length <= MAX_STR) entry.color = rawVal.c;
    if (typeof rawVal.v === "string") {
      const v = normKey(rawVal.v);
      // Поддерживаем и компактные (ctd|out|tx), и нормальные MUI-имена
      if (v === "ctd" || v === "contained") entry.variant = "contained";
      else if (v === "out" || v === "outlined") entry.variant = "outlined";
      else if (v === "tx" || v === "text") entry.variant = "text";
    }
    if (typeof rawVal.i === "string" && rawVal.i.length <= MAX_STR) entry.icon = rawVal.i;
    if (Object.keys(entry).length) out[key] = entry;
  }
  return { ok: true, value: out };
}

/**
 * Резолвер стилей для конкретного choice. Возвращает sx-объект для MUI <Button> или null.
 *
 * Приоритеты внутри StylingResultButton:
 *   1) exact-ключ по нормализованному choice
 *   2) "_default"
 *
 * @param {string} choice
 * @param {object|null} parsedStyling — value из parseStyling
 * @returns {object|null} sx-совместимый объект (background / backgroundColor / color / variant)
 *                          или null если ничего не задано
 */
export function resolveStylingForChoice(choice, parsedStyling) {
  if (!parsedStyling || typeof parsedStyling !== "object") return null;
  const norm = normKey(choice);
  let entry = parsedStyling[norm];
  if (!entry && parsedStyling._default) entry = parsedStyling._default;
  if (!entry) return null;

  const sx = {};
  if (entry.bg) {
    sx.background = entry.bg;
    sx.backgroundColor = entry.bg; // MUI fallback для некоторых тем
    sx["&:hover"] = { ...(sx["&:hover"] || {}), filter: "brightness(1.1)" };
  }
  if (entry.color) sx.color = entry.color;
  if (entry.variant) sx.variant = entry.variant;
  return Object.keys(sx).length ? sx : null;
}