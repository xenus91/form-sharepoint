// src/features/dob/lib/requestFormFields.js
// Поля ФОРМЫ создания заявки по типу контента.
//
// Почему не buildContentTypeForm из tasks/contentTypeFields: тот построен под
// форму закрытия задачи и отбрасывает Title, AssignedTo, DueDate, Status,
// Priority (SYSTEM_AND_TASK_FIELDS) — там их правит отдельный UI. В форме
// заявки это как раз основные поля, поэтому набор системных полей здесь свой.
//
// Виды контролов и подписи берём из общего модуля (controlKindOf,
// FIELD_LABEL_OVERRIDES), чтобы форма заявки и форма задачи определяли тип
// контрола одинаково.
import { controlKindOf, FIELD_LABEL_OVERRIDES } from "../../../tasks/contentTypeFields";
import { SYSTEM_LIST_FIELDS, isEncodedJunkName } from "./requestFields";

/** Поля, которых в форме создания заявки быть не должно (служебные/только чтение). */
export const REQUEST_FORM_SKIP_FIELDS = new Set([
  ...SYSTEM_LIST_FIELDS,
  // В таблице Created/Modified — полезные колонки, в форме создания их нет:
  // их проставляет SharePoint.
  "Created", "Modified", "Author", "Editor",
  "ID",
  "Id",
  "Attachments",
  "Body",
]);

const isContentTypeMarker = (f) => String(f?.Title || "").toLowerCase() === "тип контента";

/** Поле типа контента показываем в форме создания заявки? */
export function isRequestFormField(field) {
  if (!field || !field.InternalName) return false;
  if (field.Hidden === true || field.ReadOnlyField === true) return false;
  if (REQUEST_FORM_SKIP_FIELDS.has(field.InternalName)) return false;
  if (/^(?:OData__|_)/i.test(String(field.InternalName))) return false;
  if (isEncodedJunkName(field.InternalName)) return false;
  if (isContentTypeMarker(field)) return false;
  return true;
}

/** Значения выбора из метаданных SharePoint. */
export function choicesOfField(field) {
  const raw = field?.Choices;
  if (Array.isArray(raw)) return raw.map(String);
  if (Array.isArray(raw?.results)) return raw.results.map(String);
  if (typeof raw === "string" && raw.trim()) return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Мультивыбор / «несколько людей». */
export function isMultipleField(field, kind) {
  const type = String(field?.TypeAsString || "").toLowerCase();
  if (kind === "person") return field?.FieldTypeKind === 21 || type === "usermulti";
  return kind === "multichoice";
}

/**
 * Контролы формы создания заявки.
 * @param {Array<object>} fields — поля типа контента (getDobContentTypeFields)
 * @returns {Array<{internalName:string,title:string,kind:string,required:boolean,choices:string[],multiple:boolean,allowFillIn:boolean,description:string,typeAsString:string}>}
 */
export function buildRequestFormControls(fields = []) {
  const controls = [];
  const seen = new Set();
  for (const field of fields || []) {
    if (!isRequestFormField(field)) continue;
    if (seen.has(field.InternalName)) continue;
    const kind = controlKindOf(field);
    // Lookup в форме создания не заполняем: нужен id из списка-источника.
    if (!kind || kind === "lookup") continue;
    seen.add(field.InternalName);
    controls.push({
      internalName: field.InternalName,
      title: field.Title && field.Title !== field.InternalName
        ? String(field.Title)
        : (FIELD_LABEL_OVERRIDES[field.InternalName] || String(field.InternalName)),
      kind,
      typeAsString: String(field.TypeAsString || ""),
      required: field.Required === true,
      choices: choicesOfField(field),
      allowFillIn: field.FillInChoice === true,
      multiple: isMultipleField(field, kind),
      description: field.Description ? String(field.Description) : "",
    });
  }
  return controls;
}
