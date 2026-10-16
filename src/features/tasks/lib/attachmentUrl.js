// src/features/dob/lib/attachmentUrl.js
// Ссылки на вложения элемента: РАЗНЫЕ для хранения и для показа.
//
// • ХРАНИМ в SharePoint серверный путь — «/sites/dob/doblogistic/Lists/…/Attachments/<id>/<file>».
//   Именно он отдаётся в rich-текст вместо base64: заявка сохраняется со ссылкой,
//   а не с многокилобайтной строкой data:image.
// • ПОКАЗЫВАЕМ рабочий адрес: REST-запрос за СОДЕРЖИМЫМ файла,
//   «…/_api/web/getfilebyserverrelativeurl('<путь>')/$value» (в dev — через префикс
//   прокси «/dob-api», в prod — с origin страницы). Почему не просто
//   «/sites/…/Attachments/<id>/<file>»: такой путь вне `_api` прокси отдавал как
//   JSON-запрос (`Accept: application/json`), и браузер получал испорченный файл —
//   в richtext картинка выглядела «сломанной». `/$value` однозначен для любого
//   прокси и всегда качается как бинарь.
//
// При сохранении (перед MERGE) ссылки прогоняются через attachmentStorageUrl, при
// отображении (в редакторе) — через attachmentDisplayUrl. Так в базе никогда не
// остаётся «/dob-api/…», а в браузере картинка открывается и в dev, и в prod.

import { mapImgSrcs } from './richImages';

/** Прокси-префиксы, которыми браузер ходит на SharePoint (см. vite.config.ts). */
const PROXY_PREFIXES = ['/dob-api', '/api'];

function isDev() {
  try {
    return Boolean(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV);
  } catch {
    return false;
  }
}

function originOf() {
  try {
    return typeof window !== 'undefined' && window.location ? window.location.origin : '';
  } catch {
    return '';
  }
}

/** Признак REST-адреса содержимого файла (собранного нами или SharePoint). */
const FILE_VALUE_RE = /getfilebyserverrelativeurl\(\s*['"]([^'"]+)['"]\s*\)\/(?:\$value|%24value)/i;

/** Кодируем путь по сегментам: слэши остаются, всё остальное — %-escape. */
function encodePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

/**
 * Адрес для <img src> / window.open: рабочий в текущем окружении.
 *
 * Для серверного пути вложения («/sites/…/Lists/…/Attachments/<id>/<file>») отдаём
 * REST-запрос содержимого файла (`…/_api/web/getfilebyserverrelativeurl('<путь>')/$value`)
 * — он качается бинарём в любом окружении. Сайт берём из самого пути (всё, что до
 * `/Lists/…`), поэтому ссылки обоих списков (основной и сайт ДОБ) раскрываются верно.
 *
 * @param {string} serverRelativeUrl — «/sites/…» (как хранится), либо уже готовый URL
 * @returns {string}
 */
export function attachmentDisplayUrl(serverRelativeUrl) {
  const url = String(serverRelativeUrl || '');
  if (!url) return '';
  if (!url.startsWith('/')) {
    // абсолютный http(s) — уже готов; прочие схемы (data:, blob:) не трогаем
    return url;
  }
  const viaProxy = PROXY_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));

  // Уже REST-адрес содержимого файла — только добавить префикс прокси/оригин.
  if (FILE_VALUE_RE.test(url)) {
    if (viaProxy) return url;
    if (isDev()) return `/dob-api${url}`;
    const origin = originOf();
    return origin ? `${origin}${url}` : url;
  }
  if (viaProxy) return url;

  // Прямая ссылка на файл вложения → REST-запрос содержимого.
  const listsAt = url.indexOf('/Lists/');
  const sitePath = listsAt > 0 ? url.slice(0, listsAt) : '';
  if (sitePath) {
    const rest = `${sitePath}/_api/web/getfilebyserverrelativeurl('${encodePath(url)}')/$value`;
    if (isDev()) return `/dob-api${rest}`;
    const origin = originOf();
    return origin ? `${origin}${rest}` : rest;
  }

  if (isDev()) return `/dob-api${url}`;
  const origin = originOf();
  return origin ? `${origin}${url}` : url;
}

/**
 * Канонический вид для ХРАНЕНИЯ: серверный путь «/sites/…» без прокси-префиксов и
 * без собственного origin. Всё чужое (внешние URL, data:) возвращается как есть.
 * @param {string} url
 * @returns {string}
 */
export function attachmentStorageUrl(url) {
  let raw = String(url || '').trim();
  if (!raw) return '';
  // REST-адрес содержимого файла → обратно к серверному пути (иначе после показа
  // картинки в редакторе в хранилище попал бы «…/_api/web/getfilebyserverrelativeurl…»).
  const rest = raw.match(FILE_VALUE_RE);
  if (rest && rest[1]) {
    try { raw = decodeURIComponent(rest[1]); } catch (_e) { void _e; raw = rest[1]; }
  }
  if (raw.startsWith('/')) {
    for (const prefix of PROXY_PREFIXES) {
      if (raw === prefix) return '';
      if (raw.startsWith(`${prefix}/`)) return raw.slice(prefix.length);
    }
    return raw;
  }
  // Абсолютный URL своего сайта → оставляем серверный путь (иначе он «прилипает»
  // к стенду и ломается при переносе решения).
  const origin = originOf();
  if (origin && raw.startsWith(`${origin}/`)) return raw.slice(origin.length);
  return raw;
}

/** Абсолютная или прямая ссылка на вложение (без префикса прокси) — для сохранения. */
export function attachmentServerPath(saved) {
  if (!saved) return '';
  const serverRelative = saved.ServerRelativeUrl || saved.ServerRelativePath?.DecodedUrl || '';
  if (serverRelative) return attachmentStorageUrl(serverRelative);
  return attachmentStorageUrl(saved.src || saved.url || '');
}

/** HTML rich-текста → все <img src> приведены к серверным путям (для сохранения). */
export function toStorageImages(html) {
  return mapImgSrcs(html, attachmentStorageUrl);
}

/** HTML rich-текста → все <img src> приведены к рабочим адресам (для редактора). */
export function toDisplayImages(html) {
  return mapImgSrcs(html, attachmentDisplayUrl);
}
