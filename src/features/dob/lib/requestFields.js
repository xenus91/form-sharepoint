// src/features/dob/lib/requestFields.js
// Состав колонок страницы заявок (#dob_requests).
//
// Требование пользователя (2026-10-12): показывать только НУЖНЫЕ поля заявок —
// это все поля, которые описаны в ТИПАХ КОНТЕНТА списка, и остальные поля
// списка, кроме системных/скрытых. Раньше грид строил колонки просто по всем
// полям списка со своим локальным списком исключений.
//
// Порядок колонок:
//   1) ID и заголовок;
//   2) поля типов контента (в том порядке, в каком они идут в списке полей);
//   3) остальные несистемные поля списка.

import { ctIdOf, matchesContentType } from "./requestListFilters";

// Служебные колонки SharePoint: они есть у каждого элемента и смысла в таблице
// заявок не несут. Набор перенесён из DobGrid (systemSkip) — теперь он один.
export const SYSTEM_LIST_FIELDS = new Set([
  "File_x0020_Type", "ComplianceAssetId", "LinkTitle", "LinkTitleNoMenu", "PermMask",
  "MetaInfo", "FileRef", "FileDirRef", "FileLeafRef", "ContentType", "ContentTypeId",
  "_UIVersionString", "DocIcon", "ItemChildCount", "FolderChildCount",
  "OData__ContentTypeId", "Attachments", "CheckoutUserId", "CheckedOutUserId",
  "_IsRecord", "AppAuthor", "AppEditor", "GUID", "WorkflowVersion", "WorkflowInstanceID",
]);

// Инфраструктура приложения и служебные колонки. ВАЖНО: это НЕ тот же набор, что
// HIDDEN_FORM_FIELDS из dobFormFields — там скрыт, например, Modified (в форме
// дата показывается иначе), а в таблице заявок это полезная колонка.
const TABLE_HIDDEN_FIELDS = new Set([
  "AdditionalActions", "AdditionalActionsRequired", "Edit",
]);

// Колонки с кодированными русскими именами («x041d_x0435__x0434…»): мусор,
// который SharePoint отдаёт как отдельные поля. Правило общее для таблицы и для
// формы заявки — экспортируем, чтобы не плодить вторую копию.
export function isEncodedJunkName(name) {
  return /^(?:x|_x)0[0-9a-f]{3}/i.test(String(name || ""));
}

// Колонки, которые намеренно не показываем: «результат проверки» живёт в форме,
// а тип контента дублировался бы отдельной колонкой.
function isExcludedField(field) {
  const internal = String(field?.InternalName || "");
  const title = String(field?.Title || "");
  if (/chekresult/i.test(internal)) return true;
  if (/результат.*провер/i.test(title)) return true;
  if (title === "Тип контента" || title.toLowerCase().includes("тип контента")) return true;
  return false;
}

/**
 * Как показывать тип контента пользователю: берём его ОПИСАНИЕ (Description),
 * а внутреннее имя (Name) — только запасной вариант. Требование 2026-10-12:
 * «сами названия типов контента должны браться из его Описания».
 * @param {{Description?:string,Name?:string,StringId?:string,Id?:string}} ct
 * @returns {string}
 */
export function contentTypeDisplayName(ct) {
  const description = String(ct?.Description ?? "").trim();
  if (description) return description;
  return String(ct?.Name ?? ct?.StringId ?? ct?.Id ?? "").trim();
}

/**
 * Внутренние имена полей из FieldLinks всех типов контента списка.
 *
 * @param {Array<{FieldLinks?:Array|{results:Array}}>} contentTypes
 * @returns {Set<string>}
 */
export function collectCtFieldNames(contentTypes) {
  const names = new Set();
  for (const ct of contentTypes || []) {
    const links = Array.isArray(ct?.FieldLinks) ? ct.FieldLinks : ct?.FieldLinks?.results;
    for (const link of links || []) {
      const name = link?.Name || link?.InternalName;
      if (name) names.add(String(name));
    }
  }
  return names;
}

/** Поле годится в таблицу заявок? */
export function isRequestTableField(field) {
  if (!field || !field.InternalName) return false;
  const name = String(field.InternalName);
  if (field.Hidden === true) return false;
  // «OData__X» и «_X» — служебные дубли обычного поля X.
  if (/^OData__?/.test(name) || name.startsWith("_")) return false;
  if (SYSTEM_LIST_FIELDS.has(name) || TABLE_HIDDEN_FIELDS.has(name)) return false;
  if (isEncodedJunkName(name)) return false;
  return !isExcludedField(field);
}

/**
 * Колонки таблицы заявок: поля типов контента + остальные несистемные.
 *
 * @param {Array<object>} fields — поля списка (метаданные SharePoint)
 * @param {{ctFieldNames?: Set<string>|string[]}} [opts]
 * @returns {Array<object>} поля в порядке показа
 */
export function selectRequestFields(fields, opts = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const ctNames = opts.ctFieldNames instanceof Set
    ? opts.ctFieldNames
    : new Set(Array.isArray(opts.ctFieldNames) ? opts.ctFieldNames : []);

  const byInternal = new Map();
  for (const f of list) {
    if (f?.InternalName && !byInternal.has(f.InternalName)) byInternal.set(f.InternalName, f);
  }

  const out = [];
  const push = (name) => {
    const f = byInternal.get(name);
    if (f && isRequestTableField(f) && !out.includes(f)) out.push(f);
  };

  // 1) идентификатор и заголовок
  push("ID");
  push("Title");
  // 2) поля типов контента
  for (const f of list) {
    if (ctNames.has(f.InternalName)) push(f.InternalName);
  }
  // 3) остальные несистемные
  for (const f of list) push(f.InternalName);
  return out;
}


/** Поле синтетической колонки «Тип контента» (в списке такой колонки нет). */
export const DOB_CT_COLUMN_FIELD = "dobContentType";

/**
 * Имя типа контента строки списка. ContentTypeId элемента длиннее Id
 * родительского типа контента, поэтому сравниваем и как префикс
 * (matchesContentType). Список типов должен быть отсортирован «от длинного Id к
 * короткому», чтобы наследник не перекрыл родителя.
 * @param {object|null|undefined} row — строка списка
 * @param {Array<{id:string,name:string}>} cts — Id и имена типов контента
 * @returns {string}
 */
export function contentTypeNameOfRow(row, cts) {
  const rowCt = ctIdOf(row);
  if (!rowCt) return "";
  for (const ct of cts || []) {
    if (matchesContentType(rowCt, ct.id)) return ct.name;
  }
  return "";
}
