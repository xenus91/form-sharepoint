import apiClient from "../../../api";
import { buildProblemsPalletTitle, PROBLEMS_LIST_TITLE } from "../../../tasks/problemsPallet";
import { BULK_EO_CONCURRENCY_LIMIT, mapWithConcurrency } from "./bulkConcurrency";

const ITEM_METADATA_TYPE = "SP.Data.ProblemsPalletListItem";

const getRequestDigest = async (client) => {
  const response = await client.post(
    "/contextinfo",
    {},
    { headers: { Accept: "application/json;odata=verbose" } },
  );
  const digest = response?.data?.d?.GetContextWebInformation?.FormDigestValue;
  if (!digest) throw new Error("SharePoint не вернул ключ для отправки формы. Попробуйте ещё раз.");
  return digest;
};

const getErrorMessage = (error) => {
  const serverMessage = error?.response?.data?.error?.message?.value;
  return String(serverMessage || error?.message || "Неизвестная ошибка SharePoint");
};

const getItemUrl = (itemId) =>
  `/web/lists/getbytitle('${encodeURIComponent(PROBLEMS_LIST_TITLE)}')/items(${itemId})`;

/**
 * Создаёт отдельный элемент ProblemsPallet для каждой строки, ограничивая
 * параллелизм четырьмя строками. Каждый результат сообщается по завершении;
 * частичные результаты и безопасный повтор строк сохраняются.
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

  const digest = await getRequestDigest(client);
  const createUrl = `/web/lists/getbytitle('${encodeURIComponent(PROBLEMS_LIST_TITLE)}')/items`;

  const createOne = async (row) => {
    let itemId = null;
    const payload = {
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
    };

    try {
      const createResponse = await client.post(
        createUrl,
        payload,
        {
          headers: {
            Accept: "application/json;odata=verbose",
            "Content-Type": "application/json;odata=verbose",
            "X-RequestDigest": digest,
          },
        },
      );
      itemId = createResponse?.data?.d?.Id;

      if (!itemId) {
        return {
          rowId: row.id,
          status: "uncertain",
          itemId: null,
          retryable: false,
          message: "SharePoint не вернул Id. Проверьте список перед повторной отправкой.",
        };
      }

      try {
        await client.post(
          getItemUrl(itemId),
          {
            __metadata: { type: ITEM_METADATA_TYPE },
            Status: "Выполнено",
          },
          {
            headers: {
              Accept: "application/json;odata=verbose",
              "Content-Type": "application/json;odata=verbose",
              "X-RequestDigest": digest,
              "IF-MATCH": "*",
              "X-HTTP-Method": "MERGE",
            },
          },
        );
        return { rowId: row.id, status: "success", itemId, retryable: false, message: "" };
      } catch (statusError) {
        // Совпадаем с обычной формой: статус выставляется после создания.
        // Если обновить его не удалось, удаляем элемент, чтобы повторная
        // отправка не создала незаметный дубликат.
        try {
          await client.post(getItemUrl(itemId), null, {
            headers: {
              "IF-MATCH": "*",
              "X-HTTP-Method": "DELETE",
              "X-RequestDigest": digest,
              "Content-Type": undefined,
            },
            transformRequest: [(data) => data],
          });
          return {
            rowId: row.id,
            status: "failed",
            itemId,
            retryable: true,
            message: `Не удалось установить статус; созданный элемент удалён. ${getErrorMessage(statusError)}`,
          };
        } catch (rollbackError) {
          return {
            rowId: row.id,
            status: "uncertain",
            itemId,
            retryable: false,
            message: `Элемент #${itemId} создан, но статус не установлен, а удалить его не удалось. Проверьте SharePoint. ${getErrorMessage(rollbackError)}`,
          };
        }
      }
    } catch (createError) {
      const statusCode = Number(createError?.response?.status);
      // 4xx означает отказ SharePoint до создания элемента. Для сетевой ошибки
      // или 5xx нельзя исключить, что сервер успел сохранить запись до обрыва.
      const retryable = statusCode >= 400 && statusCode < 500;
      return {
        rowId: row.id,
        status: retryable ? "failed" : "uncertain",
        itemId: null,
        retryable,
        message: retryable
          ? getErrorMessage(createError)
          : `Не удалось подтвердить результат запроса. Проверьте список перед повторной отправкой. ${getErrorMessage(createError)}`,
      };
    }
  };

  return mapWithConcurrency(rows, BULK_EO_CONCURRENCY_LIMIT, async (row) => {
    const result = await createOne(row);
    if (typeof onRowResult === "function") onRowResult(result);
    return result;
  });
}
