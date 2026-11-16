export const BULK_EO_CONCURRENCY_LIMIT = 4;

/**
 * Применяет async-функцию к элементам с ограниченным числом одновременных задач.
 * Массив результатов сохраняет исходный порядок, даже если задачи завершаются
 * в другом порядке.
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [];

  const requestedLimit = Number(concurrency);
  const safeLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.floor(requestedLimit)
    : BULK_EO_CONCURRENCY_LIMIT;
  const workerCount = Math.min(source.length, Math.max(1, safeLimit));
  const results = new Array(source.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= source.length) return;
      results[index] = await mapper(source[index], index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
