// src/api.js — backward compat shim (§29 API refactor)
// Новый путь: src/api/sharepoint/client.js — единый SharePoint HTTP client.
// Постепенно переносить: import apiClient from "./api/sharepoint/client"

import apiClient, { invalidate, getCacheStats, cachedGet, normalizeNextUrl } from "./api/sharepoint/client";

export { invalidate, getCacheStats, cachedGet, normalizeNextUrl };
export default apiClient;
