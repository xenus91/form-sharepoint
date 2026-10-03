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
 * @returns {string|null} hash роута или null, если перейти некуда
 */
export function buildTaskFormHash(compositeId, sources = []) {
  const parsed = parseCompositeId(compositeId);
  if (!parsed) return null;
  if (parsed.sourceId === "main") return `#tasks/${parsed.id}`;
  const source = (sources || []).find((s) => s && s.id === parsed.sourceId);
  const listGuid = source?.listGuid ? String(source.listGuid).toLowerCase() : null;
  if (!listGuid) return null;
  return `#dob_tasks/${parsed.id}?list=${listGuid}`;
}

/**
 * Открывает форму задачи. Возвращает true, если навигация произошла.
 * @param {string} compositeId
 * @param {Array<any>} [sources]
 * @returns {boolean}
 */
export function openTaskForm(compositeId, sources = []) {
  const hash = buildTaskFormHash(compositeId, sources);
  if (!hash) return false;
  try {
    window.location.hash = hash;
    return true;
  } catch (_e) {
    void _e;
    return false;
  }
}
