// src/sp/cache.js
// Простой request-cache + in-flight dedup для SharePoint REST.
//
// Поведение:
//  - getCached(key) возвращает Promise. Если такой же запрос уже летит —
//    возвращается тот же Promise (dedup). Если ответ закэширован и не
//    протух — возвращается из кэша без сетевого вызова.
//  - invalidate(prefix) сбрасывает все ключи, начинающиеся с prefix —
//    удобно после POST/PATCH/DELETE.
//  - wrap(client) декорирует axios-клиент: interceptor на response автоматически
//    кладёт успешные GET в кэш, ошибки (включая 304/401/5xx) — нет.
//
// TTL настраивается per-key через options.ttlMs. Дефолт 60с для GET.
// Ключ строится из (method, url без query) + params.

const inflight = new Map();   // key -> Promise
const cache = new Map();      // key -> { data, expiresAt }
let stats = { hits: 0, miss: 0, dedup: 0, errors: 0 };

export function getCacheStats() {
  return { ...stats, inflight: inflight.size, cached: cache.size };
}

function stripQuery(url) {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

export function makeKey(method, url, params) {
  const base = `${(method || "get").toUpperCase()} ${stripQuery(url)}`;
  if (!params) return base;
  try {
    return `${base}?${JSON.stringify(params)}`;
  } catch {
    return base;
  }
}

export async function getCached(key, loader, { ttlMs = 60_000 } = {}) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    stats.hits += 1;
    return hit.data;
  }
  if (inflight.has(key)) {
    stats.dedup += 1;
    return inflight.get(key);
  }
  stats.miss += 1;
  const p = (async () => {
    try {
      const data = await loader();
      cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      return data;
    } catch (e) {
      stats.errors += 1;
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function invalidate(matcher) {
  if (typeof matcher === "string") {
    for (const k of cache.keys()) {
      if (k.includes(matcher)) cache.delete(k);
    }
    return;
  }
  if (matcher instanceof RegExp) {
    for (const k of cache.keys()) {
      if (matcher.test(k)) cache.delete(k);
    }
  }
}

export function clearCache() {
  cache.clear();
  inflight.clear();
  stats = { hits: 0, miss: 0, dedup: 0, errors: 0 };
}

// Хелпер для прод-дебага: window.getCacheStats() / window.clearCache() / window.printCacheStats()
export function exposeCacheStats() {
  try {
    if (typeof window !== "undefined") {
      window.getCacheStats = getCacheStats;
      window.clearCache = clearCache;
      window.printCacheStats = () => {
        const s = getCacheStats();
        console.table(s);
        console.log(`[cache] hits=${s.hits} miss=${s.miss} dedup=${s.dedup} errors=${s.errors} cached=${s.cached} inflight=${s.inflight}`);
        return s;
      };
      console.log("[cache] helper exposed: window.getCacheStats(), window.clearCache(), window.printCacheStats()");
    }
  } catch {}
}

// Авто-expose в браузере
exposeCacheStats();

// Декоратор для axios-клиента: автоматически кэширует успешные GET.
// Уважает config.__noCache (true = пропустить кэш, для polling/refresh).
// config.__cacheTtlMs — переопределить TTL для конкретного запроса.
export function installCacheInterceptor(client, { defaultTtlMs = 60_000 } = {}) {
  client.interceptors.request.use((config) => {
    if (!config.__cacheKey) {
      config.__cacheKey = makeKey(config.method, config.url, config.params);
    }
    return config;
  });
  client.interceptors.response.use(
    (response) => {
      const cfg = response.config || {};
      const key = cfg.__cacheKey;
      const m = (cfg.method || "get").toUpperCase();
      const noCache = !!cfg.__noCache;
      const ttl = typeof cfg.__cacheTtlMs === "number" ? cfg.__cacheTtlMs : defaultTtlMs;
      // Не кэшируем ошибки, не-GET и явно помеченные __noCache.
      if (key && m === "GET" && !noCache && response.status >= 200 && response.status < 300) {
        cache.set(key, { data: response, expiresAt: Date.now() + ttl });
      }
      return response;
    },
    (err) => Promise.reject(err)
  );
}

// Хелпер для прямого вызова через кэш: getCachedRequest(client, key, url, config)
export async function getCachedRequest(client, key, url, config = {}, opts = {}) {
  return getCached(key, () => client.get(url, config).then((r) => r.data), opts);
}