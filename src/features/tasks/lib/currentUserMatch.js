// src/features/tasks/lib/currentUserMatch.js
// «Это моя задача?» — определение ИСПОЛНИТЕЛЯ (того, кто взял задачу в работу)
// по всем доступным признакам, а не только по Editor-строке.
//
// Зачем: SharePoint у разных сайтов выдаёт РАЗНЫЕ Id одного и того же человека,
// а Editor приходит то объектом ({ Id, Title }), то строкой. Из-за сверки только
// по EditorId/EditorTitle приложение показывало «Задача уже взята другим
// пользователем» самому исполнителю («я и есть Поршаков Сергей!»).
//
// Правила (все — «или», любое совпадение = задача моя):
//   • Id взявшего совпал с Id текущего пользователя НА САЙТЕ ИСТОЧНИКА (или main);
//   • ФИО взявшего и текущего пользователя совпали с точностью до порядка слов
//     и отчества («Поршаков Сергей» = «Сергей Поршаков Александрович»);
//   • логин/учётная запись совпали (в т.ч. по локальной части [домен\]логин).

/** Нормализация ФИО/логина: регистр, ё→е, пунктуация, лишние пробелы. */
export function normalizePersonName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,()"'`_/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Слова ФИО без порядка. */
export function personNameTokens(value) {
  const norm = normalizePersonName(value);
  return norm ? norm.split(" ").filter(Boolean) : [];
}

/**
 * Похожи ли два ФИО на одного человека: одинаковый набор слов (в любом порядке)
 * или одно ФИО — усечённая запись другого («Поршаков Сергей» ⊂ «Поршаков Сергей
 * Александрович», «Сергей Поршаков» = «Поршаков Сергей»).
 */
export function personNamesMatch(a, b) {
  const ta = personNameTokens(a);
  const tb = personNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setA = [...ta].sort().join(" ");
  const setB = [...tb].sort().join(" ");
  if (setA === setB) return true;
  const shortT = ta.length <= tb.length ? ta : tb;
  const longT = ta.length <= tb.length ? tb : ta;
  if (shortT.length < 2) return false;
  // Порядок слов усечённой записи может отличаться — сверяем по множеству:
  // каждое слово короткой записи должно найтись в длинной.
  const longSet = new Set(longT);
  return shortT.every((tok) => longSet.has(tok));
}

/** Локальная часть учётной записи: «i:0#.f|membership|ivanov.ii@x.ru» → «ivanov.ii». */
export function accountLocalPart(login) {
  let raw = String(login ?? "").trim().toLowerCase();
  if (!raw) return "";
  // Отбрасываем префиксы: "i:0#.f|membership|", "lenta\", "domain/".
  for (const sep of ["|", "\\", "/"]) {
    if (raw.includes(sep)) raw = raw.slice(raw.lastIndexOf(sep) + 1);
  }
  return raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
}

/** Логины одного человека: полная запись или совпадение локальных частей. */
export function loginsMatch(a, b) {
  const la = String(a ?? "").trim().toLowerCase();
  const lb = String(b ?? "").trim().toLowerCase();
  if (!la || !lb) return false;
  if (la === lb) return true;
  const pa = accountLocalPart(la);
  const pb = accountLocalPart(lb);
  return pa !== "" && pa === pb;
}

/** Id взявшего из любой формы задачи (поле, raw, вложенный объект). */
export function takerIdOf(task) {
  if (!task || typeof task !== "object") return null;
  const raw = task.raw || {};
  const candidates = [
    task.EditorId, task.editorId, task.OData__EditorId,
    task.ModifiedById, task.AuthorId,
    raw.EditorId, raw.OData__EditorId,
    raw.Editor?.Id, raw.Editor?.results?.[0]?.Id,
    task.Editor?.Id,
  ];
  for (const c of candidates) {
    if (c !== null && c !== undefined && c !== "") return Number(c);
  }
  return null;
}

/** ФИО взявшего (Editor) — строка или объект. */
export function takerTitleOf(task) {
  if (!task || typeof task !== "object") return "";
  const raw = task.raw || {};
  const candidates = [
    task.EditorTitle,
    typeof task.Editor === "string" ? task.Editor : "",
    raw.EditorTitle,
    raw.Editor?.Title,
    raw.Editor?.results?.[0]?.Title,
    typeof task.Editor === "object" ? task.Editor?.Title : "",
  ];
  for (const c of candidates) {
    const name = String(c || "").trim();
    if (name) return name;
  }
  return "";
}

/** Учётная запись взявшего (если SharePoint её отдал). */
export function takerLoginOf(task) {
  if (!task || typeof task !== "object") return "";
  const raw = task.raw || {};
  const candidates = [
    task.EditorLoginName, task.EditorLogin, task.editorLoginName,
    raw.EditorLoginName, raw.Editor?.LoginName, raw.Editor?.Name,
    typeof task.Editor === "object" ? task.Editor?.LoginName : "",
  ];
  for (const c of candidates) {
    const login = String(c || "").trim();
    if (login) return login;
  }
  return "";
}

/**
 * Задачу взял в работу ТЕКУЩИЙ пользователь?
 *
 * @param {any} task — задача/строка таблицы
 * @param {{
 *   currentUserId?: number|string|null,
 *   currentUserTitle?: string,
 *   currentUserLogins?: string[],
 *   currentUserIdBySource?: Record<string, number|null>|null,
 * }} [ctx]
 * @returns {boolean}
 */
export function isTaskTakenByCurrentUser(task, ctx = {}) {
  const { currentUserId = null, currentUserTitle = "", currentUserLogins = [], currentUserIdBySource = null } = ctx;
  const takerId = takerIdOf(task);
  const takerTitle = takerTitleOf(task);
  const takerLogin = takerLoginOf(task);
  if (!takerId && !takerTitle && !takerLogin) return false;

  // Id текущего пользователя: на сайте источника берём ЕГО Id (у разных сайтов Id
  // не совпадают, поэтому «свой» на dob ≠ «свой» на main). Id основного сайта —
  // только для main-задач и для строк без источника.
  const ids = [];
  const sourceId = task?.sourceId && task.sourceId !== "main" ? task.sourceId : "main";
  const hasSourceMap = currentUserIdBySource && typeof currentUserIdBySource === "object";
  if (hasSourceMap) ids.push(currentUserIdBySource[sourceId]);
  if (!hasSourceMap || sourceId === "main") ids.push(currentUserId);
  const wanted = ids
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (takerId !== null && Number.isFinite(takerId) && wanted.includes(takerId)) return true;

  if (currentUserTitle && personNamesMatch(takerTitle, currentUserTitle)) return true;

  const logins = (Array.isArray(currentUserLogins) ? currentUserLogins : [currentUserLogins]).filter(Boolean);
  if (takerLogin && logins.some((l) => loginsMatch(takerLogin, l))) return true;
  return false;
}
