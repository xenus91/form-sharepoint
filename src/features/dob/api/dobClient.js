// src/features/dob/api/dobClient.js
// Cross-site SharePoint client for DOB logistic list (sites/dob/doblogistic)
// Handles separate digest per site and dev/prod base URL routing.
import axios from 'axios';

export const DOB_SITE_RELATIVE = '/sites/dob/doblogistic';
export const DOB_LIST_GUID = '64DB263C-2ED6-4FD5-8760-AE5E3E4A331C';

// Build absolute or proxy-aware base for dob site
export function dobApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
    // В dev используем отдельный прокси /dob-api → origin (https://portal.len.com), чтоб не получить дубль /sites/obrazceo/sites/dob
    // vite: /dob-api/sites/dob/doblogistic/_api → https://portal.len.com/sites/dob/doblogistic/_api
    // mainTarget = VITE_PROXY_BASE_URL || VITE_SP_SITE и может уже содержать /sites/obrazceo — поэтому /api для dob не подходит
    return '/dob-api/sites/dob/doblogistic/_api';
  }
  // prod: hosted inside SharePoint, use absolute origin + site
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${DOB_SITE_RELATIVE}/_api`;
  } catch {
    return `${DOB_SITE_RELATIVE}/_api`;
  }
}

let dobDigest = null;
let dobDigestExpiresAt = 0;

export async function getDobDigest() {
  const now = Date.now();
  if (dobDigest && now < dobDigestExpiresAt) return dobDigest;
  const url = `${dobApiBase()}/contextinfo`;
  const resp = await axios.post(url, {}, {
    headers: { Accept: 'application/json;odata=verbose' },
    withCredentials: true,
  });
  const info = resp?.data?.d?.GetContextWebInformation || {};
  const value = info.FormDigestValue;
  const timeoutSec = info.FormDigestTimeoutSeconds ?? 1500;
  dobDigest = value;
  dobDigestExpiresAt = now + (timeoutSec - 30) * 1000;
  return value;
}

export function dobListApi() {
  return `${dobApiBase()}/web/lists(guid'${DOB_LIST_GUID}')`;
}

// Raw axios instance for DOB (no global base, no cache interceptor)
export const dobAxios = axios.create({
  headers: {
    Accept: 'application/json;odata=verbose',
    'Content-Type': 'application/json;odata=verbose',
  },
  withCredentials: true,
});

// Attach digest for non-GET automatically (like apiClient)
dobAxios.interceptors.request.use(async (cfg) => {
  const method = (cfg.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const d = await getDobDigest();
    cfg.headers = { ...(cfg.headers || {}), 'X-RequestDigest': d };
  }
  return cfg;
});

dobAxios.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = String(err?.response?.data?.error?.message?.value || err?.message || '').slice(0, 400);
    // eslint-disable-next-line no-console
    if (err?.response?.status !== 404) console.error('[dobApi] error', err?.response?.status, msg);
    return Promise.reject(err);
  }
);
