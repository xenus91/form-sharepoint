import apiClient from "../../../api";
import { buildProblemsPalletTitle, PROBLEMS_LIST_TITLE } from "../../../tasks/problemsPallet";

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
 * Создаёт элементы ProblemsPallet по одному, как обычная форма.
 * Каждый результат сообщается по мере завершения — при частичной ошибке уже
 * созданные элементы не отправляются повторно, а повторная попытка касается
 * только тех строк, которые безопасно можно отправить ещё раз.
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
  const digest = await getRequestDigest(client);
  const results = [];

  for (const row of rows) {
    let itemId = null;
    let result;
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
        `/web/lists/getbytitle('${encodeURIComponent(PROBLEMS_LIST_TITLE)}')/items`,
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
        result = {
          rowId: row.id,
          status: "uncertain",
          itemId: null,
          retryable: false,
          message: "SharePoint не вернул Id. Проверьте список перед повторной отправкой.",
        };
      } else {
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
          result = { rowId: row.id, status: "success", itemId, retryable: false, message: "" };
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
            result = {
              rowId: row.id,
              status: "failed",
              itemId,
              retryable: true,
              message: `Не удалось установить статус; созданный элемент удалён. ${getErrorMessage(statusError)}`,
            };
          } catch (rollbackError) {
            result = {
              rowId: row.id,
              status: "uncertain",
              itemId,
              retryable: false,
              message: `Элемент #${itemId} создан, но статус не установлен, а удалить его не удалось. Проверьте SharePoint. ${getErrorMessage(rollbackError)}`,
            };
          }
        }
      }
    } catch (createError) {
      const statusCode = Number(createError?.response?.status);
      // 4xx означает отказ SharePoint до создания элемента. Для сетевой ошибки
      // или 5xx нельзя исключить, что сервер успел сохранить запись до обрыва.
      const retryable = statusCode >= 400 && statusCode < 500;
      result = {
        rowId: row.id,
        status: retryable ? "failed" : "uncertain",
        itemId: null,
        retryable,
        message: retryable
          ? getErrorMessage(createError)
          : `Не удалось подтвердить результат запроса. Проверьте список перед повторной отправкой. ${getErrorMessage(createError)}`,
      };
    }

    results.push(result);
    if (typeof onRowResult === "function") onRowResult(result);
  }

  return results;
}
