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
import { searchDobGroups as searchDobGroupsOnDob } from "./dobUserSearch";

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
  return searchDobGroupsOnDob(query, opts);
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
 * Группа сайта по названию — БЕЗ УЧЁТА РЕГИСТРА.
 *
 * Сначала сверяем с полным списком групп сайта (локально, в нижнем регистре,
 * и по названию, и по учётной записи) — только потом `getbyname`, который
 * регистр соблюдает. Фолбэк нужен, когда ensureuser не может создать принципал
 * (security-группа из AD `c:0+.w|s-1-5-21-…` → 404), а группа уже есть на сайте.
 * Фильтр `$filter=Title eq '…'` убран: он тоже регистрозависим и дублирует
 * локальную сверку.
 */
async function siteGroupByTitle(title) {
  const name = String(title || "").trim();
  if (!name) return null;
  const needle = name.toLowerCase();
  const groups = await allSiteGroups();
  const hit = groups.find(
    (g) => g.title.toLowerCase() === needle || (g.loginName && g.loginName.toLowerCase() === needle),
  );
  if (hit) return hit;
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
  return null;
}

let _siteGroupsCache = null; // Array<{id,title,loginName}> | null
let _siteGroupsPromise = null;
let _emailFieldCache; // { internalName, fieldTypeKind, allowMultiple } | null
let _emailFieldPromise = null;

const _groupCache = new Map(); // login|title → id|null

/** Сброс кэшей резолва групп/полей (тесты/отладка). */
export function clearDcEmailGroupCache() {
  _groupCache.clear();
  _siteGroupsCache = null;
  _siteGroupsPromise = null;
  _emailFieldCache = undefined;
  _emailFieldPromise = null;
}

/**
 * Все группы сайта одним запросом (кэшируется).
 *
 * Нужно, чтобы искать группу БЕЗ УЧЁТА РЕГИСТРА: серверные `getbyname` и
 * `$filter=Title eq '…'` регистр соблюдают, поэтому «_рц 8117 отгрузка» не
 * находило группу «_РЦ 8117 Отгрузка» и сохранение падало.
 * @returns {Promise<Array<{id:number,title:string,loginName:string}>>}
 */
async function allSiteGroups() {
  if (_siteGroupsCache) return _siteGroupsCache;
  if (_siteGroupsPromise) return _siteGroupsPromise;
  _siteGroupsPromise = (async () => {
    try {
      const resp = await dobAxios.get(
        `${dobApiBase()}/web/sitegroups?$select=Id,Title,LoginName&$top=500`,
        ACCEPT,
      );
      const list = (resp?.data?.d?.results || [])
        .map((g) => ({
          id: Number(g?.Id),
          title: String(g?.Title || "").trim(),
          loginName: String(g?.LoginName || "").trim(),
        }))
        .filter((g) => Number.isFinite(g.id) && g.id > 0);
      _siteGroupsCache = list;
      return list;
    } catch (e) {
      // Список недоступен — не кэшируем пустоту, попробуем getbyname.
      if (e?.response?.status) console.warn("[dcEmail] sitegroups list failed", e.response.status);
      return [];
    } finally {
      _siteGroupsPromise = null;
    }
  })();
  return _siteGroupsPromise;
}

/**
 * Резолв ГРУППЫ на сайте ДОБ в Id принципала для поля Email.
 * Порядок:
 *   0) Id из автокомплита (поиск идёт по /web/siteusers — те же принципалы, что
 *      вернул бы ensureuser) — если он подтверждается как группа, берём сразу.
 *      Так избегаем лишнего вызова и видимого 404 на AD/security-группах;
 *   1) иначе группа по названию — БЕЗ учёта регистра (список групп сайта,
 *      затем sitegroups/getbyname);
 *   2) иначе ensureuser по учётной записи (loginName/logonName) — он принимает
 *      только точную учётную запись, поэтому идёт последним.
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

  // 1) Группа УЖЕ есть на сайте — ищем по названию без учёта регистра.
  //    Это делаем до ensureuser: тот принимает только точную учётную запись и
  //    название в другом регистре не резолвит («требует точности регистра»).
  const byTitle = await siteGroupByTitle(title);
  if (byTitle) return done(byTitle.id);

  // 2) ensureuser: метод ВЕБА (_api/web/ensureuser), а не коллекции siteusers.
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
 * Как устроено поле Email в DcEmail: одиночное или множественное.
 *
 * Без этого SharePoint отвечает «Обнаружены несовместимые типы. Тип
 * "Collection(Edm.Int32)" относится к виду "Collection" вместо ожидаемого
 * "Primitive"» — коллекцию он принимает только для поля с AllowMultipleValues,
 * а в одиночное поле (и тем более в число) нужен просто Id.
 * @returns {Promise<{internalName:string, fieldTypeKind:number, allowMultiple:boolean}|null>}
 */
async function dcEmailEmailField() {
  if (_emailFieldCache) return _emailFieldCache;
  if (_emailFieldPromise) return _emailFieldPromise;
  _emailFieldPromise = (async () => {
    try {
      const resp = await dobAxios.get(
        `${dcEmailListApi()}/fields?$select=InternalName,FieldTypeKind,AllowMultipleValues`,
        ACCEPT,
      );
      const fields = resp?.data?.d?.results || [];
      // Ищем поле рассылки: по имени Email*, иначе — единственное поле
      // «Пользователь или группа» в списке (название колонки может отличаться).
      const userFields = fields.filter((x) => Number(x?.FieldTypeKind) === 20);
      const f = fields.find((x) => String(x?.InternalName || "").toLowerCase() === "email")
        || fields.find((x) => /^email/i.test(String(x?.InternalName || "")))
        || (userFields.length === 1 ? userFields[0] : null);
      if (f) {
        const kind = Number(f.FieldTypeKind);
        _emailFieldCache = {
          internalName: String(f.InternalName),
          fieldTypeKind: kind,
          // 20 — «Пользователь или группа»: множественность задаёт AllowMultipleValues.
          // Число (9/10) и прочие типы — всегда одно значение.
          allowMultiple: kind === 20 ? Boolean(f.AllowMultipleValues) : false,
        };
        return _emailFieldCache;
      }
    } catch (e) {
      console.warn("[dcEmail] не удалось прочитать поля списка DcEmail", e?.response?.status || e?.message);
    }
    return null;
  })();
  const res = await _emailFieldPromise;
  _emailFieldPromise = null;
  return res;
}

/** Имя свойства для записи поля Email: у поля «Пользователь или группа» — <Имя>Id. */
function emailFieldKey(field) {
  const raw = String(field?.internalName || "Email").trim() || "Email";
  return /Id$/i.test(raw) ? raw : `${raw}Id`;
}

/** Ошибка несовместимого типа OData («Collection» вместо «Primitive» и наоборот). */
function isTypeMismatchError(e) {
  if (e?.response?.status !== 400) return false;
  const err = e?.response?.data?.error;
  const msg = String(err?.message?.value || err?.message || err?.code || e?.message || "");
  return /collection|primitive|несовместим|incompatible/i.test(msg);
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
  const field = await dcEmailEmailField();
  const keyName = emailFieldKey(field);
  const base = {
    __metadata: { type: entity },
    Title: String(title || key),
    OffDepKey: key,
  };
  // Множественное поле → коллекция, одиночное → просто Id. Если тип угадали
  // неверно, SharePoint скажет об этом ошибкой про Collection/Primitive —
  // тогда пробуем второй вариант.
  const asCollection = { ...base, [keyName]: { __metadata: { type: "Collection(Edm.Int32)" }, results: ids } };
  const asSingle = { ...base, [keyName]: ids[0] };
  if (field && !field.allowMultiple && ids.length > 1) {
    console.warn(`[dcEmail] поле ${keyName} одиночное — в элемент попадёт только первая группа (Id ${ids[0]})`);
  }
  const attempts = field && !field.allowMultiple ? [asSingle, asCollection] : [asCollection, asSingle];
  let lastError = null;
  for (const body of attempts) {
    try {
      const { data } = await dobAxios.post(`${dcEmailListApi()}/items`, body, { headers: VERBOSE });
      return data?.d || data;
    } catch (e) {
      lastError = e;
      if (!isTypeMismatchError(e)) throw e;
    }
  }
  throw lastError;
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
