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
