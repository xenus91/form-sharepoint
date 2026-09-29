// src/utils/apiError.js
// Разбор ошибок SharePoint REST → короткий человекочитаемый текст.
// Нужно, чтобы в UI показывать реальную причину («поле X отсутствует»),
// а не общую фразу «проверьте поля».

function pickMessage(data) {
  if (!data) return "";
  // SP: { error: { message: { value } } } или { error: { message: "…" } }
  if (typeof data?.error?.message?.value === "string") return data.error.message.value;
  if (typeof data?.error?.message === "string") return data.error.message;
  if (typeof data?.["odata.error"]?.message?.value === "string") return data["odata.error"].message.value;
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.message === "string") return data.message;
  return "";
}

/** HTTP-статус ошибки (или null). */
export function apiErrorStatus(error) {
  const status = error?.response?.status ?? error?.status ?? null;
  return typeof status === "number" ? status : null;
}

/** Короткое описание ошибки: "HTTP 400 · Поле «Location1» не существует…". */
export function describeApiError(error) {
  if (!error) return "";
  const status = apiErrorStatus(error);
  const message = pickMessage(error?.response?.data) || pickMessage(error?.response) || error?.message || "";
  const text = String(message).replace(/\s+/g, " ").trim().slice(0, 300);
  const parts = [];
  if (status) parts.push(`HTTP ${status}`);
  if (text) parts.push(text);
  return parts.join(" · ");
}

/** Имя поля из текста ошибки SharePoint ("Column 'X' does not exist", "Поле «X»"). */
export function extractFieldFromError(error) {
  const text = String(pickMessage(error?.response?.data) || error?.message || "");
  const m =
    text.match(/column\s+['"«]?([^'"»]+)['"»]?/i) ||
    text.match(/field\s+['"«]?([^'"»]+)['"»]?/i) ||
    text.match(/пол[ея]\s+['"«]?([^'"»]+)['"»]?/i);
  return m ? m[1].trim() : "";
}

/** Сырые данные ответа сервера (для логов). */
export function apiErrorPayload(error) {
  const data = error?.response?.data;
  if (!data) return null;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data).slice(0, 500);
  }
}
