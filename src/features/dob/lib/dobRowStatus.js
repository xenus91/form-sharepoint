// src/features/dob/lib/dobRowStatus.js
//
// Признак «задача завершена» для строки списка ДОБ (#dob_tasks).
//
// Зачем: таблица ДОБ — это editable-грид (двойной клик по ячейке меняет
// значение). Завершённую задачу править нельзя НИГДЕ: ни в карточке, ни в
// форме по прямой ссылке (#dob_tasks/<id>?list=<GUID>, см. DobTaskEditView),
// ни прямо в ячейке таблицы. Раньше в гриде строку можно было править и в
// «Завершена» — правка копилась в dirty и уезжала пакетным MERGE.

import { isCompletedStatus } from "../../../tasks/status";

/**
 * Имя колонки статуса в этом списке: «Статус» может называться по-разному
 * (в том числе OData__x0421__x0442__x0430__x0442__x0443__x0441).
 * @param {Array<{InternalName?:string, Title?:string}>} fields
 * @returns {string}
 */
export function statusInternalOf(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const found = list.find((f) => {
    const title = String(f?.Title || "").trim().toLowerCase();
    const internal = String(f?.InternalName || "").toLowerCase();
    return title === "статус" || title.includes("статус") || internal === "status";
  });
  return found?.InternalName || "Status";
}

const firstDefined = (...values) => {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/**
 * Завершена ли строка (задача)?
 * @param {object|null} row
 * @param {string} [statusInternal] — имя колонки статуса (см. statusInternalOf)
 * @returns {boolean}
 */
export function isRowCompleted(row, statusInternal = "Status") {
  if (!row || typeof row !== "object") return false;
  const status = firstDefined(
    row.Status,
    row.OData__Status,
    statusInternal ? row[statusInternal] : undefined,
  );
  const percentRaw = firstDefined(row.PercentComplete, row.OData__PercentComplete);
  const percent = percentRaw === undefined ? undefined : Number(percentRaw);
  return isCompletedStatus(status === undefined ? "" : String(status), percent);
}
