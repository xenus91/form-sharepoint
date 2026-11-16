export const SHAREPOINT_BATCH_SIZE = 15;

const createBoundary = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeRequestUrl = (value) => {
  const url = String(value ?? "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  // Внутренний URI в $batch считается от корня SharePoint REST-сервиса
  // (…/_api), поэтому /web/... передаётся как web/...
  return url.replace(/^\/+/, "");
};

const serializeBody = (body) => {
  if (body == null) return "";
  return typeof body === "string" ? body : JSON.stringify(body);
};

const appendHttpHeaders = (lines, headers = {}) => {
  Object.entries(headers).forEach(([name, value]) => {
    if (value == null) return;
    lines.push(`${name}: ${String(value)}`);
  });
};

/**
 * Собирает SharePoint REST $batch. Записи на изменение оборачиваются каждая
 * в собственный changeset: ошибка одной ЕО не должна отменять остальные.
 */
export function buildSharePointBatchBody(operations, { boundary = createBoundary("batch") } = {}) {
  const source = Array.isArray(operations) ? operations : [];
  const lines = [];

  source.forEach((operation, index) => {
    const method = String(operation?.method || "GET").toUpperCase();
    const contentId = String(operation?.contentId ?? index + 1);
    const hasChangeSet = operation?.changeSet ?? !["GET", "HEAD", "OPTIONS"].includes(method);

    if (hasChangeSet) {
      const changesetBoundary = `${boundary}_changeset_${index + 1}`;
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: multipart/mixed; boundary="${changesetBoundary}"`);
      lines.push("");
      lines.push(`--${changesetBoundary}`);
      lines.push("Content-Type: application/http");
      lines.push("Content-Transfer-Encoding: binary");
      lines.push(`Content-ID: ${contentId}`);
      lines.push("");
      lines.push(`${method} ${normalizeRequestUrl(operation?.url)} HTTP/1.1`);
      appendHttpHeaders(lines, operation?.headers);
      lines.push("");
      const body = serializeBody(operation?.body);
      if (body) lines.push(body);
      lines.push(`--${changesetBoundary}--`);
      return;
    }

    lines.push(`--${boundary}`);
    lines.push("Content-Type: application/http");
    lines.push("Content-Transfer-Encoding: binary");
    if (operation?.includeContentId !== false) lines.push(`Content-ID: ${contentId}`);
    lines.push("");
    lines.push(`${method} ${normalizeRequestUrl(operation?.url)} HTTP/1.1`);
    appendHttpHeaders(lines, operation?.headers);
    lines.push("");
    const body = serializeBody(operation?.body);
    if (body) lines.push(body);
  });

  lines.push(`--${boundary}--`);
  return {
    body: lines.join("\r\n"),
    boundary,
    contentType: `multipart/mixed; boundary=${boundary}`,
  };
}

const getBoundary = (contentType = "") => {
  const match = String(contentType).match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  return match?.[1] || match?.[2] || "";
};

const parseMimeHeaders = (rawHeaders = "") => {
  const headers = {};
  String(rawHeaders).split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) return;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  });
  return headers;
};

const normalizeContentId = (value) =>
  String(value ?? "").trim().replace(/^<|>$/g, "");

const splitMultipartPart = (part) => {
  const raw = String(part).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  const separator = /\r?\n\r?\n/.exec(raw);
  if (!separator) return null;
  return {
    headers: parseMimeHeaders(raw.slice(0, separator.index)),
    body: raw.slice(separator.index + separator[0].length),
  };
};

const parseJsonBody = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const parseHttpResponse = (rawResponse, inheritedContentId = "") => {
  const raw = String(rawResponse ?? "").replace(/^\r?\n/, "");
  const lineEnd = /\r?\n/.exec(raw);
  const statusLine = lineEnd ? raw.slice(0, lineEnd.index).trim() : raw.trim();
  const statusMatch = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+.*)?$/i);
  if (!statusMatch) return null;

  const rest = lineEnd ? raw.slice(lineEnd.index + lineEnd[0].length) : "";
  const separator = /\r?\n\r?\n/.exec(rest);
  const responseHeaders = parseMimeHeaders(separator ? rest.slice(0, separator.index) : rest);
  const bodyText = separator ? rest.slice(separator.index + separator[0].length) : "";
  return {
    contentId: normalizeContentId(responseHeaders["content-id"] || inheritedContentId),
    status: Number(statusMatch[1]),
    statusText: statusLine.replace(/^HTTP\/\S+\s+\d{3}\s*/i, ""),
    headers: responseHeaders,
    body: parseJsonBody(bodyText),
  };
};

const parseMultipart = (rawBody, boundary, inheritedContentId = "") => {
  if (!boundary) return [];
  const delimiter = `--${boundary}`;
  const pieces = String(rawBody ?? "").split(delimiter).slice(1);
  const results = [];

  for (const piece of pieces) {
    if (/^--(?:\r?\n|$)/.test(piece)) break;
    const parsedPart = splitMultipartPart(piece);
    if (!parsedPart) continue;

    const partContentId = normalizeContentId(parsedPart.headers["content-id"] || inheritedContentId);
    const contentType = parsedPart.headers["content-type"] || "";
    if (/multipart\/mixed/i.test(contentType)) {
      const nestedBoundary = getBoundary(contentType);
      results.push(...parseMultipart(parsedPart.body, nestedBoundary, partContentId));
      continue;
    }

    const response = parseHttpResponse(parsedPart.body, partContentId);
    if (response) results.push(response);
  }

  return results;
};

/** Парсит multipart-ответ SharePoint в упорядоченные HTTP-ответы вложенных операций. */
export function parseSharePointBatchResponse(data, contentType = "") {
  const rawBody = typeof data === "string" ? data : String(data ?? "");
  const boundary = getBoundary(contentType);
  if (boundary) return parseMultipart(rawBody, boundary);

  const directResponse = parseHttpResponse(rawBody);
  return directResponse ? [directResponse] : [];
}

/** Сопоставляет ответы с операциями по Content-ID, с fallback на порядок ответа. */
export function matchSharePointBatchResults(results, operations) {
  const entries = Array.isArray(results) ? results : [];
  const source = Array.isArray(operations) ? operations : [];
  return source.map((operation, index) => {
    const contentId = normalizeContentId(operation?.contentId ?? index + 1);
    const matched = entries.find((entry) => normalizeContentId(entry?.contentId) === contentId);
    if (matched) return matched;
    return entries.length === source.length ? entries[index] || null : null;
  });
}

/** Возвращает сообщение ошибки из verbose-ответа SharePoint. */
export function getSharePointBatchErrorMessage(response, fallback = "Неизвестная ошибка SharePoint") {
  const body = response?.body;
  const message = body?.error?.message?.value
    || body?.error?.message
    || body?.["odata.error"]?.message?.value
    || body?.message;
  return String(message || (response?.status ? `HTTP ${response.status}` : fallback));
}

/** Возвращает Content-Type ответа независимо от типа заголовков Axios. */
export function getSharePointBatchContentType(response) {
  const headers = response?.headers;
  return String(
    headers?.get?.("content-type")
    || headers?.["content-type"]
    || headers?.["Content-Type"]
    || "",
  );
}
