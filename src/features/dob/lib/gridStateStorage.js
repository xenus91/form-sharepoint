// src/features/dob/lib/gridStateStorage.js
//
// Сохранение пользовательских настроек таблицы AG Grid (требование 2026-10-15:
// «добавь возможность сохранения пользовательских настроек ag-grid»).
//
// Как это устроено в AG Grid v33:
//   • api.getState() возвращает единый объект GridState (порядок/ширина/
//     видимость/закрепление колонок, фильтры, группы строк, агрегаты,
//     сортировка, пагинация, состояние панелей);
//   • восстанавливается он опцией initialState — она читается гридом ОДИН раз
//     при инициализации (см. gridOptions.d.ts: «Can be used in conjunction with
//     api.getState() to save and restore grid state»). Отдельного
//     api.applyState() в 33.3.2 нет — поэтому сброс настроек делается
//     пересозданием грида (key у <AgGridReact>).
//
// Храним в localStorage по ключу на раздел, чтобы настройки таблицы заявок
// не пересекались с другими списками.

/** Префикс ключа localStorage. */
export const GRID_STATE_STORAGE_PREFIX = 'dob:grid-state';

/**
 * Версия формата настроек. Поднимаем её, когда меняем раскладку таблицы
 * (состав колонок, режим группировки): сохранённое состояние от прошлой версии
 * способно «заморозить» таблицу в старом виде — например, без групп строк, и
 * тогда «Свернуть все группы» просто не сработает.
 *
 * v3 (2026-10-15): таблица вернулась к поведению коммита 14bed60 (полноширинная
 * строка группы + агрегаты в разделе «Значения» и в строке состояния). Версию
 * оставили v3, чтобы настройки, записанные промежуточными сборками, не
 * восстанавливали устаревшую раскладку.
 */
export const GRID_STATE_VERSION = 'v3';

/**
 * Ключ localStorage для настроек конкретной таблицы.
 * @param {string} [scope] — идентификатор таблицы (по умолчанию «requests»)
 * @returns {string}
 */
export function gridStateKey(scope = 'requests') {
  const clean = String(scope || '').trim().toLowerCase() || 'requests';
  return `${GRID_STATE_STORAGE_PREFIX}:${GRID_STATE_VERSION}:${clean}`;
}

// Восстанавливать прокрутку и фокус ячейки смысла нет: строки между визитами
// меняются, а «уехавший» скролл выглядит как баг. Агрегаты (aggregation) —
// часть настроек пользователя, их сохраняем.
const DROP_ON_SAVE = new Set(['scroll', 'focusedCell', 'rowSelection', 'cellSelection']);

/**
 * Что из состояния сохраняем.
 * @param {object|null|undefined} state — результат api.getState()
 * @returns {object|null}
 */
export function pickPersistedState(state) {
  if (!state || typeof state !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(state)) {
    if (DROP_ON_SAVE.has(key)) continue;
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Читаем сохранённые настройки. Любая ошибка (нет localStorage, битый JSON,
 * состояние от другой версии грида) — «настроек нет», таблица открывается в
// состоянии по умолчанию.
 * @param {string} key
 * @returns {object|null}
 */
export function loadGridState(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // Из состояния, записанного другой сборкой, могло прийти то, что мы
    // намеренно не храним (прокрутка, фокус) — такие ключи не применяем.
    for (const key of DROP_ON_SAVE) delete parsed[key];
    return Object.keys(parsed).length > 0 ? parsed : null;
  } catch (_e) {
    void _e;
    return null;
  }
}

/**
 * Сохраняем настройки. Ошибки хранилища (режим приватности, квота) не должны
 * ронять таблицу.
 * @param {string} key
 * @param {object|null|undefined} state — результат api.getState()
 * @returns {boolean} — записано ли
 */
export function saveGridState(key, state) {
  const picked = pickPersistedState(state);
  if (!picked) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(picked));
    return true;
  } catch (_e) {
    void _e;
    return false;
  }
}

/**
 * Сброс сохранённых настроек.
 * @param {string} key
 * @returns {boolean} — было ли что удалять
 */
export function clearGridState(key) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const had = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    return had;
  } catch (_e) {
    void _e;
    return false;
  }
}
