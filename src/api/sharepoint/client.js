// src/api/sharepoint/client.js
// SharePoint HTTP client — digest, cache, dedup, stripEndJob/Recipient (moved from src/api.js for §29)
import axios from 'axios';
import { API_BASE_URL } from '../../../config';
import { installCacheInterceptor, invalidate, getCacheStats, makeKey } from '../../sp/cache';

// Кэш формы-дайджеста (SharePoint)
let digestValue = null;
let digestExpiresAt = 0; // ms epoch

async function getDigest() {
  const now = Date.now();
  if (digestValue && now < digestExpiresAt) return digestValue;

  const resp = await axios.post(
    `${API_BASE_URL}/contextinfo`,
    {},
    { headers: { Accept: 'application/json;odata=verbose' } }
  );
  const info = resp?.data?.d?.GetContextWebInformation || {};
  const value = info.FormDigestValue;
  const timeoutSec = info.FormDigestTimeoutSeconds ?? 1500; // ~25 минут
  digestValue = value;
  digestExpiresAt = now + (timeoutSec - 30) * 1000; // запас 30с
  return value;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL, // ВНИМАНИЕ: без /_api — его добавляет бек-прокси
  headers: {
    Accept: 'application/json;odata=verbose',
    'Content-Type': 'application/json',
  },
});

// Удаляем удалённое поле EndJob из любых URL и payload (поле удалено из списка Tasks)
function stripEndJob(url) {
  if (!url || typeof url !== "string") return url;
  if (!url.toLowerCase().includes("endjob")) return url;
  // Убираем EndJob из $select, $filter, $expand и т.д.
  let cleaned = url;
  // Из $select=... - убираем EndJob с запятыми
  cleaned = cleaned.replace(/,?EndJob,?/gi, (m) => {
    if (m === ",EndJob," ) return ",";
    if (m === ",EndJob") return "";
    if (m === "EndJob,") return "";
    if (m === "EndJob") return "";
    return m;
  });
  // Убираем оставшиеся двойные запятые и ,& / ,$ / =,
  cleaned = cleaned.replace(/,+/g, ",").replace(/\$select=,/g, "$select=").replace(/,\$expand/g, "&$expand").replace(/,\$filter/g, "&$filter").replace(/\?&/, "?").replace(/,,/g, ",");
  // Если после чистки остался пустой $select= -> убираем
  cleaned = cleaned.replace(/\$select=&/g, "&").replace(/\$select=$/, "");
  return cleaned;
}
function stripRecipient(url) {
  if (!url || typeof url !== "string") return url;
  if (!url.toLowerCase().includes("recipient")) return url;
  let cleaned = url;
  // Clean Recipient/Id and Recipient/Title
  cleaned = cleaned.replace(/,Recipient\/Id/gi, "");
  cleaned = cleaned.replace(/,Recipient\/Title/gi, "");
  cleaned = cleaned.replace(/Recipient\/Id,/gi, "");
  cleaned = cleaned.replace(/Recipient\/Title,/gi, "");
  cleaned = cleaned.replace(/Recipient\/Id/gi, "");
  cleaned = cleaned.replace(/Recipient\/Title/gi, "");
  // Clean ,Recipient and Recipient,
  cleaned = cleaned.replace(/,Recipient/gi, "");
  cleaned = cleaned.replace(/Recipient,/gi, "");
  // Clean $expand Recipient
  cleaned = cleaned.replace(/,Recipient/gi, "");
  cleaned = cleaned.replace(/Recipient,/gi, "");
  cleaned = cleaned.replace(/\$expand=,/g, "$expand=").replace(/&\$expand=,/g, "&$expand=").replace(/\$expand=Recip[^&]*&/g, "&").replace(/\$expand=Recip[^&]*$/g, "");
  cleaned = cleaned.replace(/,+/g, ",").replace(/\$select=,/g, "$select=").replace(/,\$expand/g, "&$expand").replace(/\?&/, "?").replace(/,,/g, ",");
  cleaned = cleaned.replace(/\$select=&/g, "&").replace(/\$select=$/, "");
  // Final cleanup of expand if empty
  cleaned = cleaned.replace(/&\$expand=&/g, "&").replace(/\$expand=&/g, "&").replace(/\?$expand=$/, "");
  cleaned = cleaned.replace(/,+/g, ",").replace(/,\$expand/g, "&$expand");
  return cleaned;
}
// eslint-disable-next-line no-unused-vars
function stripEndJobFromData(data) {
  if (!data || typeof data !== "object") return data;
  try {
    if (data.EndJob !== undefined) delete data.EndJob;
    // Также если это JSON строка
  } catch (_e) { void _e; }
  return data;
}
let _recipientMissing = false;
try {
  const _stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sp:recipientMissing") : null;
  if (_stored === "1") _recipientMissing = true;
} catch (_e) { void _e; }
// Авто-сброс флага если он был установлен старой версией (которая чистила Recipient и для связанных списков)
if (_recipientMissing) {
  console.warn("[api] _recipientMissing flag is set (from old Tasks error) - will auto-clear in 3s to allow related Recipient fetch");
  setTimeout(() => {
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("sp:recipientMissing");
      _recipientMissing = false;
      console.warn("[api] auto-cleared sp:recipientMissing to allow related Recipient");
    } catch (_e) { void _e; }
  }, 3000);
}
export function clearRecipientMissingFlag() {
  _recipientMissing = false;
  try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("sp:recipientMissing"); } catch (_e) { void _e; }
  console.warn("[api] cleared recipientMissing flag");
}
if (typeof window !== "undefined") {
  window.clearRecipientMissingFlag = clearRecipientMissingFlag;
}
// Для небезопасных методов добавляем X-RequestDigest + чистим EndJob
apiClient.interceptors.request.use(async (config) => {
  try {
    const isTasksList = config.url && config.url.toLowerCase().includes("463b634e-a71a-4fef-9a1f-b803431d8639");
    if (_recipientMissing && isTasksList && config.url.toLowerCase().includes("recipient")) {
      console.warn("[api] stripping Recipient from URL (previously missing, Tasks only)", config.url);
      config.url = stripRecipient(config.url);
    }
    if (config.url && config.url.toLowerCase().includes("endjob")) {
      console.warn("[api] stripping EndJob from URL", config.url);
      config.url = stripEndJob(config.url);
    }
    if (config.data && typeof config.data === "object" && config.data.EndJob !== undefined) {
      console.warn("[api] stripping EndJob from payload");
      delete config.data.EndJob;
    }
    // Если data — JSON строка
    if (typeof config.data === "string" && config.data.toLowerCase().includes("endjob")) {
      try {
        const parsed = JSON.parse(config.data);
        if (parsed && parsed.EndJob !== undefined) {
          delete parsed.EndJob;
          config.data = JSON.stringify(parsed);
          console.warn("[api] stripped EndJob from JSON payload");
        }
      } catch (_e) { void _e; }
      // CAML XML: <FieldRef Name='EndJob' /> или <ViewFields><FieldRef Name='EndJob'/></ViewFields>
      if (config.data.toLowerCase().includes("fieldref") && config.data.toLowerCase().includes("endjob")) {
        const before = config.data;
        let cleaned = config.data.replace(/<FieldRef[^>]*Name=['"]EndJob['"][^>]*\/?>/gi, "");
        cleaned = cleaned.replace(/,\s*EndJob/gi, "").replace(/EndJob\s*,/gi, "");
        if (cleaned !== before) {
          config.data = cleaned;
          console.warn("[api] stripped EndJob FieldRef from CAML");
        }
      }
      // Также чистим URL-encoded EndJob в теле (например, $select с EndJob)
      if (config.data.toLowerCase().includes("endjob")) {
        console.warn("[api] data still contains EndJob after cleaning", config.data.slice(0, 200));
      }
    }
  } catch (e) {
    console.warn("[api] strip EndJob failed", e);
  }
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const digest = await getDigest();
    config.headers = {
      ...(config.headers || {}),
      'X-RequestDigest': digest,
    };
  }
  return config;
});

// Централизованный лог ошибок + авто-очистка кэша для удалённых полей
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = String(err?.response?.data?.error?.message?.value || err?.response?.data || err?.message || "").toLowerCase();
    if (msg.includes("endjob")) {
      console.warn("[api] EndJob error detected, invalidating cache", err?.config?.url);
      try { invalidate("EndJob"); } catch (_e) { void _e; }
      try {
        const ls = typeof localStorage !== "undefined" ? localStorage : null;
        if (ls) {
          for (let i = ls.length - 1; i >= 0; i--) {
            try {
              const k = ls.key(i);
              if (k && k.toLowerCase().includes("endjob")) ls.removeItem(k);
              const v = ls.getItem(k);
              if (v && v.toLowerCase().includes("endjob")) {
                console.warn("[api] localStorage", k, "contains EndJob");
              }
            } catch (_e) { void _e; }
          }
        }
      } catch (_e) { void _e; }
    }
    const isTasksUrl = err?.config?.url && err.config.url.toLowerCase().includes("463b634e-a71a-4fef-9a1f-b803431d8639");
    if (msg.includes("recipient") && isTasksUrl) {
      console.warn("[api] Recipient error detected (Tasks), invalidating cache", err?.config?.url);
      _recipientMissing = true;
      try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem("sp:recipientMissing", "1"); } catch (_e) { void _e; }
      try { invalidate("Recipient"); } catch (_e) { void _e; }
      try { invalidate("recipient"); } catch (_e) { void _e; }
      // Also clear from LS if needed
      try {
        const ls2 = typeof localStorage !== "undefined" ? localStorage : null;
        if (ls2) {
          for (let i = ls2.length - 1; i >= 0; i--) {
            try {
              const k2 = ls2.key(i);
              const v2 = k2 ? ls2.getItem(k2) : null;
              if (k2 && k2.toLowerCase().includes("recipient") && v2 && v2.toLowerCase().includes("recipient")) {
                console.warn("[api] localStorage", k2, "contains Recipient");
              }
            } catch (_e) { void _e; }
          }
        }
      } catch (_e) { void _e; }
    } else if (msg.includes("recipient")) {
      console.warn("[api] Recipient error on non-Tasks list (ignored for flag)", err?.config?.url);
    }
    console.error('API Error:', err?.response?.status, err?.response?.data || err?.message);
    return Promise.reject(err);
  }
);

// Авто-кэш + in-flight dedup для всех GET.
// Уважает config.__noCache (true = пропустить кэш, для polling/refresh).
// TTL по умолчанию 60s; можно переопределить через config.__cacheTtlMs.
// Инвалидация: invalidate("substring") или invalidate(/regex/).
installCacheInterceptor(apiClient, { defaultTtlMs: 60_000 });

// Удобный helper для редких случаев, когда хочется явный TTL/options.
export async function cachedGet(url, config = {}, opts = {}) {
  const key = makeKey('get', url, config.params);
  const mod = await import('../../sp/cache');
  return mod.getCached(key, () => apiClient.get(url, config).then((r) => r.data), opts);
}

export { invalidate, getCacheStats };

export default apiClient;

// Если используешь пагинацию c d.__next, пригодится нормализатор:
export function normalizeNextUrl(spAbsoluteNext) {
  // Превращаем абсолютный https://portal.../_api/... в относительный путь для прокси: /web/...
  try {
    const url = new URL(spAbsoluteNext);
    const idx = url.pathname.toLowerCase().indexOf('/_api');
    if (idx === -1) return null;
    return url.pathname.substring(idx + '/_api'.length) + url.search; // например: /web/lists/...?$skiptoken=...
  } catch {
    return null;
  }
}