// src/features/dob/lib/dobRoute.js
// Маршруты раздела ДОБ.
//
// ВАЖНО: это ДВА разных адреса, потому что это два разных списка.
//
//   #dob_requests              — список ЗАЯВОК (Requests, DOB_LIST_GUID);
//   #dob_requests/new          — форма создания заявки;
//   #dob_requests/<id>         — форма заявки;
//
//   #dob_tasks/<id>?list=<guid> — форма ЗАДАЧИ из другого списка (основной
//     Tasks, RequestsTask ООБ). Тот же экран DobTaskEditView, но список и поля
//     берутся из ?list=. Переименовывать его в #dob_requests нельзя: заявки там
//     нет, есть задача. (Исторически это и был #dob_tasks.)
//
// Старые ссылки на заявки (#dob_tasks/<id> без ?list=, #dob/<id>) продолжают
// работать: парсер понимает все варианты, а App перезаписывает такие адреса на
// #dob_requests (см. isLegacyDobRequestHash / toRequestsHash).

import { DOB_LIST_GUID } from "../api/dobClient";

export const DOB_REQUESTS_HASH = "#dob_requests";
export const DOB_TASKS_HASH = "#dob_tasks";

const normGuid = (value) => String(value || "").trim().replace(/[{}]/g, "").toLowerCase();

/** Это список заявок ДОБ (или список не указан)? */
export function isDobRequestList(listGuid) {
  const guid = normGuid(listGuid);
  return !guid || guid === normGuid(DOB_LIST_GUID);
}

/**
 * Ссылка на форму ЗАЯВКИ (список Requests).
 * @param {number|string} id
 * @returns {string}
 */
export function buildDobRequestHash(id) {
  if (id == null || id === "") return DOB_REQUESTS_HASH;
  return `${DOB_REQUESTS_HASH}/${id}`;
}

/**
 * Ссылка на форму ЗАДАЧИ в списке источника.
 * @param {number|string} id
 * @param {string} listGuid — список, в котором лежит задача
 * @returns {string}
 */
export function buildDobTaskHash(id, listGuid) {
  if (id == null || id === "") return DOB_TASKS_HASH;
  const guid = normGuid(listGuid);
  return `${DOB_TASKS_HASH}/${id}${guid ? `?list=${guid}` : ""}`;
}

/**
 * Ссылка на форму элемента: заявка → #dob_requests/<id>,
 * задача чужого списка → #dob_tasks/<id>?list=<guid>.
 * @param {number|string} id
 * @param {string|null} [listGuid]
 * @returns {string}
 */
export function buildDobItemHash(id, listGuid = null) {
  return isDobRequestList(listGuid) ? buildDobRequestHash(id) : buildDobTaskHash(id, listGuid);
}

/** Ссылка на форму создания заявки. */
export function buildDobCreateHash() {
  return `${DOB_REQUESTS_HASH}/new`;
}

/**
 * Разбор hash'а раздела.
 * @param {string} hash — window.location.hash
 * @returns {{isDob:boolean, mode:"list"|"create"|"edit", id:number|null, listGuid:string|null, kind:"request"|"task"}}
 */
export function parseDobHash(hash) {
  const raw = String(hash || "");
  const empty = { isDob: false, mode: "list", id: null, listGuid: null, kind: "request" };
  const m = raw.match(/#\/?(dob_requests|dob_tasks|dob)(?:[/?&]|$)/i);
  if (!m) return empty;
  const seg = raw.match(/#\/?(?:dob_requests|dob_tasks|dob)\/(new|\d{1,19})/i);
  const listMatch = raw.match(/[?&#]list=([0-9a-fA-F-]{36})/);
  const listGuid = listMatch ? listMatch[1].toLowerCase() : null;
  // Заявка = список заявок (без ?list=), задача = элемент чужого списка.
  const kind = isDobRequestList(listGuid) ? "request" : "task";
  if (!seg) return { isDob: true, mode: "list", id: null, listGuid, kind };
  if (seg[1].toLowerCase() === "new") return { isDob: true, mode: "create", id: null, listGuid, kind };
  return { isDob: true, mode: "edit", id: Number(seg[1]), listGuid, kind };
}

/**
 * Это старая ссылка на ЗАЯВКУ (#dob_tasks/<id> или #dob/<id> без ?list=)?
 * Задачные ссылки #dob_tasks/<id>?list=… — не старые, они так и должны выглядеть.
 */
export function isLegacyDobRequestHash(hash) {
  const raw = String(hash || "");
  if (!/#\/?(?:dob_tasks|dob)\b/i.test(raw)) return false;
  if (/#\/?dob_requests\b/i.test(raw)) return false;
  // Наличие ?list= (любой длины) означает, что это задача чужого списка.
  return !/[?&#]list=/i.test(raw);
}

/**
 * Переписывает старую ссылку на заявку в новый адрес
 * (#dob_tasks/12 → #dob_requests/12). Задачные ссылки не трогает.
 * @param {string} hash
 * @returns {string}
 */
export function toRequestsHash(hash) {
  const raw = String(hash || "");
  if (!isLegacyDobRequestHash(raw)) return raw;
  return raw.replace(/#\/?(?:dob_tasks|dob)\b/i, DOB_REQUESTS_HASH);
}
