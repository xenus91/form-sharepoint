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
// Строит карту стилей из уже распарсенного объекта StylingResultButton.
function buildStyling(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, value: {}, error: "StylingResultButton: root must be a JSON object" };
  }
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const key = normKey(rawKey);
    if (!key) continue;
    if (!rawVal || typeof rawVal !== "object" || Array.isArray(rawVal)) continue;

    // Компактные ключи (bg/c/v/i) — основной формат из SP; длинные (background/color/variant/icon) — тоже принимаем.
    const pick = (...names) => {
      for (const n of names) {
        const v = rawVal[n];
        if (typeof v === "string") return v;
      }
      return undefined;
    };
    const entry = {};
    const bg = pick("bg", "background");
    const color = pick("c", "color");
    const icon = pick("i", "icon");
    const variantRaw = pick("v", "variant");
    if (typeof bg === "string" && bg.length <= MAX_STR) entry.bg = bg;
    if (typeof color === "string" && color.length <= MAX_STR) entry.color = color;
    if (typeof variantRaw === "string") {
      const v = normKey(variantRaw);
      // Поддерживаем и компактные (ctd|out|tx), и нормальные MUI-имена
      if (v === "ctd" || v === "contained") entry.variant = "contained";
      else if (v === "out" || v === "outlined") entry.variant = "outlined";
      else if (v === "tx" || v === "text") entry.variant = "text";
    }
    if (typeof icon === "string" && icon.length <= MAX_STR) entry.icon = icon;
    if (Object.keys(entry).length) out[key] = entry;
  }
  return { ok: true, value: out };
}

export function parseStyling(text) {
  if (text === undefined || text === null || String(text).trim() === "") {
    return { ok: true, value: {} };
  }
  // Уже распарсенный объект (например, из кэша) — не гоняем через JSON.parse.
  if (typeof text === "object" && !Array.isArray(text)) {
    return buildStyling(text);
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
    return { ok: false, value: {}, error: `StylingResultButton: invalid JSON — ${e.message}` };
  }
  return buildStyling(raw);
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
    sx.background = entry.bg; // CSS shorthand: background-image + background-color reset
    sx["&:hover"] = { ...(sx["&:hover"] || {}), filter: "brightness(1.1)" };
  }
  if (entry.color) sx.color = entry.color;
  if (entry.variant) sx.variant = entry.variant;
  return Object.keys(sx).length ? sx : null;
}