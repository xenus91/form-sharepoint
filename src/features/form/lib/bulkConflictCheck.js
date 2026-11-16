import apiClient from "../../../api";
import { PROBLEMS_LIST_TITLE } from "../../../tasks/problemsPallet";
import {
  findOtherProblemRow,
  otherProblemSinceIso,
} from "./otherProblemConflict";
import {
  findNotFoundRecipientDuplicate,
  notFoundDuplicateSinceIso,
} from "./notFoundDuplicate";
import {
  buildSharePointBatchBody,
  getSharePointBatchContentType,
  matchSharePointBatchResults,
  parseSharePointBatchResponse,
  SHAREPOINT_BATCH_SIZE,
} from "./sharepointBatch";

const splitIntoBatches = (items, batchSize) => {
  const batches = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }
  return batches;
};

const escapeODataString = (value) => String(value ?? "").replace(/'/g, "''");

const conflictQueryUrl = (eoNumber, sinceIso) => {
  const filter = `(THU eq '${escapeODataString(eoNumber)}' and Created ge datetime'${sinceIso}')`;
  return `web/lists/getbytitle('${encodeURIComponent(PROBLEMS_LIST_TITLE)}')/items`
    + `?$filter=${encodeURIComponent(filter)}`
    + "&$select=Id,THU,RecipientId,DC_THU,Created,Problems,Location1,Author/Title"
    + "&$expand=Author";
};

/**
 * Перед массовой отправкой одним GET на ЕО ищет:
 * 1) другую проблему по этому ЕО на том же РЦ за 48 часов;
 * 2) заявку «Не найдена» по той же паре ЕО + получатель за 12 часов.
 * Проверки выполняются через $batch максимум по 15 ЕО за HTTP-запрос.
 * Возвращает Map<rowId, {otherProblem, notFoundDuplicate}>.
 */
export async function findOtherProblemsForEos({
  rows,
  eoNumbers,
  dcThu,
  editingItemId = null,
  client = apiClient,
  now = Date.now(),
} = {}) {
  const sourceRows = Array.isArray(rows)
    ? rows
    : (Array.isArray(eoNumbers) ? eoNumbers : []).map((eoNumber, index) => ({
      id: String(index),
      eoNumber,
      recipientId: null,
    }));
  const normalizedRows = sourceRows.map((row, index) => ({
    ...((row && typeof row === "object") ? row : { eoNumber: row }),
    id: String(row?.id ?? index),
    eoNumber: String(row?.eoNumber ?? row ?? "").trim(),
  }));
  const uniqueEos = [...new Set(normalizedRows
    .map((row) => row.eoNumber)
    .filter((eo) => eo && eo !== "ЕО отсутствует"))];
  const conflictsByRow = new Map(normalizedRows.map((row) => [row.id, {
    otherProblem: null,
    notFoundDuplicate: null,
  }]));
  const office = String(dcThu ?? "").trim();
  if (!uniqueEos.length || !office) return conflictsByRow;

  const since48HoursIso = otherProblemSinceIso(now);
  const since12HoursIso = notFoundDuplicateSinceIso(now);
  for (const eoBatch of splitIntoBatches(uniqueEos, SHAREPOINT_BATCH_SIZE)) {
    const operations = eoBatch.map((eo, index) => ({
      method: "GET",
      url: conflictQueryUrl(eo, since48HoursIso),
      changeSet: false,
      includeContentId: false,
      contentId: String(index + 1),
      headers: { Accept: "application/json;odata=verbose" },
    }));

    try {
      const request = buildSharePointBatchBody(operations);
      const response = await client.post("/$batch", request.body, {
        headers: {
          Accept: "multipart/mixed",
          "Content-Type": request.contentType,
        },
        transformRequest: [(data) => data],
      });
      const outerStatus = Number(response?.status);
      if (outerStatus >= 300) throw new Error(`SharePoint вернул HTTP ${outerStatus} для проверки ЕО.`);

      const parsed = parseSharePointBatchResponse(
        response?.data,
        getSharePointBatchContentType(response),
      );
      const batchResults = matchSharePointBatchResults(parsed, operations);
      batchResults.forEach((entry, index) => {
        if (!entry || entry.status < 200 || entry.status >= 300) return;
        const eo = eoBatch[index];
        const records = entry.body?.d?.results || [];
        const sameOfficeRecords = records.filter((record) =>
          String(record?.DC_THU ?? "").trim() === office,
        );
        const otherProblem = findOtherProblemRow(sameOfficeRecords, { editingItemId });

        normalizedRows.forEach((row) => {
          if (row.eoNumber !== eo) return;
          conflictsByRow.set(row.id, {
            otherProblem,
            notFoundDuplicate: findNotFoundRecipientDuplicate(records, {
              eoNumber: row.eoNumber,
              recipientId: row.recipientId,
              editingItemId,
              sinceIso: since12HoursIso,
            }),
          });
        });
      });
    } catch (error) {
      // Как и в одиночной форме, сбой проверки не блокирует отправку.
      console.error("Ошибка пакетной проверки конфликтов ЕО:", error);
    }
  }

  return conflictsByRow;
}
