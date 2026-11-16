// src/tasks/attachments.js
// Вложения задач на СВОЁМ сайте.
//
// Раньше картинки из rich-текста задачи грузились через `uploadDobAttachment`
// (клиент сайта ДОБ) — то есть приложение на сайте Образцово писало вложения в
// чужой список. С 2026-10-16 приложения разведены по своим сайтам: задачи здесь
// живут в списке `Tasks` этого сайта, и вложения пишутся тем же `apiClient`,
// которым ходит всё остальное.
//
// Логика перенесена из `src/features/dob/api/dobApi.js` без изменения поведения:
// очередь загрузок (SharePoint отдаёт 409 на одновременные `AttachmentFiles/add`
// к одному элементу), повторы при конфликте сохранения и при занятом имени файла.

import apiClient from "../api";
import { TASKS_LIST_GUID, listApiForGuid } from "./config";
import { attachmentDisplayUrl } from "../features/tasks/lib/attachmentUrl";

/** GUID списка → REST-путь к списку. */
export const listApiOf = listApiForGuid;

function isSaveConflictError(e) {
  const message = String(
    e?.response?.data?.error?.message?.value || e?.message || "",
  ).toLowerCase();
  return (
    message.includes("конфликт сохранения") ||
    message.includes("save conflict") ||
    message.includes("0x81020014") ||
    message.includes("заблокирован")
  );
}

/**
 * Очередь загрузок: параллельные `AttachmentFiles/add` к одному элементу дают
 * 409, и картинка оставалась base64 в тексте. Поэтому грузим строго по одному.
 */
let attachmentUploadQueue = Promise.resolve();

/**
 * Загружает файл вложением элемента списка задач (последовательно, с повтором
 * при конфликте).
 * @param {number|string} id — Id элемента
 * @param {File|Blob} file
 * @param {string} [listGuid] — GUID списка (по умолчанию список задач)
 * @returns {Promise<object>} ответ SharePoint + ServerRelativeUrl (что храним),
 *   src/url (рабочий адрес для редактора) и fileName (что реально легло).
 */
export async function uploadTaskAttachment(id, file, listGuid = TASKS_LIST_GUID) {
  const run = attachmentUploadQueue.then(() => uploadTaskAttachmentOnce(id, file, listGuid));
  // Очередь не должна «залипать» на ошибке, иначе следующие вставки не загрузятся.
  attachmentUploadQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function uploadTaskAttachmentOnce(id, file, listGuid = TASKS_LIST_GUID) {
  const listApi = listApiOf(listGuid);
  if (!id || !file) throw new Error("uploadTaskAttachment: id and file required");

  let fileName = file.name || `image_${Date.now()}.png`;
  // clipboard отдаёт image.png / image.jpg — делаем имя уникальным сразу,
  // иначе параллельные вставки падают с «имя уже используется».
  if (
    /^image\.png$/i.test(fileName) ||
    /^image\.jpe?g$/i.test(fileName) ||
    /^pasted-image/i.test(fileName)
  ) {
    const dot = fileName.lastIndexOf(".");
    const ext = dot >= 0 ? fileName.slice(dot) : ".png";
    fileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
  }

  let attempt = 0;
  let lastError = null;
  while (attempt < 4) {
    try {
      const buffer = await file.arrayBuffer();
      const url = `${listApi}/items(${id})/AttachmentFiles/add(FileName='${encodeURIComponent(
        fileName,
      ).replace(/'/g, "''")}')`;
      const { data } = await apiClient.post(url, buffer, {
        headers: { "Content-Type": "application/octet-stream" },
        transformRequest: (d) => d,
      });
      const result = data?.d || data;
      let src = result?.ServerRelativeUrl || result?.ServerRelativePath?.DecodedUrl || null;
      // Если ответ без пути — спрашиваем у самого элемента (адрес сайта не
      // зашиваем: приложение работает с тем сайтом, на котором размещено).
      if (!src) src = await findAttachmentUrl(listApi, id, fileName);
      if (!src) throw new Error("uploadTaskAttachment: SharePoint не вернул ServerRelativeUrl");
      return {
        ...result,
        ServerRelativeUrl: src,
        fileName,
        // В редакторе картинка показывается РАБОЧИМ адресом (REST `…/$value`):
        // прямой путь на файл прокси отдавал как JSON, и картинка была битой.
        url: attachmentDisplayUrl(src),
        src: attachmentDisplayUrl(src),
      };
    } catch (e) {
      lastError = e;
      const rawMsg = e?.response?.data?.error?.message?.value || e?.message || "";
      const lower = String(rawMsg).toLowerCase();
      if (isSaveConflictError(e) && attempt < 3) {
        attempt += 1;
        console.warn(`[tasks] вложение: конфликт сохранения, повтор ${attempt}/3`);
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }
      const isDuplicate =
        lower.includes("имя уже используется") ||
        lower.includes("already exists") ||
        lower.includes("already in use") ||
        (lower.includes("exists") && lower.includes("name"));
      if (isDuplicate && attempt < 3) {
        const dot = fileName.lastIndexOf(".");
        const name = dot >= 0 ? fileName.slice(0, dot) : fileName;
        const ext = dot >= 0 ? fileName.slice(dot) : ".png";
        const base = name.replace(/_\d{10,}.*$/, "").replace(/_[a-z0-9]{2,6}$/, "");
        fileName = `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
        console.warn(
          `[tasks] вложение: имя занято "${String(rawMsg).slice(0, 120)}" → "${fileName}", повтор ${attempt + 1}`,
        );
        attempt += 1;
        await new Promise((r) => setTimeout(r, 120 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

/** Ищет серверный путь вложения по имени файла. */
async function findAttachmentUrl(listApi, id, fileName) {
  try {
    const { data } = await apiClient.get(`${listApi}/items(${id})/AttachmentFiles`);
    const results = data?.d?.results || [];
    const hit = results.find(
      (f) => String(f?.FileName || "").toLowerCase() === String(fileName).toLowerCase(),
    );
    return hit?.ServerRelativeUrl || hit?.ServerRelativePath?.DecodedUrl || null;
  } catch {
    return null;
  }
}

/**
 * Удаляет вложение элемента.
 * @param {number|string} id
 * @param {string} fileName
 * @param {string} [listGuid]
 */
export async function deleteTaskAttachment(id, fileName, listGuid = TASKS_LIST_GUID) {
  const url = `${listApiOf(listGuid)}/items(${id})/AttachmentFiles/getByFileName('${encodeURIComponent(
    fileName,
  ).replace(/'/g, "''")}')`;
  const { data } = await apiClient.post(url, "", {
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-HTTP-Method": "DELETE",
      "IF-MATCH": "*",
    },
  });
  return data;
}
