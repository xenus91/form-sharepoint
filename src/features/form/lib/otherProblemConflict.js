// src/features/form/lib/otherProblemConflict.js
//
// Конфликт «Не найдена» с уже зарегистрированной проблемой по тому же ЕО.
//
// Когда оператор выбирает проблему «Не найдена», по этому же номеру ЕО на том же
// РЦ за последние 24 часа могла быть подана заявка с КОНКРЕТНОЙ проблемой. Тогда
// «Не найдена» противоречит уже внесённым данным — перед отправкой надо спросить
// подтверждение.
//
// Вынесено из App.jsx: выбор строки-конфликта — чистая функция, её можно
// проверить тестами без SharePoint и без подъёма формы.

/** Проблема «ЕО не найдена» — её совпадением не считаем. */
export const NOT_FOUND_PROBLEM = "Не найдена";

/**
 * Есть ли в заявке проблемы ДРУГИЕ, чем «Не найдена».
 *
 * @param {string[]|null|undefined} problems
 * @returns {boolean}
 */
export function hasOtherProblems(problems) {
  const list = Array.isArray(problems) ? problems : [];
  return list.some((p) => String(p ?? "").trim() !== "" && String(p).trim() !== NOT_FOUND_PROBLEM);
}

/**
 * Найти заявку, которая конфликтует с «Не найдена».
 *
 * @param {Array<object>} rows — строки ProblemsPallet (verbose: Problems.results)
 * @param {{editingItemId?: number|string|null}} [opts] — редактируемую заявку не считаем конфликтом
 * @returns {object|null}
 */
export function findOtherProblemRow(rows, { editingItemId = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const skipId = editingItemId == null ? null : Number(editingItemId);
  for (const row of list) {
    if (!row) continue;
    if (skipId !== null && Number(row.Id) === skipId) continue;
    if (hasOtherProblems(row.Problems?.results)) return row;
  }
  return null;
}

/** Проблемы найденной заявки одной строкой — для текста предупреждения. */
export function otherProblemsLabel(row) {
  const list = row?.Problems?.results;
  return Array.isArray(list) ? list.map((p) => String(p)).join(", ") : "";
}

/**
 * Какая проверка ЕО относится к выбранному набору проблем.
 *
 * Проверки взаимоисключающие — иначе они срабатывают одновременно и перекрывают
 * друг друга:
 *   • «notfound» — выбрана «Не найдена»: ищем на РЦ заявку по этому ЕО с ДРУГОЙ
 *     проблемой (findOtherProblemRow);
 *   • «duplicate» — любая другая проблема: старая проверка «вы уже отправляли
 *     заявку с этим ЕО за 24 часа».
 *
 * @param {string[]|null|undefined} problems
 * @returns {"notfound"|"duplicate"}
 */
export function eoCheckKindForProblems(problems) {
  const list = Array.isArray(problems) ? problems : [];
  const hasNotFound = list.some((p) => String(p ?? "").trim() === NOT_FOUND_PROBLEM);
  return hasNotFound ? "notfound" : "duplicate";
}

/**
 * Подпись текущей пары «номер ЕО + тип проверки». По ней видно, менялось ли
 * что-то с последней проверки: один и тот же набор не спрашиваем дважды.
 *
 * @param {string} eo
 * @param {string[]|null|undefined} problems
 * @returns {string}
 */
export function eoCheckSignature(eo, problems) {
  return `${String(eo ?? "").trim()}|${eoCheckKindForProblems(problems)}`;
}
