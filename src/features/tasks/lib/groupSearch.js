// src/features/tasks/lib/groupSearch.js
// Поиск ГРУПП SharePoint по названию (учётной записи) — для автокомплита
// «Пользователь или группа», когда допустимы ТОЛЬКО группы.
//
// Отличие от userSearch.searchSiteUsers: там ищутся люди (siteusers). Здесь
// источник — /web/sitegroups (только группы). Как и у людей, поиск не бросает
// исключение, а при неудаче серверного фильтра вычитывает страницу групп и
// фильтрует локально; результаты кэшируются.

import apiClient from "../../../api";

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const GROUPS_PAGE_LIMIT = 500;

const _allGroups = { loaded: false, list: [] };
let _allGroupsPromise = null;

/** Сброс кэша групп (тесты/отладка). */
export function clearGroupSearchCache() {
  _allGroups.loaded = false;
  _allGroups.list = [];
  _allGroupsPromise = null;
}

function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resultsOf(resp) {
  const d = resp?.data?.d ?? resp?.data ?? null;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return Array.isArray(d.results) ? d.results : [];
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

function mapGroup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.Id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    Id: id,
    Title: String(raw.Title || "").trim(),
    LoginName: String(raw.LoginName || "").trim(),
    Description: String(raw.Description || "").trim(),
  };
}

function dedupeGroups(groups) {
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    if (!g) continue;
    const key = String(g.Id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** Совпадает ли группа с запросом (локальный фолбэк). */
export function matchesGroup(group, query) {
  const needle = lower(query);
  if (!needle) return true;
  return [group?.Title, group?.LoginName].map(lower).some((h) => h && h.includes(needle));
}

async function fetchGroupsPage(get, limit = GROUPS_PAGE_LIMIT) {
  if (_allGroups.loaded) return _allGroups.list;
  if (!_allGroupsPromise) {
    _allGroupsPromise = (async () => {
      const url = `/web/sitegroups?$select=Id,Title,LoginName,Description&$top=${limit}`;
      try {
        const resp = await get(url, ACCEPT);
        const list = resultsOf(resp).map(mapGroup).filter(Boolean);
        _allGroups.loaded = true;
        _allGroups.list = list;
        return list;
      } catch (e) {
        console.warn("[groupSearch] sitegroups page failed", e?.response?.status || e?.message);
        return [];
      } finally {
        _allGroupsPromise = null;
      }
    })();
  }
  return _allGroupsPromise;
}

/**
 * Поиск групп SharePoint по запросу (название/учётная запись).
 * @param {string} query
 * @param {{ limit?: number, get?: Function }} [opts]
 * @returns {Promise<Array<{Id:number,Title:string,LoginName:string,Description:string}>>}
 */
export async function searchSiteGroups(query, opts = {}) {
  const { limit = 20 } = opts;
  const q = String(query ?? "").trim();
  if (!q) return [];
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const escaped = escapeODataString(q);

  let groups = [];
  try {
    const url = `/web/sitegroups?$filter=substringof('${escaped}',Title) or substringof('${escaped}',LoginName)`
      + `&$select=Id,Title,LoginName,Description&$top=${limit}`;
    const resp = await get(url, ACCEPT);
    groups = resultsOf(resp).map(mapGroup).filter(Boolean);
  } catch (e) {
    // 400/403/404 на substringof — не повод падать: ниже фолбэк.
    if (e?.response?.status && ![400, 403, 404].includes(e.response.status)) {
      console.warn("[groupSearch] search failed", e.response.status);
    }
  }

  if (groups.length === 0) {
    const all = await fetchGroupsPage(get);
    groups = all.filter((g) => matchesGroup(g, q));
  }
  return dedupeGroups(groups).slice(0, limit);
}
