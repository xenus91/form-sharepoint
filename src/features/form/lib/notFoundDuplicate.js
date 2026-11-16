import { NOT_FOUND_PROBLEM } from "./otherProblemConflict";

export const NOT_FOUND_DUPLICATE_LOOKBACK_HOURS = 12;

/** Нижняя граница поиска недавней заявки «Не найдена». */
export function notFoundDuplicateSinceIso(now = Date.now()) {
  return new Date(now - NOT_FOUND_DUPLICATE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

/** Есть ли в заявке именно проблема «Не найдена». */
export function hasNotFoundProblem(rowOrProblems) {
  const value = Array.isArray(rowOrProblems)
    ? rowOrProblems
    : rowOrProblems?.Problems?.results ?? rowOrProblems?.Problems ?? [];
  const problems = Array.isArray(value) ? value : [];
  return problems.some((problem) => String(problem ?? "").trim() === NOT_FOUND_PROBLEM);
}

/**
 * Находит недавнюю заявку по той же паре ЕО + получатель, содержащую «Не найдена».
 * Автор и РЦ не ограничиваются: уникальность определяется именно этой парой.
 */
export function findNotFoundRecipientDuplicate(rows, {
  eoNumber,
  recipientId,
  editingItemId = null,
  sinceIso = notFoundDuplicateSinceIso(),
} = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const normalizedEo = String(eoNumber ?? "").trim();
  const normalizedRecipient = String(recipientId ?? "").trim();
  const skipId = editingItemId == null ? null : Number(editingItemId);
  const sinceTime = new Date(sinceIso).getTime();
  if (!normalizedEo || !normalizedRecipient || Number.isNaN(sinceTime)) return null;

  return source.find((row) => {
    if (!row) return false;
    if (skipId !== null && Number(row.Id) === skipId) return false;
    if (String(row.THU ?? "").trim() !== normalizedEo) return false;
    if (String(row.RecipientId ?? row.Recipient?.Id ?? "").trim() !== normalizedRecipient) return false;
    const createdTime = new Date(row.Created).getTime();
    if (Number.isNaN(createdTime) || createdTime < sinceTime) return false;
    return hasNotFoundProblem(row);
  }) || null;
}
