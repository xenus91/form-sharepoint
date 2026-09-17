// api.js
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { installCacheInterceptor, invalidate, getCacheStats, makeKey } from './sp/cache';

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

// Для небезопасных методов добавляем X-RequestDigest
apiClient.interceptors.request.use(async (config) => {
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

// Централизованный лог ошибок
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
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
  const mod = await import('./sp/cache');
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