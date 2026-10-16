// src/utils/htmlEntities.js
// Декодирование HTML-сущностей в плоском тексте.
//
// Зачем: тексты задач приходят из SharePoint экранированными, причём нередко
// ДВАЖДЫ: в поле лежит «&#58;», а после ещё одного экранирования — «&amp;#58;».
// Прежние stripHtml-хелперы знали только &amp;/&lt;/&gt;/&nbsp;, поэтому в таблице
// и форме показывалось «Установить местоположение ЕО&#58; 808003003003003003»
// вместо «Установить местоположение ЕО: 808003003003003003» (замечание 2026-10-11).
//
// Порядок важен: сначала снимаются ТЕГИ и только потом декодируются сущности —
// иначе «&lt;b&gt;» превратилось бы в живой тег. Результат везде выводится как
// текст (React экранирует), поэтому «<» после декодирования безопасен.

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  divide: "÷",
};

const NAMED_RE = new RegExp(`&(${Object.keys(NAMED_ENTITIES).join("|")});`, "gi");
const HEX_RE = /&#x([0-9a-f]+);/gi;
const DEC_RE = /&#(\d+);/g;

/** Код-поинт в символ; на мусоре (&#99999999;) возвращаем исходный текст. */
function fromCode(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch (_e) {
    void _e;
    return fallback;
  }
}

function decodeOnce(text) {
  return text
    .replace(NAMED_RE, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(HEX_RE, (match, hex) => fromCode(parseInt(hex, 16), match))
    .replace(DEC_RE, (match, dec) => fromCode(parseInt(dec, 10), match));
}

/**
 * Раскрывает HTML-сущности, в том числе экранированные повторно.
 *
 * @param {any} value — текст (null/undefined → "")
 * @param {{maxPasses?: number}} [opts] — сколько раз повторять раскрытие
 *   (нужно для «&amp;amp;#58;»); по умолчанию 3, дальше останавливаемся на
 *   первом же проходе без изменений.
 * @returns {string}
 */
export function decodeHtmlEntities(value, opts = {}) {
  if (value == null) return "";
  const maxPasses = Math.max(1, Number(opts.maxPasses) || 3);
  let s = String(value);
  for (let i = 0; i < maxPasses; i += 1) {
    const next = decodeOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}
