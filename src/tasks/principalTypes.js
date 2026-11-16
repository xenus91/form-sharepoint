export const PRINCIPAL_TYPE_MASK = Object.freeze({
  USER: 1,
  DISTRIBUTION_LIST: 2,
  SECURITY_GROUP: 4,
  SHAREPOINT_GROUP: 8,
});

const GROUP_MASK = PRINCIPAL_TYPE_MASK.DISTRIBUTION_LIST
  | PRINCIPAL_TYPE_MASK.SECURITY_GROUP
  | PRINCIPAL_TYPE_MASK.SHAREPOINT_GROUP;

/** Привести числовой или текстовый тип SharePoint principal к битовой маске. */
export function normalizePrincipalType(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric) && numeric >= 0) return numeric;

  const type = String(value).toLowerCase().replace(/[^a-z]/g, "");
  if (type === "user") return PRINCIPAL_TYPE_MASK.USER;
  if (type === "distributionlist") return PRINCIPAL_TYPE_MASK.DISTRIBUTION_LIST;
  if (type === "securitygroup") return PRINCIPAL_TYPE_MASK.SECURITY_GROUP;
  if (type === "sharepointgroup" || type === "sitegroup") return PRINCIPAL_TYPE_MASK.SHAREPOINT_GROUP;
  return null;
}

/** True только для почтовой рассылки (PrincipalType=2), не для других групп. */
export function isDistributionListPrincipalType(value) {
  return normalizePrincipalType(value) === PRINCIPAL_TYPE_MASK.DISTRIBUTION_LIST;
}

/** True для групп без пользовательского бита; тип 15 (user + groups) отклоняется. */
export function isGroupPrincipalType(value) {
  const type = normalizePrincipalType(value);
  return type !== null
    && (type & PRINCIPAL_TYPE_MASK.USER) === 0
    && (type & GROUP_MASK) !== 0;
}
