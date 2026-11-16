// src/features/dob/lib/materializeRichImages.js
// Материализация картинок rich-текста ПЕРЕД сохранением: каждая base64-картинка
// (`data:image/…`) загружается вложением элемента, а в тексте остаётся ССЫЛКА на
// вложение («/sites/…/Attachments/<id>/<file>»). Так заявка сохраняется со
// ссылкой, а не с многокилобайтной строкой; вложений может быть сколько угодно.
//
// Функция не знает про SharePoint: загрузчик (`upload`) передаёт страница формы
// (dobApi.uploadDobAttachment для заявки или основного списка задач). Дополнительно
// все адреса приводятся к «серверному» виду (`toStorageImages`), чтобы в SharePoint
// не попадали ни base64, ни адреса dev-прокси `/dob-api/…`.

import { attachmentServerPath, toStorageImages } from './attachmentUrl';
import { dataUrlSrcs, dataUrlToFile, replaceImgSrc } from './richImages';

/**
 * @param {string} html — rich-текст
 * @param {object} [opts]
 * @param {(file: File, src: string) => Promise<any>} [opts.upload] — загрузка вложения
 * @param {(saved: any, link: string) => void} [opts.onUploaded] — вложение создано
 * @param {(error: any, src: string) => void} [opts.onError] — картинку не удалось сохранить
 * @returns {Promise<string>} html со ссылками на вложения
 */
export async function materializeRichHtml(html, opts = {}) {
  const { upload, onUploaded, onError } = opts;
  if (typeof html !== 'string' || !html.includes('<img')) return html;
  let out = html;
  for (const src of dataUrlSrcs(out)) {
    if (typeof upload !== 'function') break;
    let saved = null;
    try {
      saved = await upload(dataUrlToFile(src), src);
    } catch (e) {
      onError?.(e, src);
      continue;
    }
    const link = attachmentServerPath(saved);
    if (!link) {
      onError?.(new Error('нет ссылки на вложение'), src);
      continue;
    }
    out = replaceImgSrc(out, src, link);
    onUploaded?.(saved, link);
  }
  return toStorageImages(out);
}

/**
 * То же для словаря значений формы { internalName: html }.
 *
 * Строки без картинок тоже прогоняются через нормализацию адресов: если картинка
 * записана в верхнем регистре (`<IMG SRC="/dob-api/…">`), её адрес тоже должен
 * стать серверным — в SharePoint не должно попадать ничего похожего на прокси.
 *
 * @param {object} values
 * @param {object} [opts] — как у materializeRichHtml
 * @returns {Promise<object>} тот же объект, если менять нечего
 */
export async function materializeRichValues(values, opts = {}) {
  const out = { ...(values || {}) };
  let changed = false;
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string') continue;
    const next = value.includes('<img') ? await materializeRichHtml(value, opts) : toStorageImages(value);
    if (next !== value) {
      out[key] = next;
      changed = true;
    }
  }
  return changed ? out : values;
}

/**
 * Поля, в которых ПОСЛЕ материализации остались base64-КАРТИНКИ: значит, вложение
 * создать не удалось. Такие значения нельзя сохранять — в SharePoint должна уходить
 * ссылка на вложение, а не `data:image/…` (требование к richtext).
 *
 * @param {object} values — значения формы
 * @returns {string[]} имена полей с оставшимся base64
 */
export function fieldsWithBase64(values = {}) {
  const out = [];
  for (const [key, value] of Object.entries(values || {})) {
    if (typeof value === 'string' && dataUrlSrcs(value).length > 0) out.push(key);
  }
  return out;
}
