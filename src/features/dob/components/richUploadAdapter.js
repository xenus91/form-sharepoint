// src/features/dob/components/richUploadAdapter.js
// Адаптер загрузки картинок CKEditor для rich-полей (ChekResult, DescriptionCheckResult…).
//
// Каждая вставленная картинка становится ВЛОЖЕНИЕМ элемента, а в тексте остаётся
// ССЫЛКА на него (`/sites/…/Attachments/<id>/<file>`) вместо base64 — иначе заявка
// сохраняется многокилобайтной строкой `data:image/…`.
//
// • серверный путь (что хранится) → `attachmentStorageUrl` (см. lib/attachmentUrl.js);
// • в редакторе показывается рабочий адрес: в dev — через прокси `/dob-api`;
// • если загрузка не удалась — возвращаем base64, чтобы текст не потерялся.
//
// Вынесено из RichEditor, чтобы файл компонента экспортировал только компонент
// (react-refresh/only-export-components) и адаптер можно было тестировать отдельно.

import { attachmentDisplayUrl } from '../lib/attachmentUrl';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Ссылка на вложение из ответа страницы (строка или объект сохранения). */
export function uploadedLink(saved) {
  if (!saved) return '';
  if (typeof saved === 'string') return attachmentDisplayUrl(saved);
  return attachmentDisplayUrl(
    saved.ServerRelativeUrl || saved.ServerRelativePath?.DecodedUrl || saved.src || saved.url || '',
  );
}

export function makeUploadAdapter(loader, onUploadImage) {
  return {
    async upload() {
      const file = await loader.file;
      if (onUploadImage) {
        try {
          const link = uploadedLink(await onUploadImage(file));
          if (link) return { default: link };
        } catch (e) {
          console.warn('[RichEditor] вложение не загрузилось — картинка останется base64', e?.message || e);
        }
      }
      return { default: await fileToBase64(file) };
    },
    abort() {},
  };
}
