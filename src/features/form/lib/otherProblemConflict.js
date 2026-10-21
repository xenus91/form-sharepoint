// src/features/form/lib/otherProblemConflict.js
//
// Конфликт «Не найдена» с уже зарегистрированной проблемой по тому же ЕО.
//
// Когда оператор выбирает проблему «Не найдена», по этому же номеру ЕО на том же
// РЦ за последние 48 часов могла быть подана заявка с КОНКРЕТНОЙ проблемой. Тогда
// «Не найдена» противоречит уже внесённым данным — перед отправкой надо спросить
// подтверждение.
//
// Вынесено из App.jsx: выбор строки-конфликта — чистая функция, её можно
// проверить тестами без SharePoint и без подъёма формы.

/**
 * Окно поиска конфликта «Не найдена» — в часах.
 *
 * 48, а не 24: за смену ЕО может «потеряться» и найтись на следующий день,
 * и тогда вчерашняя заявка с конкретной проблемой всё ещё релевантна.
 */
export const OTHER_PROBLEM_LOOKBACK_HOURS = 48;

/** Заголовок диалога-предупреждения. */
export const OTHER_PROBLEM_DIALOG_TITLE = "По этой ЕО уже есть проблема";

/**
 * Склонение слова «час» под число: 1 час, 2 часа, 5 часов, 21 час, 48 часов.
 *
 * @param {number} n
 * @returns {string} — например, "48 часов"
 */
export function pluralHours(n) {
  const num = Math.abs(Math.trunc(Number(n)));
  const n10 = num % 10;
  const n100 = num % 100;
  let word = "часов";
  if (n10 === 1 && n100 !== 11) word = "час";
  else if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) word = "часа";
  return `${Number(n)} ${word}`;
}

/** «48 часов» — подпись окна поиска для текста предупреждения. */
export function otherProblemLookbackLabel() {
  return pluralHours(OTHER_PROBLEM_LOOKBACK_HOURS);
}

/**
 * Нижняя граница окна поиска в ISO — для `$filter ... Created ge datetime'…'`.
 *
 * @param {number} [now] — текущее время в мс (параметр для тестов)
 * @returns {string}
 */
export function otherProblemSinceIso(now = Date.now()) {
  return new Date(now - OTHER_PROBLEM_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

/**
 * Сообщение предупреждения по частям — чтобы данные найденной заявки (проблемы
 * и локацию) можно было выделить в интерфейсе, а не только показать строкой.
 *
 * @param {{thu?: string, problems?: string, location?: string, lookbackHours?: number}} params
 * @returns {Array<{text: string, strong: boolean}>}
 */
export function otherProblemWarningSegments({
  thu = "",
  problems = "",
  location = "",
  lookbackHours = OTHER_PROBLEM_LOOKBACK_HOURS,
} = {}) {
  const list = String(problems ?? "").trim();
  const loc = String(location ?? "").trim();
  /** @type {Array<{text: string, strong: boolean}>} */
  const segments = [
    { text: `По ЕО ${thu} за последние ${pluralHours(lookbackHours)} на этом РЦ уже зарегистрирована проблема в другой заявке`, strong: false },
  ];
  if (list) {
    segments.push({ text: ": ", strong: false }, { text: list, strong: true });
  }
  segments.push({ text: ".", strong: false });
  if (loc) {
    segments.push({ text: " Локация: ", strong: false }, { text: loc, strong: true }, { text: ".", strong: false });
  }
  segments.push({
    text: ` Вы выбрали «${NOT_FOUND_PROBLEM}». Действительно подать заявку или ЕО всё-таки нашлась?`,
    strong: false,
  });
  return segments;
}

/**
 * Тот же текст одной строкой — из тех же сегментов, чтобы строка и разметка не
 * разъезжались. Удобен для тестов и логов.
 *
 * @param {{thu?: string, problems?: string, location?: string, lookbackHours?: number}} params
 * @returns {string}
 */
export function otherProblemWarningText(params = {}) {
  return otherProblemWarningSegments(params)
    .map((seg) => seg.text)
    .join("");
}

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
 * Локация найденной заявки (поле Location1) — для текста предупреждения.
 * Оператору важно видеть, где именно нашли паллету: это главный аргумент,
 * что ЕО всё-таки нашлась.
 *
 * @param {object|null} row
 * @returns {string}
 */
export function otherProblemLocationLabel(row) {
  return String(row?.Location1 ?? "").trim();
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
