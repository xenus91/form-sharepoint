import apiClient, { normalizeNextUrl } from "../../../api";

const RECIPIENTS_URL =
  "/web/lists/getbytitle('SCList')/items?$select=ID,Title,SCNumberText,SCNumber&$top=1000&$orderby=SCNumber asc";

/** Загружает получателей из SCList с учётом пагинации SharePoint. */
export async function fetchBulkRecipientOptions(client = apiClient) {
  let nextUrl = RECIPIENTS_URL;
  const items = [];
  const seenIds = new Set();

  while (nextUrl) {
    const { data } = await client.get(nextUrl, {
      headers: { Accept: "application/json;odata=verbose" },
    });
    const page = data?.d?.results ?? [];

    for (const item of page) {
      const id = item?.ID ?? item?.Id;
      if (id == null || seenIds.has(String(id))) continue;
      seenIds.add(String(id));
      items.push({
        id,
        title: String(item?.Title ?? ""),
        scNumberText: String(item?.SCNumberText ?? ""),
        scNumber: String(item?.SCNumber ?? ""),
      });
    }

    nextUrl = data?.d?.__next ? normalizeNextUrl(data.d.__next) : null;
  }

  return items;
}

export function recipientOptionLabel(recipient) {
  if (!recipient) return "";
  const number = String(recipient.scNumberText || recipient.SCNumberText || recipient.scNumber || recipient.SCNumber || "").trim();
  const title = String(recipient.title || recipient.Title || "").trim();
  if (number && title) return `${number} — ${title}`;
  return number || title;
}
