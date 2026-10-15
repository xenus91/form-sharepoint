// src/features/dob/lib/dcEmailApi.js
// Связка «офис + департамент → рассылка» (список DcEmail).
//
// Требование: при создании заявки ДОБ форма проверяет, есть ли в DcEmail
// элемент, у которого OffDepKey = Office + Department. Если нет — пользователь
// указывает рассылку (ТОЛЬКО группы), группы резолвятся через ensureuser, и
// сначала создаётся элемент в DcEmail, а затем — заявка в Requests.
//
// ВАЖНО: список DcEmail для заявок ДОБ лежит на САЙТЕ ДОБ (sites/dob/doblogistic),
// рядом со списком Requests. Поэтому все запросы идут через dobAxios/dobApiBase
// (свой digest сайта ДОБ), а не через клиент основного сайта.

import { dobApiBase, dobAxios } from "../api/dobClient";
import { DCEMAIL_LIST_TITLE, resolveDistributionViaDcEmail } from "../../../tasks/distribution";
import { searchSiteUsers } from "../../../tasks/userSearch";

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const VERBOSE = { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" };

/** Абсолютный URL списка DcEmail на сайте ДОБ (dobAxios — без baseURL). */
export function dcEmailListApi() {
  return `${dobApiBase()}/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')`;
}

/**
 * Поиск ГРУПП на сайте ДОБ для автокомплита рассылки — тем же принципом, что и
 * поле «Виновный» (через /web/siteusers, а не список sitegroups), НО с
 * ОБЯЗАТЕЛЬНЫМ фильтром `PrincipalType ne 1` — только группы, без пользователей.
 * Id берутся с того же сайта, что резолвит ensureuser, поэтому валидны для Email.
 */
export function searchDobGroups(query, opts = {}) {
  return searchSiteUsers(query, {
    ...opts,
    groupsOnly: true,
    base: dobApiBase(),
    get: (url, cfg) => dobAxios.get(url, cfg),
  });
}

/** OffDepKey = Office + Department (слитно) — как в tasks/distribution. */
export function buildOffDepKey(office, department) {
  const off = String(office ?? "").trim();
  const dep = String(department ?? "").trim();
  if (!off || !dep) return "";
  return `${off}${dep}`;
}

/**
 * Элемент DcEmail для Office+Department, если он уже есть (на сайте ДОБ).
 * @returns {Promise<object|null>}
 */
export async function findDcEmailItem(office, department) {
  if (!buildOffDepKey(office, department)) return null;
  return resolveDistributionViaDcEmail(office, department, {
    get: (url, cfg) => dobAxios.get(url, cfg),
    listBase: dobApiBase(),
  });
}

/**
 * Принципал с таким Id — группа (а не пользователь)?
 *
 * Проверяем через /web/siteusers, а НЕ через /web/sitegroups: коллекция
 * sitegroups знает только группы SharePoint (PrincipalType 8). Группы
 * безопасности AD (4) и списки рассылки (2) в неё не входят — getbyid на них
 * отвечает 500 «Невозможно найти группу», из-за чего валидная рассылка
 * отбраковывалась и заявка не создавалась.
 * SP.PrincipalType: 1 — пользователь, 2 — список рассылки, 4 — группа
 * безопасности, 8 — группа SharePoint.
 */
async function isGroupPrincipal(id) {
  try {
    const resp = await dobAxios.get(
      `${dobApiBase()}/web/siteusers/getbyid(${id})?$select=Id,Title,LoginName,PrincipalType`,
      ACCEPT,
    );
    const p = resp?.data?.d || resp?.data;
    const type = Number(p?.PrincipalType);
    if (Number.isFinite(type) && type > 0) return type !== 1;
    return Boolean(p && (p.Title || p.LoginName));
  } catch {
    return false;
  }
}

/**
 * Группа сайта по названию: getbyname, затем фильтр по Title.
 * Нужно как фолбэк, когда ensureuser не может создать принципал (например,
 * security-группа из AD `c:0+.w|s-1-5-21-…` → 404), хотя группа уже есть на сайте.
 */
async function siteGroupByTitle(title) {
  const name = String(title || "").trim();
  if (!name) return null;
  const esc = name.replace(/'/g, "''");
  try {
    const resp = await dobAxios.get(
      `${dobApiBase()}/web/sitegroups/getbyname('${encodeURIComponent(name).replace(/'/g, "''")}')?$select=Id,Title,LoginName`,
      ACCEPT,
    );
    const g = resp?.data?.d || resp?.data;
    const id = Number(g?.Id);
    if (Number.isFinite(id) && id > 0) return { id, title: g?.Title || name, loginName: g?.LoginName || "" };
  } catch (e) {
    if (e?.response?.status && e.response.status !== 404) {
      console.warn("[dcEmail] sitegroups/getbyname failed", e.response.status);
    }
  }
  try {
    const resp = await dobAxios.get(
      `${dobApiBase()}/web/sitegroups?$filter=Title eq '${esc}'&$select=Id,Title,LoginName&$top=1`,
      ACCEPT,
    );
    const items = resp?.data?.d?.results || [];
    const id = Number(items?.[0]?.Id);
    if (Number.isFinite(id) && id > 0) return { id, title: items[0].Title || name, loginName: items[0].LoginName || "" };
  } catch (e) {
    if (e?.response?.status && e.response.status !== 404) {
      console.warn("[dcEmail] sitegroups filter failed", e.response.status);
    }
  }
  return null;
}

const _groupCache = new Map(); // login|title → id|null

/** Сброс кэша резолва групп (тесты/отладка). */
export function clearDcEmailGroupCache() {
  _groupCache.clear();
}

/**
 * Резолв ГРУППЫ на сайте ДОБ в Id принципала для поля Email.
 * Порядок:
 *   0) Id из автокомплита (поиск идёт по /web/siteusers — те же принципалы, что
 *      вернул бы ensureuser) — если он подтверждается как группа, берём сразу.
 *      Так избегаем лишнего вызова и видимого 404 на AD/security-группах;
 *   1) иначе ensureuser по учётной записи (loginName/logonName);
 *   2) иначе группа по названию (sitegroups/getbyname → фильтр Title eq).
 * Возвращает Id, только если это действительно группа (пользователь не попадёт).
 * @param {{Id?:number, LoginName?:string, Title?:string}} group
 * @returns {Promise<number|null>}
 */
export async function ensureGroupPrincipal(group) {
  const loginName = String(group?.LoginName || "").trim();
  const title = String(group?.Title || "").trim();
  const searchId = Number(group?.Id);
  if (!loginName && !title && !(Number.isFinite(searchId) && searchId > 0)) return null;
  const cacheKey = `${searchId}|${loginName.toLowerCase()}|${title.toLowerCase()}`;
  if (_groupCache.has(cacheKey)) return _groupCache.get(cacheKey);

  const done = (id) => { _groupCache.set(cacheKey, id); return id; };

  // 0) Id уже есть из поиска (siteusers). Поиск групп идёт с фильтром
  //    PrincipalType ne 1, поэтому типу из выдачи можно доверять — это спасает
  //    AD-группы и списки рассылки, которых нет в sitegroups.
  if (Number.isFinite(searchId) && searchId > 0) {
    const knownType = Number(group?.PrincipalType);
    if (Number.isFinite(knownType) && knownType > 0) {
      if (knownType !== 1) return done(searchId);
    } else if (await isGroupPrincipal(searchId)) {
      return done(searchId);
    }
  }

  // 1) ensureuser: метод ВЕБА (_api/web/ensureuser), а не коллекции siteusers.
  //    Имя параметра в разных сборках — logonName и loginName.
  const candidate = loginName || title;
  // /web/siteusers/ensureuser в SharePoint REST не существует (всегда 404) —
  // раньше этот лишний запрос только пугал ошибками в консоли.
  const endpoints = [`${dobApiBase()}/web/ensureuser`];
  for (const endpoint of endpoints) {
    for (const key of ["logonName", "loginName"]) {
      try {
        const resp = await dobAxios.post(endpoint, { [key]: candidate }, { headers: VERBOSE });
        const id = Number(resp?.data?.d?.Id ?? resp?.data?.Id);
        if (Number.isFinite(id) && id > 0) {
          if (await isGroupPrincipal(id)) return done(id);
          // ensureuser вернул ПОЛЬЗОВАТЕЛЯ — не подходит, ищем группу дальше.
          break;
        }
      } catch (e) {
        const st = e?.response?.status;
        // 404/400 — принципал не создаётся (AD/security-группа) — это не сбой, идём к фолбэку.
        if (st && ![400, 404].includes(st)) {
          console.warn(`[dcEmail] ensureuser(${candidate}) failed`, st, e?.message);
        }
      }
    }
  }

  // 2) По названию — группа уже существует на сайте.
  const byTitle = await siteGroupByTitle(title);
  if (byTitle) return done(byTitle.id);

  console.warn(`[dcEmail] не удалось определить группу «${title || candidate}»`);
  return done(null);
}

/** Резолв набора групп → массив { Id, Title, LoginName }. */
export async function ensureGroupPrincipals(groups = []) {
  const out = [];
  for (const g of groups || []) {
    const id = await ensureGroupPrincipal(g);
    if (Number.isFinite(id) && id > 0) {
      out.push({ Id: id, Title: String(g?.Title || ""), LoginName: String(g?.LoginName || "") });
    }
  }
  return out;
}

async function getDcEmailEntityType() {
  try {
    const { data } = await dobAxios.get(
      `${dcEmailListApi()}?$select=ListItemEntityTypeFullName`,
      ACCEPT,
    );
    const type = data?.d?.ListItemEntityTypeFullName;
    if (type) return type;
  } catch (e) {
    console.warn("[dcEmail] не удалось получить тип элемента списка", e?.message);
  }
  return "SP.Data.DcEmailListItem";
}

/**
 * Создать элемент в DcEmail (на сайте ДОБ): OffDepKey + рассылка (группы) в Email.
 * @param {{offDepKey:string, groupIds:number[], title?:string}} args
 * @returns {Promise<object>}
 */
export async function createDcEmailItem({ offDepKey, groupIds = [], title = "" }) {
  const key = String(offDepKey || "").trim();
  if (!key) throw new Error("createDcEmailItem: не задан OffDepKey");
  const ids = (groupIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) throw new Error("createDcEmailItem: не выбрано ни одной группы");
  const entity = await getDcEmailEntityType();
  const body = {
    __metadata: { type: entity },
    Title: String(title || key),
    OffDepKey: key,
    EmailId: { __metadata: { type: "Collection(Edm.Int32)" }, results: ids },
  };
  const { data } = await dobAxios.post(`${dcEmailListApi()}/items`, body, { headers: VERBOSE });
  return data?.d || data;
}

/**
 * Полная связка для формы заявки: если элемента на Office+Department нет —
 * создаём его из выбранных групп (ensureuser), иначе возвращаем существующий.
 * @param {{office:string, department:string, groups:Array<object>}} args
 * @returns {Promise<{created:boolean, item:object, offDepKey:string}>}
 */
export async function ensureDcEmailLink({ office, department, groups = [] }) {
  const offDepKey = buildOffDepKey(office, department);
  if (!offDepKey) throw new Error("Не заданы Office и Department — нечего связывать с рассылкой");
  const existing = await findDcEmailItem(office, department);
  if (existing) return { created: false, item: existing, offDepKey };
  const principals = await ensureGroupPrincipals(groups);
  if (principals.length === 0) {
    throw new Error("Не удалось определить выбранные группы — выберите рассылку ещё раз");
  }
  const item = await createDcEmailItem({ offDepKey, groupIds: principals.map((p) => p.Id) });
  return { created: true, item, offDepKey };
}
