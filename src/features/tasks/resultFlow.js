// src/features/tasks/resultFlow.js
// Единственное место, где решается, что делать при выборе результата.
//
// Принцип: поведение задаётся ТОЛЬКО через TaskBehaviour (Behaviour).
// Если для задачи/выбранного значения правил нет — задача просто завершается
// по нажатию кнопки: никаких диалогов, подтверждений и анимаций.

/**
 * @typedef {"complete"|"confirm"|"location"} ResultFlowAction
 */

/**
 * Определяет поток обработки выбранного результата.
 *
 * @param {string} choiceValue — выбранное значение Result-поля
 * @param {object|null} rule — результат resolveBehaviour() (или null, если правил нет)
 * @returns {{action: ResultFlowAction, reason: string}}
 */
export function resolveResultFlow(choiceValue, rule) {
  if (!rule || rule.source === "empty") {
    return { action: "complete", reason: "no-behaviour" };
  }
  if (rule.requiresLocation === true) {
    return { action: "location", reason: "behaviour.loc" };
  }
  if (rule.requiresConfirmed === true) {
    return { action: "confirm", reason: "behaviour.c" };
  }
  // prompt-поля и доп. действия обрабатываются inline в карточке,
  // но если карточка делегировала сюда — завершаем напрямую.
  return { action: "complete", reason: "behaviour-direct" };
}
