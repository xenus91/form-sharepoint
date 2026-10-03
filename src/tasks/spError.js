// src/tasks/spError.js
// Разбор ошибок SharePoint REST про несуществующие поля/столбцы.
//
// Зачем: при multi-source выборке список-источник может не содержать полей,
// которые есть на основном сайте (ResultSearchTHU, Location1, OffDepKey,
// AdditionalActions, AdditionalsActionsRequired …). SharePoint отвечает 400
// и в тексте ошибки называет «плохое» свойство. Раньше каждый колл-сайт
// (dobApi.updateDobItem, useTaskMutations.completeTask) разбирал это своими
// регулярками — здесь единая реализация, которую использует и fetchTasks.
//
// Поддерживаемые формулировки (RU/EN):
//   Свойство "ResultSearchTHU" не существует в типе "SP.Data.RequestsTaskListItem".
//   Поле или свойство "Location1" не существует ...
//   Столбца 'OffDepKey' не существует. ...
//   The property 'ResultSearchTHU' does not exist on type '...'
//   Column 'Foo' does not exist. It may have been deleted by another user.
//   Значение "..." для свойства "..." — не тот случай.
// Fallback — OData-энкод вида _x0414_x0020_...

const PATTERNS = [
  // RU: Свойство | Поле | Свойство или поле | Столбец "X" не существует
  /(?:свойство|поле(?:\s+или\s+свойство)?|столбец|столбца)\s+["«'`]?([^"»'`]+?)["»'`]?\s+не\s+существ/i,
  // EN: The property 'X' does not exist | A property named 'X' ...
  /property\s+(?:named\s+)?["'`]?([^"'`]+?)["'`]?\s+does\s+not\s+exist/i,
  /field\s+or\s+property\s+["'`]?([^"'`]+?)["'`]?\s+does\s+not\s+exist/i,
  /column\s+["'`]?([^"'`]+?)["'`]?\s+does\s+not\s+exist/i,
  // EN: property 'X' not found / no such property
  /(?:no\s+such|unknown)\s+(?:property|field|column)\s+["'`]?([^"'`]+?)["'`]?(?:\s|$)/i,
];

function cleanup(name) {
  if (!name) return "";
  return String(name)
    .replace(/^[*"'«»`\s]+|[*"'«»`\s]+$/g, "")
    .replace(/^OData__?/i, "")
    .trim();
}

/**
 * Достаёт имя несуществующего поля из текста ошибки SharePoint.
 * @param {string} message
 * @returns {string} имя поля или "" если распознать не удалось
 */
export function extractMissingField(message) {
  const text = String(message || "");
  if (!text) return "";
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      const name = cleanup(m[1]);
      if (name) return name;
    }
  }
  // Fallback: SharePoint иногда возвращает только OData-энкод имени.
  const odata = text.match(/(_x[0-9A-Fa-f]{4}(?:__x[0-9A-Fa-f]{4})*_?)/);
  if (odata) return cleanup(odata[1]);
  return "";
}

/**
 * Достаёт текст ошибки из объекта ошибки axios/REST.
 * @param {any} err
 * @returns {string}
 */
export function extractSpErrorMessage(err) {
  if (!err) return "";
  return String(
    err?.response?.data?.error?.message?.value ||
      err?.response?.data?.error?.message ||
      err?.response?.data?.["odata.error"]?.message?.value ||
      err?.message ||
      err
  );
}

/**
 * Похоже ли сообщение на «поля не существует» (RU или EN).
 * @param {string} message
 * @returns {boolean}
 */
export function isMissingFieldError(message) {
  const s = String(message || "").toLowerCase();
  if (!s) return false;
  const ruMissing = s.includes("не существует") && (s.includes("свойств") || s.includes("поле") || s.includes("столб"));
  return (
    ruMissing ||
    s.includes("does not exist") ||
    s.includes("not found") ||
    s.includes("no such property") ||
    s.includes("unknown property")
  );
}
