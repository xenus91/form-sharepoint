// src/features/dob/lib/richImages.js
// Картинки внутри rich-текста (CKEditor) и вложения задачи.
//
// Договорённость: каждая вставленная картинка загружается вложением элемента
// (`<list>/items(<id>)/AttachmentFiles/add`), вложений может быть СКОЛЬКО УГОДНО;
// если картинку из текста удалили — соответствующее вложение тоже удаляем.
// Здесь только чистые функции разбора HTML — их используют и страница
// `#dob_tasks/<id>`, и попап-форма в таблице.

/** Все src картинок из html ({array<string>}). */
export function extractImgSrcs(html) {
  if (!html || typeof html !== 'string') return [];
  const srcs = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  return srcs;
}

/** Имя файла вложения из src картинки (base64 → пусто). */
export function fileNameFromSrc(src) {
  if (!src || typeof src !== 'string' || src.startsWith('data:')) return '';
  try {
    const withoutQuery = src.split('?')[0].split('#')[0];
    return decodeURIComponent(withoutQuery.split('/').pop() || '');
  } catch {
    return '';
  }
}

/** src, которые были в тексте и исчезли (удалённые картинки). */
export function removedImgSrcs(prevHtml, nextHtml) {
  const next = extractImgSrcs(nextHtml);
  return extractImgSrcs(prevHtml).filter((src) => !next.includes(src));
}

/** Плоский список удалённых картинок по словарю значений формы {internalName: html}. */
export function removedImgSrcsByValues(prevValues = {}, nextValues = {}) {
  const removed = [];
  for (const [key, html] of Object.entries(nextValues || {})) {
    removed.push(...removedImgSrcs(String(prevValues?.[key] ?? ''), String(html ?? '')));
  }
  return removed;
}

/**
 * Убрать из html картинки, которые указывают на файл вложения.
 * Сравнение идёт по ИМЕНИ файла, поэтому `/sites/…/a.png` и рабочий адрес
 * `/dob-api/sites/…/a.png` — один и тот же файл. Каскад: удалили вложение —
 * картинка исчезает из текста (и наоборот, см. removedImgSrcs).
 */
export function removeImgByFileName(html, fileName) {
  if (!html || typeof html !== 'string' || !fileName) return html;
  return html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (all, src) => (
    fileNameFromSrc(src) === fileName ? '' : all
  ));
}

/**
 * Одинаковые ли словари значений формы ({ internalName: value }).
 * Нужно, чтобы «сообщение значений наружу» не гоняло лишние ререндеры (и не
 * зациклилось, если владелец формы передал нестабильные props).
 */
export function sameFormValues(a = {}, b = {}) {
  const ak = Object.keys(a || {});
  const bk = Object.keys(b || {});
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(av) || Array.isArray(bv)) {
      if (JSON.stringify(av ?? null) !== JSON.stringify(bv ?? null)) return false;
      continue;
    }
    if (String(av ?? '') !== String(bv ?? '')) return false;
  }
  return true;
}

/** Заменить src у всех <img> в html (через mapper). */
export function mapImgSrcs(html, mapper) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]*)(")/gi, (all, pre, src, post) => {
    const next = mapper ? mapper(src) : src;
    return `${pre}${next === undefined || next === null ? src : next}${post}`;
  });
}

/** Все уникальные base64-картинки (data:image/…) из html. */
export function dataUrlSrcs(html) {
  const out = [];
  for (const src of extractImgSrcs(html)) {
    if (src.startsWith('data:image/') && !out.includes(src)) out.push(src);
  }
  return out;
}

/** Заменить один src на другой во всех <img> (например, base64 → ссылка вложения). */
export function replaceImgSrc(html, from, to) {
  if (!html || !from || !to) return html;
  return mapImgSrcs(html, (src) => (src === from ? to : src));
}

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,(.*)$/s;

/**
 * base64-картинка → File для загрузки вложением.
 * @param {string} src — data:image/png;base64,…
 * @param {() => string} [nameOf] — как назвать файл (по умолчанию image_<ts>.<ext>)
 * @returns {File|null}
 */
export function dataUrlToFile(src, nameOf) {
  const m = String(src || '').match(DATA_URL_RE);
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const isBase64 = Boolean(m[2]);
  try {
    const bytes = isBase64
      ? Uint8Array.from(atob(m[3]), (ch) => ch.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(m[3]));
    const ext = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
    const name = (nameOf ? nameOf() : '') || `image_${Date.now()}.${ext}`;
    if (typeof File === 'function') return new File([bytes], name, { type: mime });
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}
