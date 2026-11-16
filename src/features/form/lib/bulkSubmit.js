import apiClient from "../../../api";
import { buildProblemsPalletTitle, PROBLEMS_LIST_TITLE } from "../../../tasks/problemsPallet";
import {
  buildSharePointBatchBody,
  getSharePointBatchContentType,
  getSharePointBatchErrorMessage,
  matchSharePointBatchResults,
  parseSharePointBatchResponse,
  SHAREPOINT_BATCH_SIZE,
} from "./sharepointBatch";

const ITEM_METADATA_TYPE = "SP.Data.ProblemsPalletListItem";
const LIST_ITEMS_URL = `web/lists/getbytitle('${encodeURIComponent(PROBLEMS_LIST_TITLE)}')/items`;

const splitIntoBatches = (items, batchSize) => {
  const batches = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }
  return batches;
};

const getErrorMessage = (error) => {
  const serverMessage = error?.response?.data?.error?.message?.value;
  return String(serverMessage || error?.message || "Неизвестная ошибка SharePoint");
};

const uncertainResult = (row, message) => ({
  rowId: row.id,
  status: "uncertain",
  itemId: null,
  retryable: false,
  message: `Не удалось подтвердить результат отправки. Проверьте список перед повторной отправкой. ${message}`,
});

const buildItemPayload = ({ row, dcThu, operationDateIso, problems, location, shipment }) => ({
  __metadata: { type: ITEM_METADATA_TYPE },
  Title: buildProblemsPalletTitle(dcThu, row.eoNumber),
  THU: row.eoNumber,
  DC_THU: String(dcThu ?? "").trim(),
  RecipientId: row.recipientId,
  Location1: String(location ?? "").trim(),
  Shipment: String(shipment ?? ""),
  WhNotEO: "",
  OperationDate: operationDateIso,
  Problems: {
    __metadata: { type: "Collection(Edm.String)" },
    results: [...problems],
  },
  // В массовой форме вложений нет, поэтому итоговый статус можно задать
  // при создании — не нужен отдельный MERGE для каждого элемента.
  Status: "Выполнено",
});

const sendSharePointBatch = async (client, operations) => {
  const request = buildSharePointBatchBody(operations);
  return client.post("/$batch", request.body, {
    headers: {
      // The outer $batch response is itself a multipart/mixed envelope.
      Accept: "multipart/mixed",
      "Content-Type": request.contentType,
    },
    // Не дать Axios сериализовать multipart-тело как JSON.
    transformRequest: [(data) => data],
  });
};

const createResultFromResponse = (row, response) => {
  const statusCode = Number(response?.status);
  const itemId = response?.body?.d?.Id ?? response?.body?.Id ?? response?.body?.id;
  if (statusCode >= 200 && statusCode < 300 && itemId != null) {
    return { rowId: row.id, status: "success", itemId, retryable: false, message: "" };
  }

  const message = getSharePointBatchErrorMessage(response);
  if (statusCode >= 400 && statusCode < 500) {
    return {
      rowId: row.id,
      status: "failed",
      itemId: null,
      retryable: true,
      message,
    };
  }

  return uncertainResult(row, message);
};

/**
 * Создаёт отдельную заявку на каждую строку через SharePoint $batch,
 * максимум по 15 элементов за один HTTP-запрос. Каждая запись помещена
 * в отдельный changeset, чтобы ошибка одной ЕО не отменяла остальные.
 * Неоднозначный результат пакета помечается uncertain и не предлагается
 * к автоматическому повтору.
 */
export async function createBulkProblemsPalletItems({
  rows,
  dcThu,
  operationDateIso,
  problems,
  location,
  shipment = "",
  client = apiClient,
  onRowResult,
}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const results = new Array(rows.length);
  let rowOffset = 0;

  for (const rowBatch of splitIntoBatches(rows, SHAREPOINT_BATCH_SIZE)) {
    const operations = rowBatch.map((row, index) => ({
      method: "POST",
      url: LIST_ITEMS_URL,
      changeSet: true,
      contentId: String(index + 1),
      headers: {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
      },
      body: buildItemPayload({ row, dcThu, operationDateIso, problems, location, shipment }),
    }));

    let batchResults = [];
    try {
      const response = await sendSharePointBatch(client, operations);
      const outerStatus = Number(response?.status);
      if (outerStatus >= 300) {
        throw new Error(`SharePoint вернул HTTP ${outerStatus} для $batch.`);
      }
      const parsed = parseSharePointBatchResponse(
        response?.data,
        getSharePointBatchContentType(response),
      );
      batchResults = matchSharePointBatchResults(parsed, operations);
    } catch (error) {
      const message = getErrorMessage(error);
      rowBatch.forEach((row, index) => {
        const result = uncertainResult(row, message);
        results[rowOffset + index] = result;
        if (typeof onRowResult === "function") onRowResult(result);
      });
      rowOffset += rowBatch.length;
      continue;
    }

    rowBatch.forEach((row, index) => {
      const entry = batchResults[index];
      const result = entry
        ? createResultFromResponse(row, entry)
        : uncertainResult(row, "В ответе SharePoint нет результата для этой строки.");
      results[rowOffset + index] = result;
      if (typeof onRowResult === "function") onRowResult(result);
    });
    rowOffset += rowBatch.length;
  }

  return results;
}
