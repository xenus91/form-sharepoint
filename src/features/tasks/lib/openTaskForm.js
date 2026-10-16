// src/features/tasks/lib/openTaskForm.js
// Переход из #tasks в форму редактирования задачи.
//
// Любая задача открывается карточкой #tasks/<Id> — источник один (список Tasks
// этого сайта), отдельных роутов и отдельной формы для задач больше нет:
// заявки и задачи ДОБ вынесены в приложение xenus91/dob-requests (2026-10-16).
//
// Вынесено отдельно от TasksView, чтобы поведение было тестируемым.

import { parseCompositeId } from "../../../tasks/multiSource";
import { isResultCheckTask } from "../../../tasks/contentTypeFields";

/**
 * Задача типа «Результат проверки ООБ» — закрывается диалогом по типу контента.
 * @param {any} task
 * @returns {boolean}
 */
export function isDialogResultTask(task) {
  return isResultCheckTask(task);
}

/**
 * @param {string} compositeId — "<sourceId>:<id>"
 * @returns {string|null} hash роута или null, если перейти некуда
 */
export function buildTaskFormHash(compositeId) {
  const parsed = parseCompositeId(compositeId);
  if (!parsed) return null;
  // Источник один; из чужого источника переходить некуда (старые ссылки не
  // должны открывать задачу основного списка под чужим Id).
  if (parsed.sourceId !== "main") return null;
  return `#tasks/${parsed.id}`;
}

/**
 * Открывает форму задачи. Возвращает true, если навигация произошла.
 * @param {string} compositeId
 * @returns {boolean}
 */
export function openTaskForm(compositeId) {
  const hash = buildTaskFormHash(compositeId);
  if (!hash) return false;
  try {
    window.location.hash = hash;
    return true;
  } catch (_e) {
    void _e;
    return false;
  }
}
