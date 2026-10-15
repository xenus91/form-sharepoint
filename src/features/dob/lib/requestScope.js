// src/features/dob/lib/requestScope.js
//
// Какие заявки видит сотрудник в #dob_requests (требование 2026-10-15).
//
//   * сотрудник отдела «Отдел по обеспечению бизнеса» — заявки своего офиса:
//       DC = Office сотрудника;
//   * остальные сотрудники — DC = Office И InitiatingDepartment = Department;
//   * Поршаков Сергей — исключение: фильтр по подразделению к нему не
//     применяется вовсе (видит все заявки).
//
// Те же самые значения (Office/Department из профиля) форма создания пишет в
// поля DC и InitiatingDepartment (см. requestForm/requestDefaults.js), поэтому
// сравниваем с учётом той же нормализации: «РЦ-8114» и «8114» — один офис.
//
// Модуль намеренно чистый: без React и без запросов, поэтому правило можно
// проверить юнит-тестом.

import { cellText } from "./cellText";

/** Отдел, которому достаточно совпадения по офису (DC). */
export const OOB_DEPARTMENT = "отдел по обеспечению бизнеса";

/**
 * Сотрудники, к которым фильтр по подразделению не применяется.
 * Сравниваем по токенам ФИО: подойдёт и «Поршаков Сергей», и
 * «Поршаков Сергей Иванович», но не «Иванов Сергей».
 */
export const SCOPE_EXEMPT_USERS = ["поршаков сергей"];

const norm = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** App.jsx кладёт «Не указано», когда свойства в профиле нет. */
const NOT_SET = new Set(["", "не указано", "not specified", "null", "undefined"]);

function clean(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return NOT_SET.has(text.toLowerCase()) ? "" : text;
}

/** «РЦ-8114» → «8114» (в списке DC может храниться только номер РЦ). */
export function officeSuffix(office) {
  const text = clean(office);
  if (!text) return "";
  const parts = text.split("-");
  return parts.length > 1 ? parts[parts.length - 1].trim() : text;
}

/** Все варианты записи офиса: как в профиле и без префикса «РЦ-». */
export function officeVariants(office) {
  const full = clean(office);
  if (!full) return [];
  const suffix = officeSuffix(full);
  const list = [full];
  if (suffix && suffix !== full) list.push(suffix);
  return list.map(norm).filter(Boolean);
}

/** Это сотрудник, к которому фильтр не применяется? */
export function isScopeExempt(displayName) {
  const name = norm(displayName);
  if (!name) return false;
  return SCOPE_EXEMPT_USERS.some((exempt) =>
    norm(exempt)
      .split(" ")
      .filter(Boolean)
      .every((token) => name.includes(token)),
  );
}

/** Это «Отдел по обеспечению бизнеса»? */
export function isOobDepartment(department) {
  return norm(department).includes(OOB_DEPARTMENT);
}

/**
 * Правило видимости для сотрудника.
 * @param {{office?:string, department?:string, displayName?:string}} [profile]
 * @returns {{
 *   mode: "all"|"office"|"office+department",
 *   office: string,
 *   department: string,
 *   warning: string,
 *   reason: string,
 * }}
 */
export function buildRequestScope(profile = {}) {
  const office = clean(profile.office);
  const department = clean(profile.department);
  const base = { office, department, warning: "" };

  if (isScopeExempt(profile.displayName)) {
    return {
      ...base,
      mode: "all",
      reason: "исключение: сотрудник видит все заявки",
    };
  }

  if (!office) {
    return {
      ...base,
      mode: "all",
      reason: "в профиле нет Office",
      warning:
        "В профиле не указан Office — фильтр по подразделению не применён, показаны все заявки.",
    };
  }

  if (isOobDepartment(department)) {
    return { ...base, mode: "office", reason: "Отдел по обеспечению бизнеса: только DC = Office" };
  }

  if (!department) {
    return {
      ...base,
      mode: "all",
      reason: "в профиле нет Department",
      warning:
        "В профиле не указан Department — фильтр по подразделению не применён, показаны все заявки.",
    };
  }

  return {
    ...base,
    mode: "office+department",
    reason: "DC = Office и InitiatingDepartment = Department",
  };
}

/**
 * Внутренние имена колонок, по которым фильтруем.
 * Ищем по InternalName и по Title — в этом списке они не обязаны совпадать.
 * @param {Array<object>} fields
 * @returns {{dc: string|null, department: string|null}}
 */
export function scopeFieldInternals(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const find = (wanted) => {
    const hit = list.find((f) => {
      const internal = String(f?.InternalName || "").trim().toLowerCase();
      const title = String(f?.Title || "").trim().toLowerCase();
      return internal === wanted || title === wanted;
    });
    return hit?.InternalName || null;
  };
  return { dc: find("dc"), department: find("initiatingdepartment") };
}

/** Значение колонки строки с учётом OData__-префиксов SharePoint. */
export function scopeRowValue(row, internal) {
  if (!row || !internal) return "";
  const raw =
    row[internal] ??
    row[`OData__${internal}`] ??
    row[`OData_${internal}`] ??
    (internal.startsWith("_") ? row[internal.slice(1)] : undefined);
  if (raw === undefined || raw === null) return "";
  // Choice/MultiChoice приходят объектами — cellText разворачивает их в текст.
  const text = String(cellText(raw)).replace(/<[^>]*>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Значение DC совпадает с офисом сотрудника?
 *
 * Сравниваем и как есть, и по «хвосту» после дефиса: в профиле Office бывает
 * «РЦ-8114», а в списке DC — просто «8114» (и наоборот).
 */
export function matchesOffice(rawValue, office) {
  const value = norm(rawValue);
  if (!value) return false;
  if (officeVariants(office).includes(value)) return true;
  const a = norm(officeSuffix(rawValue));
  const b = norm(officeSuffix(office));
  return !!a && a === b;
}

/**
 * Строка попадает в область видимости сотрудника?
 * @param {object} row
 * @param {{dc?:string|null, department?:string|null}} internals
 * @param {ReturnType<typeof buildRequestScope>} scope
 * @returns {boolean}
 */
export function matchesScope(row, internals, scope) {
  if (!scope || scope.mode === "all") return true;
  const dc = scopeRowValue(row, internals?.dc);
  if (!matchesOffice(dc, scope.office)) return false;
  if (scope.mode === "office") return true;
  const dep = norm(scopeRowValue(row, internals?.department));
  return !!dep && dep === norm(scope.department);
}

/**
 * Применяет правило видимости к строкам списка.
 * Если нужной колонки в списке нет — фильтр не применяется и возвращается
 * warning: молча показывать чужие заявки нельзя.
 * @param {Array<object>} rows
 * @param {{fields?:Array<object>, scope?:ReturnType<typeof buildRequestScope>}} options
 * @returns {{rows: Array<object>, warning: string}}
 */
export function applyRequestScope(rows, { fields, scope } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!scope || scope.mode === "all") {
    return { rows: list, warning: scope?.warning || "" };
  }
  const internals = scopeFieldInternals(fields);
  const missing = [];
  if (!internals.dc) missing.push("DC");
  if (scope.mode === "office+department" && !internals.department) {
    missing.push("InitiatingDepartment");
  }
  if (missing.length) {
    return {
      rows: list,
      warning: `В списке нет колонки ${missing.join(" / ")} — фильтр по подразделению не применён, показаны все заявки.`,
    };
  }
  return {
    rows: list.filter((row) => matchesScope(row, internals, scope)),
    warning: "",
  };
}
