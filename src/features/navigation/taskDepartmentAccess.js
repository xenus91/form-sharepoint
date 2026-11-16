const ALLOWED_NAME_PARTS = new Set(["поршаков сергей", "сергей поршаков"]);

/** Проверка имени из SharePoint User Profile для переключателя подразделения. */
export function canSwitchTaskDepartment(userName) {
  const normalized = String(userName ?? "")
    .normalize("NFKC")
    .replace(/ё/gi, "е")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const nameParts = normalized.split(/\s+/).slice(0, 2).join(" ");
  return ALLOWED_NAME_PARTS.has(nameParts);
}
