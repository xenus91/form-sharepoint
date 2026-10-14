// src/features/dob/lib/dcEmailApi.js
// Связка «офис + департамент → рассылка» (список DcEmail на ОСНОВНОМ сайте).
//
// Требование: при создании заявки ДОБ форма проверяет, есть ли в DcEmail
// элемент, у которого OffDepKey = Office + Department. Если нет — пользователь
// указывает рассылку (ТОЛЬКО группы), группы резолвятся через ensureuser, и
// сначала создаётся элемент в DcEmail, а затем — заявка в Requests.
//
// Все запросы идут через apiClient основного сайта (там живёт DcEmail); digest
// для POST добавляет интерцептор apiClient.

import apiClient from "../../../api";
import { DCEMAIL_LIST_TITLE, resolveDistributionViaDcEmail } from "../../../tasks/distribution";

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const VERBOSE = { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" };

/** OffDepKey = Office + Department (слитно) — как в tasks/distribution. */
export function buildOffDepKey(office, department) {
  const off = String(office ?? "").trim();
  const dep = String(department ?? "").trim();
  if (!off || !dep) return "";
  return `${off}${dep}`;
}

/**
 * Элемент DcEmail для Office+Department, если он уже есть.
 * @returns {Promise<object|null>}
 */
export async function findDcEmailItem(office, department) {
  if (!buildOffDepKey(office, department)) return null;
  return resolveDistributionViaDcEmail(office, department);
}

/**
 * Резолв группы на сайте через ensureuser: по учётной записи (LoginName) или,
 * если её нет, по названию (Title). Возвращает Id принципала.
 * @param {{LoginName?:string, Title?:string}} group
 * @returns {Promise<number|null>}
 */
export async function ensureGroupPrincipal(group) {
  const loginName = String(group?.LoginName || group?.Title || "").trim();
  if (!loginName) return null;
  const url = "/web/siteusers/ensureuser";
  // Имя параметра в разных сборках SharePoint встречается как loginName и
  // logonName — пробуем оба, чтобы не зависеть от версии.
  for (const key of ["loginName", "logonName"]) {
    try {
      const resp = await apiClient.post(url, { [key]: loginName }, { headers: VERBOSE });
      const id = Number(resp?.data?.d?.Id ?? resp?.data?.Id);
      if (Number.isFinite(id) && id > 0) return id;
    } catch (e) {
      if (e?.response?.status && ![400, 404].includes(e.response.status)) {
        console.warn(`[dcEmail] ensureuser(${loginName}) failed`, e.response.status, e?.message);
      }
    }
  }
  console.warn(`[dcEmail] ensureuser не разрешил группу «${loginName}»`);
  return null;
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
    const { data } = await apiClient.get(
      `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')?$select=ListItemEntityTypeFullName`,
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
 * Создать элемент в DcEmail: OffDepKey + рассылка (группы) в поле Email.
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
  const { data } = await apiClient.post(
    `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items`,
    body,
    { headers: VERBOSE },
  );
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
