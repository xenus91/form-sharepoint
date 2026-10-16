// src/tasks/hashRoute.js
// Разбор hash-роута #tasks/<n>.
//
// История: роут задумывался как «открыть элемент ProblemsPallet #n и найти его
// задачу». Но в приложении <n> — это ещё и Id ЗАДАЧИ (клик по строке таблицы,
// ссылки на карточку задачи), из-за чего #tasks/688 для задачи с Id 688 уходил
// в элементный поиск и заканчивался «Связанная задача для элемента #688 не
// найдена».
//
// Правило (kind="auto", путь #tasks/<n>):
//   1) задача с Id = n в загруженном списке → показываем её карточку;
//   2) иначе догружаем задачу по Id с сервера → показываем карточку;
//   3) иначе — старый элементный путь (ProblemsPallet #n → RelatedItems.ItemId).
//
// Явный элементный вид ссылки (#tasks/id=n, #tasks?elementid=n) и THU
// (17–18 цифр) сразу идут в элементный путь — обратная совместимость.

export const THU_RE = /^\d{17,18}$/;

/**
 * @param {any} value
 * @returns {boolean} 17–18 цифр — это ЕО (THU), а не Id задачи/элемента
 */
export function isThuValue(value) {
  return THU_RE.test(String(value ?? "").trim());
}

/**
 * Ищет задачу с указанным Id в уже загруженном списке.
 * @param {Array<any>} tasks
 * @param {number|string} id
 * @returns {object|null}
 */
export function findTaskByIdInList(tasks, id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  return (tasks || []).find((t) => Number(t?.Id) === n) || null;
}

/**
 * @typedef {object} HashTarget
 * @property {object|null} task — найденная задача (режим "task")
 * @property {"task"|"element"|null} mode — что показывать
 * @property {"list"|"fetch"|null} [source] — откуда взялась задача
 */

/**
 * Определяет, что открывать по hash-роуту.
 *
 * @param {number|string} elementId
 * @param {{
 *   tasks?: Array<any>,
 *   fetchTaskById?: ((id:string) => Promise<object|null>)|null,
 *   kind?: "auto"|"element"
 * }} [opts]
 * @returns {Promise<HashTarget>}
 */
export async function resolveHashTarget(elementId, opts = {}) {
  const { tasks = [], fetchTaskById = null, kind = "auto" } = opts;
  const idStr = String(elementId ?? "").trim();
  if (!idStr) return { task: null, mode: null };
  // Явный элементный вид ссылки или ЕО по THU — сразу элементный путь.
  if (kind === "element" || isThuValue(idStr)) return { task: null, mode: "element" };

  const local = findTaskByIdInList(tasks, idStr);
  if (local) return { task: local, mode: "task", source: "list" };

  if (typeof fetchTaskById === "function") {
    try {
      const fetched = await fetchTaskById(idStr);
      if (fetched) return { task: fetched, mode: "task", source: "fetch" };
    } catch (_e) {
      void _e;
    }
  }
  return { task: null, mode: "element" };
}
