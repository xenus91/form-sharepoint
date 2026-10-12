// src/features/dob/lib/dobRoute.js
// Роуты раздела «Заявки ДОБ».
//
// 2026-10-12: роут ПЕРЕИМЕНОВАН — было #dob_tasks, стало #dob_requests
// (требование пользователя). Ссылки на старый адрес живут в письмах, закладках
// и в коде таблицы задач, поэтому:
//   • парсер понимает ОБА варианта (#dob_requests/…, #dob_tasks/…, #dob/…);
//   • при входе по старому адресу hash перезаписывается на новый (редирект);
//   • все ПРОИЗВОДИТЕЛИ ссылок в приложении переведены на #dob_requests.
//
// Виды адресов:
//   #dob_requests            — список заявок;
//   #dob_requests/new        — форма создания заявки;
//   #dob_requests/<id>       — форма заявки (редактирование / просмотр);
//   #dob_requests/<id>?list=<guid> — та же форма, но в списке источника
//     (так из #tasks открывают задачу другого списка, например основной).

export const DOB_REQUESTS_HASH = "#dob_requests";
export const LEGACY_DOB_TASKS_HASH = "#dob_tasks";

/**
 * Ссылка на форму заявки.
 * @param {number|string} id
 * @param {string|null} [listGuid] — список, если это не список заявок ДОБ
 * @returns {string}
 */
export function buildDobItemHash(id, listGuid = null) {
  if (id == null || id === "") return DOB_REQUESTS_HASH;
  const guid = String(listGuid || "").trim().replace(/[{}]/g, "").toLowerCase();
  return `${DOB_REQUESTS_HASH}/${id}${guid ? `?list=${guid}` : ""}`;
}

/** Ссылка на форму создания заявки. */
export function buildDobCreateHash() {
  return `${DOB_REQUESTS_HASH}/new`;
}

/**
 * Разбор hash'а раздела заявок.
 * @param {string} hash — window.location.hash
 * @returns {{isDob:boolean, mode:"list"|"create"|"edit", id:number|null, listGuid:string|null}}
 */
export function parseDobHash(hash) {
  const raw = String(hash || "");
  const empty = { isDob: false, mode: "list", id: null, listGuid: null };
  const m = raw.match(/#\/?(dob_requests|dob_tasks|dob)(?:[/?&]|$)/i);
  if (!m) return empty;
  const seg = raw.match(/#\/?(?:dob_requests|dob_tasks|dob)\/(new|\d{1,19})/i);
  const listMatch = raw.match(/[?&#]list=([0-9a-fA-F-]{36})/);
  const listGuid = listMatch ? listMatch[1].toLowerCase() : null;
  if (!seg) return { isDob: true, mode: "list", id: null, listGuid };
  if (seg[1].toLowerCase() === "new") return { isDob: true, mode: "create", id: null, listGuid };
  return { isDob: true, mode: "edit", id: Number(seg[1]), listGuid };
}

/** Это ссылка на старый роут #dob_tasks? */
export function isLegacyDobHash(hash) {
  return /#\/?dob_tasks\b/i.test(String(hash || ""));
}

/**
 * Переписывает старый адрес на новый (#dob_tasks/12?list=… → #dob_requests/12?list=…),
 * остальные части hash'а сохраняются.
 * @param {string} hash
 * @returns {string}
 */
export function toRequestsHash(hash) {
  return String(hash || "").replace(/#\/?dob_tasks\b/i, DOB_REQUESTS_HASH);
}
