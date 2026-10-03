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
export function resolveResultFlow(choiceValue, rule, opts = {}) {
  if (!rule || rule.source === "empty") {
    return { action: "complete", reason: "no-behaviour" };
  }
  if (rule.requiresLocation === true) {
    return { action: "location", reason: "behaviour.loc" };
  }
  // ⭐ Таблица (попап по строке) не умеет собирать поля карточки. Поле Location1
  // умеет собрать диалог «Где найдена ЕО?» — используем его; для остальных полей
  // не пишем результат «молча», а открываем карточку задачи (решение: не терять
  // обязательные поля и не завершать задачу без них).
  const promptFields = Array.isArray(rule.promptFields) ? rule.promptFields : [];
  const hasLocationField = promptFields.some(
    (f) => String(f?.internalName || f?.f || "").trim().toLowerCase() === "location1"
  );
  const onlyLocationField = promptFields.length === 1 && hasLocationField;
  if (opts.fromTable === true && onlyLocationField && rule.requiresConfirmed !== true) {
    return { action: "location", reason: "behaviour.p.Location1" };
  }
  if (opts.fromTable === true && promptFields.length > 0) {
    // Другие поля или ещё и подтверждение (c) — диалог этого не умеет: открываем карточку,
    // чтобы не потерять обязательные поля и не завершить задачу без подтверждения.
    return { action: "open-card", reason: "behaviour.needs-form" };
  }
  if (opts.fromTable === true && rule.showAdditionalActions === true) {
    return { action: "open-card", reason: "behaviour.needs-form" };
  }
  // ⭐ ic: подтверждение показано двумя кнопками в самой карточке, диалог не нужен —
  // к моменту вызова пользователь уже нажал «Создать заявку».
  if (rule.inlineConfirm === true) {
    return { action: "complete", reason: "behaviour.ic" };
  }
  if (rule.requiresConfirmed === true) {
    return { action: "confirm", reason: "behaviour.c" };
  }
  // prompt-поля и доп. действия обрабатываются inline в карточке,
  // но если карточка делегировала сюда — завершаем напрямую.
  return { action: "complete", reason: "behaviour-direct" };
}
