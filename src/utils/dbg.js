// src/utils/dbg.js
// Общая точка включения диагностики логов.
//
// Включить (любой способ):
//   • ?dbg=1 в адресе страницы;
//   • localStorage.setItem("dbg", "1") или localStorage.setItem("dbg_tasks", "1");
//   • ?dbgTask=652 — логи только по задаче с этим Id.
//
// Формат тегов: [completedTasks], [TaskCard:rf], [TaskBehaviour], ...

const readFlag = (name) => {
  try {
    if (typeof window === "undefined") return null;
    const search = new URLSearchParams(window.location.search);
    const fromUrl = search.get(name);
    if (fromUrl != null) return fromUrl;
    return window.localStorage?.getItem(name) ?? null;
  } catch {
    return null;
  }
};

/** Диагностическая запись включена (?dbg=1 / localStorage dbg|dbg_tasks). */
export const DBG_ENABLED = (() => {
  if (readFlag("dbg") === "1") return true;
  if (readFlag("dbg_tasks") === "1") return true;
  return false;
})();

/** Id задачи, по которой нужно логировать подробнее (?dbgTask=652). */
export const DBG_TASK_ID = (() => {
  const raw = readFlag("dbgTask");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

export function isDbg() {
  return DBG_ENABLED;
}

/** Логирует только при включённой диагностике. tag — без скобок, они добавляются. */
export function dbg(tag, ...args) {
  if (!DBG_ENABLED) return;
  try {
    console.log(`[${tag}]`, ...args);
  } catch {}
}

/** То же, но через console.info — видно даже при фильтре консоли по info. */
export function dbgInfo(tag, ...args) {
  if (!DBG_ENABLED) return;
  try {
    console.info(`[${tag}]`, ...args);
  } catch {}
}

/** Ошибки пишем всегда — их нужно видеть без флага. */
export function dbgError(tag, ...args) {
  try {
    console.error(`[${tag}]`, ...args);
  } catch {}
}

/** Предупреждения пишем всегда (например, «поле отсутствует в списке»). */
export function dbgWarn(tag, ...args) {
  try {
    console.warn(`[${tag}]`, ...args);
  } catch {}
}
