import apiClient from "../../../api";
import { PROBLEMS_LIST_TITLE } from "../../../tasks/problemsPallet";
import { findNotFoundRecipientDuplicate, notFoundDuplicateSinceIso } from "./notFoundDuplicate";

/** Загружает список недавних заявок для одной пары ЕО + получатель. */
export async function findRecentNotFoundRecipientDuplicate({
  eoNumber,
  recipientId,
  editingItemId = null,
  client = apiClient,
  now = Date.now(),
} = {}) {
  const eo = String(eoNumber ?? "").trim();
  const recipient = Number(recipientId);
  if (!eo || eo === "ЕО отсутствует" || !Number.isInteger(recipient) || recipient <= 0) return null;

  const sinceIso = notFoundDuplicateSinceIso(now);
  const filter = `(THU eq '${eo}' and RecipientId eq ${recipient} and Created ge datetime'${sinceIso}')`;
  try {
    const response = await client.get(
      `/web/lists/getbytitle('${encodeURIComponent(PROBLEMS_LIST_TITLE)}')/items`
      + `?$filter=${encodeURIComponent(filter)}`
      + "&$select=Id,THU,RecipientId,DC_THU,Created,Problems,Location1,Author/Title"
      + "&$expand=Author",
      { headers: { Accept: "application/json;odata=verbose" } },
    );
    const rows = response?.data?.d?.results || [];
    return findNotFoundRecipientDuplicate(rows, {
      eoNumber: eo,
      recipientId: recipient,
      editingItemId,
      sinceIso,
    });
  } catch (error) {
    console.error("Ошибка при проверке дубля ЕО и получателя:", error);
    // Как и прежние проверки формы, сбой чтения не блокирует оператора.
    return null;
  }
}
