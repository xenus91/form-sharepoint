// src/features/tasks/lib/openTaskForm.js
// Переход из #tasks в форму редактирования задачи.
//
// • main-задача (compositeId "main:<Id>") → #tasks/<Id> — существующая форма
//   основного сайта.
// • задача внешнего источника (например "dob:1") → #dob_tasks/<Id>?list=<guid>
//   — та же форма, что в разделе «Заявки ДОБ» (DobTaskEditView), но с полями и
//   сохранением в список источника (GUID берём из конфига источника).
//
// Вынесено отдельно от TasksView, чтобы поведение было тестируемым.

import { parseCompositeId } from "../../../tasks/multiSource";

/**
 * @param {string} compositeId — "<sourceId>:<id>"
 * @param {Array<{id:string, listGuid?:string|null}>} [sources]
 * @param {{action?:string|null}} [opts] — action=<значение результата>: форма задачи
 *   открывается сразу с выбранным результатом (как будто в карточке нажали кнопку).
 *   Нужно, когда по Behaviour у результата есть prompt-поля/доп. действия — их
 *   заполняет КАРТОЧКА, а таблица только переводит пользователя в неё.
 * @returns {string|null} hash роута или null, если перейти некуда
 */
export function buildTaskFormHash(compositeId, sources = [], opts = {}) {
  const parsed = parseCompositeId(compositeId);
  if (!parsed) return null;
  if (parsed.sourceId === "main") {
    const action = opts.action ? `?action=${encodeURIComponent(String(opts.action))}` : "";
    return `#tasks/${parsed.id}${action}`;
  }
  const source = (sources || []).find((s) => s && s.id === parsed.sourceId);
  const listGuid = source?.listGuid ? String(source.listGuid).toLowerCase() : null;
  if (!listGuid) return null;
  return `#dob_tasks/${parsed.id}?list=${listGuid}`;
}

/**
 * Открывает форму задачи. Возвращает true, если навигация произошла.
 * @param {string} compositeId
 * @param {Array<any>} [sources]
 * @param {{action?:string|null}} [opts]
 * @returns {boolean}
 */
export function openTaskForm(compositeId, sources = [], opts = {}) {
  const hash = buildTaskFormHash(compositeId, sources, opts);
  if (!hash) return false;
  try {
    window.location.hash = hash;
    return true;
  } catch (_e) {
    void _e;
    return false;
  }
}
