// src/tasks/problemsPallet.js
// Запрос одного элемента ProblemsPallet (по elementId в hash-режиме).
// Используется в TasksView для отображения деталей элемента под hash-карточкой.
// Раньше жило inline в TasksView (~25 строк) — вынесено в Tier 3.

import apiClient from "../api";
import { HASH_LOG, HASH_WARN } from "./log";

export const PROBLEMS_LIST_TITLE = "ProblemsPallet";

/**
 * Формирует Title элемента ProblemsPallet: "<DC_THU>_<THU>" без пробелов.
 * Пример: DC_THU="1234", THU="12345678901234567" → "1234_12345678901234567".
 * Если одной из частей нет — возвращается только вторая (без лишнего "_").
 *
 * @param {string|number} dcThu — значение поля DC_THU (РЦ/склад)
 * @param {string|number} thu — значение поля THU (номер ЕО)
 * @returns {string}
 */
export function buildProblemsPalletTitle(dcThu, thu) {
  const dc = String(dcThu ?? "").replace(/\s+/g, "").trim();
  const th = String(thu ?? "").replace(/\s+/g, "").trim();
  if (dc && th) return `${dc}_${th}`;
  return dc || th;
}

const PRIMARY_SELECT = [
  "Id", "Title", "THU", "DC_THU", "Location1", "Problems", "Status",
  "Created", "Modified",
  "Author/Title", "Editor/Title", "Recipient/Title", "Recipient/Id",
  "Shipment", "WhNotEO", "OperationDate",
];
// AttachmentFiles здесь же, чтобы не делать второй запрос за счётчиком
// вложений для скрепки (раньше уходил отдельный
// items?$select=Id&$expand=AttachmentFiles&$filter=Id eq <id>).
const PRIMARY_EXPAND = ["Author", "Editor", "Recipient", "AttachmentFiles"];
const FALLBACK_SELECT = "Id,Title,THU,Location1,Problems,Status,Created,Modified,Author/Title";
const FALLBACK_EXPAND = "Author,AttachmentFiles";

/**
 * Загрузить элемент ProblemsPallet по id.
 * Делает 2 попытки: основную с полным select/expand и fallback с минимальным.
 * Дедуплицируется локально (in-flight + 15 с): данные списков глобальным
 * кэшем намеренно не кэшируются.
 *
 * @param {number|string} itemId
 * @returns {Promise<object|null>} сырой data.d из verbose-ответа, или null
 * @throws если обе попытки упали
 */
// Данные списков намеренно НЕ кэшируются axios-интерцептором (иначе поллеры
// встали бы на устаревшее), поэтому дедуп живёт здесь. Эффект useHashElement
// перезапускается, когда поздно приходит distribution, — без этого элемент
// запрашивался дважды за одно открытие #tasks/<Id>.
const _ppInflight = new Map();
const _ppRecent = new Map();
const PP_RECENT_TTL_MS = 15_000;

export async function fetchProblemsPalletItem(itemId) {
  HASH_LOG("fetchProblemsPalletItem start", itemId);
  const _id = Number(itemId);
  if (_id) {
    const rec = _ppRecent.get(_id);
    if (rec && Date.now() - rec.at < PP_RECENT_TTL_MS) {
      HASH_LOG("fetchProblemsPalletItem recent cache hit", _id);
      return rec.data;
    }
    if (_ppInflight.has(_id)) {
      HASH_LOG("fetchProblemsPalletItem in-flight dedup", _id);
      return _ppInflight.get(_id);
    }
  }
  const promise = _fetchProblemsPalletItem(itemId);
  if (_id) {
    _ppInflight.set(_id, promise);
    promise
      .then((data) => { _ppRecent.set(_id, { data, at: Date.now() }); })
      .catch(() => {})
      .finally(() => { _ppInflight.delete(_id); });
  }
  return promise;
}

async function _fetchProblemsPalletItem(itemId) {
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