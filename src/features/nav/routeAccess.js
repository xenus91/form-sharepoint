// src/features/nav/routeAccess.js
// Чистая логика: маппинг Department → isOOB.
// План: см. artifacts/plan.md (этап 10).

/**
 * Паттерны ООБ-подразделений. Нормализованные (trim, NBSP→space, ё→е, lower-case).
 * Сопоставление — case-insensitive, без ё/е разницы, схлопывание пробелов.
 * @type {string[]}
 */
export const OOB_DEPARTMENT_PATTERNS = [
  "отдел обеспечения бизнеса",
];

/**
 * Нормализация значения подразделения для сравнения.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizeDepartment(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\u00A0/g, " ")   // NBSP → space
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Матчится ли значение одному из OOB-паттернов.
 * @param {string|null|undefined} department
 * @returns {boolean}
 */
export function matchDepartment(department) {
  const norm = normalizeDepartment(department);
  if (!norm) return false;
  return OOB_DEPARTMENT_PATTERNS.some((p) => norm === p || norm.includes(p));
}

/**
 * Резолв доступа на уровне источников.
 * Override через localStorage["department.override"] ∈ {"oob","off"} для отладки.
 * @param {{department?:string|null, departmentOverride?:string|null}} [opts]
 * @returns {{isOOB:boolean, reason:string|null}}
 */
export function resolveRouteAccess(opts = {}) {
  const override = opts.departmentOverride ?? (typeof localStorage !== "undefined" ? localStorage.getItem("department.override") : null);
  if (override === "oob") return { isOOB: true, reason: "override-oob" };
  if (override === "off") return { isOOB: false, reason: "override-off" };
  const ok = matchDepartment(opts.department);
  return {
    isOOB: ok,
    reason: ok ? "department-match" : (opts.department ? "no-match" : "no-department"),
  };
}