// src/features/tasks/lib/taskTakeover.js
// Перехват задачи, взятой в работу другим сотрудником.
//
// Договорённость: если с момента взятия в работу прошло больше 30 минут,
// блокировка «задача у другого» снимается — её может взять и завершить любой.
//
// Отдельного поля «когда взята в работу» в списке Tasks нет. Единственный
// признак — Modified: взятие в работу обновляет его (см. lib/cardTasks.js).
// Побочный эффект осознанный: любое другое изменение задачи тоже сдвигает
// отсчёт — «свежая активность = владелец ещё работает».

export const TAKEOVER_AFTER_MINUTES = 30;

/**
 * Когда задачу последний раз меняли (= брали в работу).
 * @param {any} task — задача или сырая строка SharePoint
 * @returns {number|null} мс с эпохи либо null, если отметки нет
 */
export function takenInWorkAtMs(task) {
  const raw = task?.Modified ?? task?.raw?.Modified ?? null;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Можно ли перехватить задачу, которая висит в работе у другого.
 *
 * Без отметки времени перехват НЕ разрешаем: иначе блокировка снималась бы
 * вслепую на любых неполных данных, и две правки пошли бы параллельно.
 *
 * @param {any} task
 * @param {{ now?: number, minutes?: number }} [opts]
 * @returns {boolean}
 */
export function isTakeoverAvailable(task, opts = {}) {
  const { now = Date.now(), minutes = TAKEOVER_AFTER_MINUTES } = opts;
  const at = takenInWorkAtMs(task);
  if (at === null) return false;
  return now - at >= minutes * 60_000;
}
