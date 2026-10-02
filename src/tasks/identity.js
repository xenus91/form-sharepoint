// src/tasks/identity.js
// Per-site identity резолв: Id текущего пользователя и Id групп/пользователей
// на каждом сайте-источнике. Маппинг DcEmail-имён → Id целевого сайта.
//
// План: см. artifacts/plan.md (этап 3).

import { makeSourceClient } from "./sourceClient";
import { classifyPrincipal } from "./distribution";

// ---------- кэш ----------
// Ключ: "sp:identity:<sourceId>:<kind>:<value>"
// kind: "currentuser" | "user:<email>" | "group:<title>"
const _memCache = new Map(); // in-memory mirror поверх sessionStorage
const _pending = new Map(); // single-flight по ключу

function _key(sourceId, kind, value) {
  return `sp:identity:${sourceId}:${kind}:${value}`;
}

function _ssRead(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (_e) {
    void _e;
    return null;
  }
}

function _ssWrite(key, val) {
  try {
    sessionStorage.setItem(key, val);
  } catch (_e) {
    void _e;
  }
}

function _cacheGet(key) {
  if (_memCache.has(key)) return _memCache.get(key);
  const raw = _ssRead(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      _memCache.set(key, parsed);
      return parsed;
    } catch (_e) {
      void _e;
    }
  }
  return null;
}

function _cacheSet(key, value) {
  _memCache.set(key, value);
  try {
    _ssWrite(key, JSON.stringify(value));
  } catch (_e) {
    void _e;
  }
}

function _singleFlight(key, loader) {
  if (_pending.has(key)) return _pending.get(key);
  const p = Promise.resolve()
    .then(loader)
    .finally(() => {
      _pending.delete(key);
    });
  _pending.set(key, p);
  return p;
}

// ---------- резолв ----------

/**
 * Id текущего пользователя на сайте-источнике.
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null, resolveListApi?:(() => string|Promise<string>)|null}} source
 * @returns {Promise<number|null>}
 */
export async function resolveSourceUser(source) {
  const key = _key(source.id, "currentuser", "me");
  const cached = _cacheGet(key);
  if (cached && typeof cached.id === "number") return cached.id;
  return _singleFlight(key, async () => {
    const client = makeSourceClient(source);
    try {
      const url = `${client.apiBase}/web/currentuser?$select=Id`;
      const resp = await client.get(url, { headers: { Accept: "application/json;odata=verbose" } });
      const id = Number(resp?.data?.d?.Id ?? resp?.data?.Id);
      if (Number.isFinite(id)) {
        _cacheSet(key, { id });
        return id;
      }
      _cacheSet(key, { id: null });
      return null;
    } catch (e) {
      console.warn(`[identity:${source.id}] currentuser failed`, e?.response?.status, e?.message);
      _cacheSet(key, { id: null });
      return null;
    }
  });
}

/**
 * Резолв принципала (user или group) на сайте-источнике.
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null, resolveListApi?:(() => string|Promise<string>)|null}} source
 * @param {{id:number,title?:string|null,loginName?:string|null,email?:string|null,kind?:"user"|"group"|"unknown"}} principal
 * @returns {Promise<{id:number,kind:"user"|"group"|"unknown"}|null>}
 */
export async function resolvePrincipalOnSource(source, principal) {
  if (!principal) return null;
  const kind = principal.kind || classifyPrincipal(principal);
  if (kind === "user") {
    const email = (principal.email || "").trim();
    if (!email) return null;
    const key = _key(source.id, "user", email.toLowerCase());
    const cached = _cacheGet(key);
    if (cached && typeof cached.id === "number") return { id: cached.id, kind: "user" };
    return _singleFlight(key, async () => {
      const client = makeSourceClient(source);
      try {
        const url = `${client.apiBase}/web/siteusers/getbyemail('${encodeURIComponent(email).replace(/'/g, "''")}')?$select=Id`;
        const resp = await client.get(url, { headers: { Accept: "application/json;odata=verbose" } });
        const id = Number(resp?.data?.d?.Id ?? resp?.data?.Id);
        if (Number.isFinite(id)) {
          _cacheSet(key, { id });
          return { id, kind: "user" };
        }
        // 404 → ensureuser (требует digest)
        if (resp?.status === 404 || resp?.response?.status === 404) {
          const ensured = await _ensureUser(client, principal);
          if (ensured) {
            _cacheSet(key, { id: ensured });
            return { id: ensured, kind: "user" };
          }
        }
      } catch (e) {
        const status = e?.response?.status;
        if (status === 404) {
          const ensured = await _ensureUser(client, principal);
          if (ensured) {
            _cacheSet(key, { id: ensured });
            return { id: ensured, kind: "user" };
          }
        }
        console.warn(`[identity:${source.id}] user ${email} not found`, status, e?.message);
      }
      _cacheSet(key, { id: null });
      return null;
    });
  }
  if (kind === "group") {
    const title = (principal.title || "").trim();
    if (!title) return null;
    const key = _key(source.id, "group", title.toLowerCase());
    const cached = _cacheGet(key);
    if (cached && typeof cached.id === "number") return { id: cached.id, kind: "group" };
    return _singleFlight(key, async () => {
      const client = makeSourceClient(source);
      try {
        const url = `${client.apiBase}/web/sitegroups/getbyname('${encodeURIComponent(title).replace(/'/g, "''")}')?$select=Id`;
        const resp = await client.get(url, { headers: { Accept: "application/json;odata=verbose" } });
        const id = Number(resp?.data?.d?.Id ?? resp?.data?.Id);
        if (Number.isFinite(id)) {
          _cacheSet(key, { id });
          return { id, kind: "group" };
        }
      } catch (e) {
        console.warn(`[identity:${source.id}] group ${title} not found`, e?.response?.status, e?.message);
      }
      _cacheSet(key, { id: null });
      return null;
    });
  }
  return null;
}

async function _ensureUser(client, principal) {
  const loginName = (principal.loginName || "").trim();
  if (!loginName) return null;
  try {
    const body = { loginName };
    const resp = await client.post(
      `${client.apiBase}/web/siteusers/ensureuser`,
      body,
      { headers: { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" } }
    );
    const id = Number(resp?.data?.d?.Id ?? resp?.data?.Id);
    return Number.isFinite(id) ? id : null;
  } catch (e) {
    console.warn(`[identity] ensureuser(${loginName}) failed`, e?.response?.status, e?.message);
    return null;
  }
}

/**
 * Резолв всего набора принципалов на одном сайте.
 * @param {{id:string, clientKind:"main"|"dob", listApi?:string|null}} source
 * @param {Array<{id:number,title?:string|null,loginName?:string|null,email?:string|null,kind?:"user"|"group"|"unknown"}>} principals
 * @returns {Promise<{userId:number|null, principalIds:number[], unresolved:any[], ok:boolean, reason?:string}>}
 */
export async function resolveSourceIdentity(source, principals = []) {
  const out = {
    userId: null,
    principalIds: [],
    unresolved: [],
    ok: false,
    reason: null,
  };
  try {
    out.userId = await resolveSourceUser(source);
  } catch (_e) {
    void _e;
  }
  const tasks = (principals || []).map((p) => resolvePrincipalOnSource(source, p));
  const results = await Promise.all(tasks);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r && Number.isFinite(r.id)) out.principalIds.push(r.id);
    else out.unresolved.push(principals[i]);
  }
  out.ok = out.userId != null && (out.principalIds.length > 0 || (principals.length === 0));
  if (!out.ok && !out.reason) {
    out.reason = !out.userId
      ? "currentuser-failed"
      : out.principalIds.length === 0
        ? "no-principals-resolved"
        : null;
  }
  return out;
}

/**
 * Сброс кэша identity для источника.
 * @param {string} [sourceId] — если не передан, сбрасывает все
 */
export function invalidateIdentityCache(sourceId) {
  const prefix = sourceId ? `sp:identity:${sourceId}:` : "sp:identity:";
  for (const k of Array.from(_memCache.keys())) {
    if (k.startsWith(prefix)) _memCache.delete(k);
  }
  if (typeof sessionStorage !== "undefined") {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
      }
    } catch (_e) {
      void _e;
    }
  }
}