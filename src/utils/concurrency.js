// src/utils/concurrency.js
// Promise.all с ограничением concurrency — чтобы не спамить SP REST при fan-out.
//
// Использование:
//   const results = await runWithConcurrency(items, 5, async (item) => {
//     return fetchSomething(item);
//   });
//
// Семантика:
//   - до `limit` задач летят параллельно;
//   - как только одна завершается (resolve или reject), стартует следующая;
//   - порядок results соответствует порядку items.

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit  максимум одновременно выполняемых задач
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function runWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const cap = Math.max(1, Math.min(limit || 1, items.length));
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: cap }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (e) {
        results[idx] = e;
      }
    }
  });
  await Promise.all(workers);
  return results;
}