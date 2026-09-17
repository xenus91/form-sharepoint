// src/tasks/problemsPallet.js
// Запрос одного элемента ProblemsPallet (по elementId в hash-режиме).
// Используется в TasksView для отображения деталей элемента под hash-карточкой.
// Раньше жило inline в TasksView (~25 строк) — вынесено в Tier 3.

import apiClient from "../api";
import { HASH_LOG, HASH_WARN } from "./log";

export const PROBLEMS_LIST_TITLE = "ProblemsPallet";

const PRIMARY_SELECT = [
  "Id", "Title", "THU", "DC_THU", "Location1", "Problems", "Status",
  "Created", "Modified",
  "Author/Title", "Editor/Title", "Recipient/Title", "Recipient/Id",
  "Shipment", "WhNotEO", "OperationDate",
];
const PRIMARY_EXPAND = ["Author", "Editor", "Recipient"];
const FALLBACK_SELECT = "Id,Title,THU,Location1,Problems,Status,Created,Modified,Author/Title";
const FALLBACK_EXPAND = "Author";

/**
 * Загрузить элемент ProblemsPallet по id.
 * Делает 2 попытки: основную с полным select/expand и fallback с минимальным.
 * Кэшируется автоматически через axios interceptor (TTL 60с).
 *
 * @param {number|string} itemId
 * @returns {Promise<object|null>} сырой data.d из verbose-ответа, или null
 * @throws если обе попытки упали
 */
export async function fetchProblemsPalletItem(itemId) {
  HASH_LOG("fetchProblemsPalletItem start", itemId);
  const id = Number(itemId);
  if (!id) throw new Error("Некорректный Id элемента");
  const primaryUrl = `/web/lists/getbytitle('${PROBLEMS_LIST_TITLE}')/items(${id})?$select=${PRIMARY_SELECT.join(",")}&$expand=${PRIMARY_EXPAND.join(",")}`;
  try {
    HASH_LOG("GET", primaryUrl);
    const { data } = await apiClient.get(primaryUrl, { headers: { Accept: "application/json;odata=verbose" } });
    HASH_LOG("fetchProblemsPalletItem success", data?.d);
    return data?.d || null;
  } catch (e) {
    HASH_WARN("fetchProblemsPalletItem primary failed", e?.response?.status, e?.message, e?.response?.data);
    try {
      const fallbackUrl = `/web/lists/getbytitle('${PROBLEMS_LIST_TITLE}')/items(${id})?$select=${FALLBACK_SELECT}&$expand=${FALLBACK_EXPAND}`;
      HASH_LOG("GET fallback", fallbackUrl);
      const { data } = await apiClient.get(fallbackUrl, { headers: { Accept: "application/json;odata=verbose" } });
      HASH_LOG("fetch fallback success", data?.d);
      return data?.d || null;
    } catch (e2) {
      throw e;
    }
  }
}