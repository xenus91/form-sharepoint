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
 * @param {object} values
 * @param {object} [opts] — как у materializeRichHtml
 * @returns {Promise<object>} тот же объект, если менять нечего
 */
export async function materializeRichValues(values, opts = {}) {
  const out = { ...(values || {}) };
  let changed = false;
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string' || !value.includes('<img')) continue;
    const next = await materializeRichHtml(value, opts);
    if (next !== value) {
      out[key] = next;
      changed = true;
    }
  }
  return changed ? out : values;
}
