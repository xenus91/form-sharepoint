// src/features/form/lib/eoMissingRoute.js
//
// Роут главной формы, который открывает её с уже выбранной проблемой
// «Не найдена»: #eoismissing (а также /eoismissing без hash — для ссылок извне).
//
// Вынесено из App.jsx, чтобы распознавание роута можно было проверить тестами:
// сам App для этого поднимать целиком не нужно.

/** Проблема, которую роут выбирает заранее. */
export const EO_MISSING_PROBLEM = "Не найдена";

/** Местоположение, которое ставится вместе с этой проблемой (как в handleChange). */
export const EO_MISSING_LOCATION = "Не найдена в зоне отгрузки";

const HASH_PATTERNS = ["eoismissing", "eo-is-missing", "eo_is_missing"];

/**
 * Ведёт ли адрес на «форму с проблемой Не найдена».
 *
 * @param {string} [hash] — window.location.hash (с «#» или без)
 * @param {string} [pathname] — window.location.pathname
 * @returns {boolean}
 */
export function isEoMissingRoute(hash = "", pathname = "") {
  const low = String(hash || "").toLowerCase();
  if (HASH_PATTERNS.some((p) => low.includes(p))) return true;
  return /eo[-_]?is[-_]?missing/i.test(String(pathname || ""));
}
