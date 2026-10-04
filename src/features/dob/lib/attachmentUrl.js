// src/features/dob/lib/attachmentUrl.js
// Ссылки на вложения элемента: РАЗНЫЕ для хранения и для показа.
//
// • ХРАНИМ в SharePoint серверный путь — «/sites/dob/doblogistic/Lists/…/Attachments/<id>/<file>».
//   Именно он отдаётся в rich-текст вместо base64: заявка сохраняется со ссылкой,
//   а не с многокилобайтной строкой data:image.
// • ПОКАЗЫВАЕМ рабочий адрес: в dev «/sites/…» не проксируется напрямую, поэтому
//   добавляем префикс прокси «/dob-api»; в prod — абсолютный origin страницы.
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

/**
 * Адрес для <img src> / window.open: рабочий в текущем окружении.
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
  if (PROXY_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`))) return url;
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
  const raw = String(url || '').trim();
  if (!raw) return '';
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
