// src/features/dob/lib/dobUserSearch.js
//
// Поиск принципалов и их сведений НА САЙТЕ ДОБ.
//
// Заявки ДОБ живут на сайте sites/dob/doblogistic, поэтому и людей в поля
// «Пользователь или группа» (Виновный и т.п.) надо искать там же. Дефолтный
// searchSiteUsers/getUserPositions ходят через apiClient ОСНОВНОГО сайта
// (obrazceo) — на форме заявки это давало запросы на чужой сайт.
//
// Все функции принимают те же аргументы, что и их аналоги из tasks/userSearch,
// и подставляют базу/клиент сайта ДОБ.

import { dobApiBase, dobAxios } from "../api/dobClient";
import { searchSiteUsers, getUserPositions } from "../../../tasks/userSearch";
import { isMainSiteList } from "./siteRouting";

/**
 * GET на сайт ДОБ.
 *
 * Важно: `dobAxios` создан БЕЗ baseURL (см. dobClient.js), поэтому относительные
 * пути SharePoint (`/web/SiteUserInfoList/items?...`, `/SP.UserProfiles...`)
 * надо достраивать базой сайта ДОБ самим — иначе запрос уйдёт в корень текущего
 * веб-приложения, то есть на основной сайт.
 */
export const dobGet = (url, cfg) => {
  const path = String(url || "");
  const base = dobApiBase();
  // Абсолютные и уже «с базой» URL не достраиваем (searchSiteUsers сам клеит base).
  const full = /^(https?:)?\/\//i.test(path) || path.startsWith(base)
    ? path
    : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  return dobAxios.get(full, cfg);
};

/**
 * Поиск людей и групп на сайте ДОБ — для полей «Пользователь или группа»
 * в форме заявки.
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
export function searchDobUsers(query, opts = {}) {
  return searchSiteUsers(query, { ...opts, base: dobApiBase(), get: dobGet });
}

/**
 * Поиск ТОЛЬКО групп на сайте ДОБ — для рассылки DcEmail.
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
export function searchDobGroups(query, opts = {}) {
  return searchSiteUsers(query, { ...opts, groupsOnly: true, base: dobApiBase(), get: dobGet });
}

/**
 * Должность/департамент/офис выбранных людей — тоже с сайта ДОБ.
 * @param {Array<object>} users
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export function dobUserPositions(users, opts = {}) {
  return getUserPositions(users, { ...opts, get: dobGet });
}

/**
 * Поиск людей и их сведений — по сайту ТОГО списка, в котором лежит запись.
 *
 * Основной список задач (Tasks) живёт на основном сайте, списки ДОБ (Requests,
 * RequestsTask) — на сайте ДОБ: искать принципалов надо там же, где запись.
 * @param {string} [listGuid]
 * @returns {{ search: Function, getPositions: Function }}
 */
export function userSearchFor(listGuid) {
  return isMainSiteList(listGuid)
    ? { search: searchSiteUsers, getPositions: getUserPositions }
    : { search: searchDobUsers, getPositions: dobUserPositions };
}
