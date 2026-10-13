// src/features/dob/components/requestForm/requestTitle.js
// Общее правило заголовка заявки: поле Title в форме не показываем, значение
// генерируем сами — иначе пользователь должен придумывать имя каждой заявки.
//
// Правило одно на все типы контента: «<Название типа> от <дд.мм.гггг чч:мм>».
// Название типа берём из его описания (contentTypeDisplayName) — то же значение
// пользователь видит в кнопках выбора типа.
import { contentTypeDisplayName } from "../../lib/requestFields";

const pad = (n) => String(n).padStart(2, "0");

/** «13.10.2026 16:03» — локальное время, без зависимости от локали окружения. */
export function formatRequestStamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Заголовок новой заявки.
 * @param {{contentType?:object, ctLabel?:string, date?:Date}} [opts]
 *   contentType — объект типа контента (из getDobContentTypes); ctLabel —
 *   готовое название, если типа под рукой нет.
 * @returns {string}
 */
export function buildRequestTitle({ contentType = null, ctLabel = "", date = new Date() } = {}) {
  const label = String(ctLabel || "").trim() || contentTypeDisplayName(contentType) || "Заявка";
  const stamp = formatRequestStamp(date);
  return stamp ? `${label} от ${stamp}` : label;
}
