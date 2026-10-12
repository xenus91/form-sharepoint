// src/features/dob/components/requestForm/requestDefaults.js
// Значения по умолчанию в форме создания заявки.
//
// Требование 2026-10-12: «поля DC и InitiatingDepartment заполняются из свойств
// Office и Department пользователя». Профиль берётся из SharePoint
// (GetMyProperties → App.jsx → userProfile), поэтому здесь только сопоставление
// «поле ← свойство профиля» и подгон значения под тип контрола.

/** Поле формы ← свойство профиля пользователя. */
export const PROFILE_PREFILL_FIELDS = {
  dc: "office",
  initiatingdepartment: "department",
};

/** App.jsx кладёт «Не указано», когда свойства в профиле нет. */
const NOT_SET = new Set(["", "не указано", "not specified", "null", "undefined"]);

function clean(value) {
  const text = String(value ?? "").trim();
  return NOT_SET.has(text.toLowerCase()) ? "" : text;
}

/** «РЦ-8114» → «8114» (в списке DC может храниться только номер РЦ). */
export function officeSuffix(office) {
  const text = clean(office);
  if (!text) return "";
  const parts = text.split("-");
  return parts.length > 1 ? parts[parts.length - 1].trim() : text;
}

function findChoice(choices, value) {
  const wanted = String(value ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return (choices || []).map(String).find((c) => c.trim().toLowerCase() === wanted) || null;
}

/**
 * Подгоняет значение профиля под контрол: в список (Choice) пишем только
 * существующий вариант, в текст — как есть.
 * @returns {string|Array<string>|undefined} undefined — поле не заполняем
 */
export function fitPrefillValue(control, raw) {
  const value = clean(raw);
  if (!value) return undefined;
  const kind = control?.kind;
  if (kind === "person" || kind === "boolean") return undefined;

  if (kind === "multichoice") {
    const match = findChoice(control?.choices, value)
      || findChoice(control?.choices, officeSuffix(value));
    return match ? [match] : undefined;
  }

  if (kind === "select") {
    // Выбор без свободного ввода: чужого значения в списке быть не должно.
    return findChoice(control?.choices, value)
      || findChoice(control?.choices, officeSuffix(value))
      || undefined;
  }

  if (kind === "number") {
    const num = Number(value.replace(",", "."));
    return Number.isFinite(num) ? value : undefined;
  }

  // text / autocomplete / richtext / url / date — значение профиля как есть
  return value;
}

/**
 * Значения по умолчанию для набора полей.
 * @param {Array<{internalName:string,kind:string,choices?:string[]}>} controls
 * @param {{userOffice?:string,userDepartment?:string,Office?:string,Department?:string}} [profile]
 * @returns {Record<string, any>}
 */
export function buildPrefillValues(controls, profile = {}) {
  const source = {
    office: clean(profile?.userOffice ?? profile?.Office),
    department: clean(profile?.userDepartment ?? profile?.Department),
  };
  const values = {};
  for (const control of controls || []) {
    const key = PROFILE_PREFILL_FIELDS[String(control?.internalName || "").toLowerCase()];
    if (!key) continue;
    const fitted = fitPrefillValue(control, source[key]);
    if (fitted === undefined) continue;
    values[control.internalName] = fitted;
  }
  return values;
}
