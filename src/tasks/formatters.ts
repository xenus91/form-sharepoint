// src/tasks/formatters.js
// Хелперы для задач: форматирование дат (formatDueLeft, formatDueDateFull,
// formatSolveTime) и извлечение TK/SC номера из задачи/строки.
// Раньше жили inline в TasksView.jsx — вынесены сюда, чтобы переиспользоваться
// в TaskCard и loadTasks без циклических импортов.

const TK_RE = /(?:SC|СЦ|TK|ТК)[\-_#\s]*\d+[A-Za-z0-9А-Яа-я\-_]*/i;
const SC_RE = /(?:SC|СЦ)[\-_#\s]*\d+[A-Za-z0-9А-Яа-я\-_]*/i;
const TK_SHORT_RE = /(?:SC|СЦ|TK|ТК)[\-_#\s]*\d+/i;
const SC_SHORT_RE = /(?:SC|СЦ)[\-_#\s]*\d+/i;
const THU_RE = /\b\d{17,18}\b/;

/**
 * Возвращает "осталось Xд Yч" / "просрочено на Xд Yч".
 * @param {string|Date} dueDate
 * @returns {{ label: string, color: 'success'|'warning'|'info'|'error'|'default', overdue: boolean, ms: number|null }}
 */
export function formatDueLeft(dueDate) {
  if (!dueDate) return { label: "Без срока", color: "default", overdue: false, ms: null };
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return { label: "Без срока", color: "default", overdue: false, ms: null };
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));
  let str = "";
  if (days > 0) str = `${days}д ${hours}ч`;
  else if (hours > 0) str = `${hours}ч ${mins}м`;
  else str = `${mins}м`;
  if (diff > 0) {
    if (days > 1) return { label: `Осталось ${str}`, color: "success", overdue: false, ms: diff };
    if (hours < 2) return { label: `Осталось ${str}`, color: "warning", overdue: false, ms: diff };
    return { label: `Осталось ${str}`, color: "info", overdue: false, ms: diff };
  } else {
    return { label: `Просрочено ${str} назад`, color: "error", overdue: true, ms: diff };
  }
}

/**
 * Полная дата/время в ru-RU формате.
 * @param {string|Date} dueDate
 * @returns {string}
 */
export function formatDueDateFull(dueDate) {
  if (!dueDate) return "—";
  try { return new Date(dueDate).toLocaleString("ru-RU"); } catch { return String(dueDate); }
}

/**
 * Время решения задачи (Created → Modified).
 * @param {{ Created?: string|Date, Modified?: string|Date }} task
 * @returns {{ label: string, color: string, title: string }}
 */
export function formatSolveTime(task) {
  const created = task.Created ? new Date(task.Created) : null;
  const modified = task.Modified ? new Date(task.Modified) : null;
  if (!created || !modified || isNaN(created) || isNaN(modified)) {
    return { label: "Решено", color: "default", title: "Время решения" };
  }
  const diff = modified.getTime() - created.getTime();
  if (diff < 0 || diff < 60000) {
    const mins = Math.max(1, Math.floor(diff / 60000));
    return { label: mins <= 1 ? "Решено за 1м" : `Решено за ${mins}м`, color: "default", title: `Создана: ${created.toLocaleString("ru-RU")} • Завершена: ${modified.toLocaleString("ru-RU")}` };
  }
  const minsTotal = Math.floor(diff / 60000);
  const days = Math.floor(minsTotal / (60 * 24));
  const hours = Math.floor((minsTotal % (60 * 24)) / 60);
  const mins = minsTotal % 60;
  let str = "";
  if (days > 0) str = `${days}д ${hours}ч`;
  else if (hours > 0) str = `${hours}ч ${mins}м`;
  else str = `${mins}м`;
  const title = `Создана: ${created.toLocaleString("ru-RU")} • Завершена: ${modified.toLocaleString("ru-RU")} (${str})`;
  return { label: `Решено за ${str}`, color: "default", title };
}

/**
 * Извлечь TK/ТК/SC/СЦ номер из строки (например из Recipient).
 * Возвращает "Без ТК" если не нашли.
 */
export function extractTKNumber(recipient) {
  if (!recipient) return "Без ТК";
  const str = String(recipient).trim();
  if (!str) return "Без ТК";
  const m = str.match(TK_RE);
  if (m) {
    return m[0].toUpperCase().replace(/\s+/g, "").replace("СЦ","SC").replace("ТК","TK");
  }
  return "Без ТК";
}

/**
 * Legacy: extractSCNumber (используется extractSCNumberFromTask).
 */
export function extractSCNumber(recipient) {
  if (!recipient) return "Без ТК";
  const str = String(recipient).trim();
  if (!str) return "Без ТК";
  const m = str.match(SC_RE);
  if (m) {
    return m[0].toUpperCase().replace(/\s+/g, "").replace("СЦ", "ТК");
  }
  return "Без ТК";
}

/**
 * Извлечь TK-номер из задачи. Используется для группировки карточек.
 * Логика совпадает с оригинальным inline в TasksView.jsx (см. Q11 декомпозиции).
 */
export function extractTKNumberFromTask(task) {
  if (!task) return "Без ТК";
  const direct = task.TKNumber || task.SCNumber || task.TK_x0020_Number || task.raw?.SCNumber || task.raw?.Recipient_x003a_SCNumberText || task.raw?.Recipient_x003A_SCNumberText;
  if (direct) {
    const s = String(direct).trim();
    if (/^\d+$/.test(s)) return `TK${s}`;
    const sc = extractTKNumber(s);
    if (sc !== "Без ТК") return sc;
    if (s) return s.slice(0, 30);
  }
  if (task.SCNumber) {
    const s = String(task.SCNumber).trim();
    if (/^\d+$/.test(s)) return `TK${s}`;
    const sc = extractTKNumber(s);
    if (sc !== "Без ТК") return sc;
  }
  if (task.Recipient) {
    const sc = extractTKNumber(task.Recipient);
    if (sc !== "Без ТК") return sc;
  }
  const bodySc = task.Body ? String(task.Body).match(TK_SHORT_RE) : null;
  if (bodySc) return extractTKNumber(bodySc[0]);
  const titleSc = task.Title ? String(task.Title).match(TK_SHORT_RE) : null;
  if (titleSc) return extractTKNumber(titleSc[0]);
  return "Без ТК";
}

/**
 * Извлечь SC-номер из задачи (legacy, используется для группировки в SC-режиме).
 */
export function extractSCNumberFromTask(task) {
  if (!task) return "Без ТК";
  const direct = task.SCNumber || task.raw?.SCNumber || task.raw?.ScNumber || task.raw?.Recipient_x003a_SCNumberText;
  if (direct) {
    const s = String(direct).trim();
    if (/^\d+$/.test(s)) return `SC${s}`;
    const sc = extractSCNumber(s);
    if (sc !== "Без ТК") return sc;
    if (s) return s.slice(0, 30);
  }
  if (task.Recipient) {
    const sc = extractSCNumber(task.Recipient);
    if (sc !== "Без ТК") return sc;
  }
  const bodySc = task.Body ? String(task.Body).match(SC_SHORT_RE) : null;
  if (bodySc) return extractSCNumber(bodySc[0]);
  const titleSc = task.Title ? String(task.Title).match(SC_SHORT_RE) : null;
  if (titleSc) return extractSCNumber(titleSc[0]);
  return "Без ТК";
}

/**
 * Извлечь THU (17-18 цифр) из задачи.
 * Используется в TaskCard (для ЕО-номера) и в hashSearch (для поиска задачи по THU).
 */
export function extractEONumberFromTask(task) {
  if (!task) return "";
  const candidates = [task.Title, task.Body, task.THU, task.EONumber, task.raw?.THU, task.raw?.Title, task.raw?.Body];
  for (const c of candidates) {
    if (!c) continue;
    const m = String(c).match(THU_RE);
    if (m) return m[0];
  }
  try {
    const rawStr = task.raw ? JSON.stringify(task.raw) : "";
    const m2 = rawStr.match(THU_RE);
    if (m2) return m2[0];
  } catch {}
  return "";
}