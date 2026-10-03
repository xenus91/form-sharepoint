// src/features/nav/routeAccess.js
// Чистая логика: маппинг Department → isOOB.
// План: см. artifacts/plan.md (этап 10).

/**
 * Паттерны ООБ-подразделений. Нормализованные (trim, NBSP→space, ё→е, lower-case).
 * Сопоставление — substring match (любой паттерн должен быть подстрокой Department).
 * Избегаем слишком коротких паттернов ("ооб"), чтобы не было ложных срабатываний.
 * @type {string[]}
 */
export const OOB_DEPARTMENT_PATTERNS = [
  "отдел обеспечения бизнеса",
  "обеспечения бизнеса",
  // Аббревиатура допускается только если Department выглядит как ООБ:
  // содержит "ооб" ровно как токен (через пробел или скобку), не как часть "ообеспечения"
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
 * Аббревиатура ООБ — только как отдельный токен (через пробел, скобку или дефис).
 * @param {string} norm — нормализованный Department
 */
function hasOobAbbreviation(norm) {
  // "ооб" — отдельное слово или в скобках: "ооб", "(ооб)", "ооб рц-..."
  return /(^|[\s\(\-])ооб($|[\s\)\-])/.test(norm) || /^ооб$/.test(norm);
}

/**
 * Матчится ли значение одному из OOB-паттернов.
 * @param {string|null|undefined} department
 * @returns {boolean}
 */
export function matchDepartment(department) {
  const norm = normalizeDepartment(department);
  if (!norm) return false;
  if (OOB_DEPARTMENT_PATTERNS.some((p) => norm.includes(p))) return true;
  if (hasOobAbbreviation(norm)) return true;
  return false;
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