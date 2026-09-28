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

// При старте чистим кэш от удалённого поля EndJob (поле удалено из списка Tasks)
try {
  const _toDelete = [];
  for (const k of cache.keys()) if (k.toLowerCase().includes("endjob")) _toDelete.push(k);
  for (const k of _toDelete) cache.delete(k);
  if (_toDelete.length) console.warn("[cache] cleared", _toDelete.length, "keys with EndJob");
  const _toDeleteFly = [];
  for (const k of inflight.keys()) if (k.toLowerCase().includes("endjob")) _toDeleteFly.push(k);
  for (const k of _toDeleteFly) inflight.delete(k);
  // Также чистим localStorage от старых resultFields с EndJob
  try {
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    if (ls) {
      const raw = ls.getItem("sp:resultFields:meta");
      if (raw && raw.toLowerCase().includes("endjob")) {
        ls.removeItem("sp:resultFields:meta");
        console.warn("[cache] cleared sp:resultFields:meta with EndJob");
      }
      const raw2 = ls.getItem("sp:resultFields:ctMap");
      if (raw2 && raw2.toLowerCase().includes("endjob")) {
        ls.removeItem("sp:resultFields:ctMap");
        console.warn("[cache] cleared sp:resultFields:ctMap with EndJob");
      }
      const raw3 = ls.getItem("sp:tasks:overview");
      if (raw3 && raw3.toLowerCase().includes("endjob")) {
        ls.removeItem("sp:tasks:overview");
        console.warn("[cache] cleared sp:tasks:overview with EndJob");
      }
    }
  } catch (_e) { void _e; }
} catch (_e) { void _e; }

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
// Диагностические cache helpers не публикуются в window в production.

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