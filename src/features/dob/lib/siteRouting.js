// src/features/dob/lib/siteRouting.js
//
// Один и тот же набор форм работает и с заявками ДОБ (сайт /sites/dob/doblogistic),
// и со списками основного сайта (#dob_tasks/<id>?list=<GUID основного списка>) —
// например, задача «Результат проверки ООБ» открывается формой ДОБ, но читается
// и пишется в своём списке. Отсюда правило: КАЖДЫЙ запрос (поля, элементы, люди)
// идёт на тот сайт, где лежит запись.
//
// Модуль нарочно «листовой» — без axios и без dobApi, поэтому роутинг можно
// проверить юнит-тестом и использовать из любого места фичи.
import { TASKS_LIST_GUID } from '../../../tasks/config';

const MAIN_LIST_GUIDS = new Set([String(TASKS_LIST_GUID || '').toLowerCase()]);

/** Список принадлежит основному сайту (а не сайту ДОБ). */
export function isMainSiteList(listGuid) {
  const id = String(listGuid || '').trim().replace(/[{}]/g, '').toLowerCase();
  return MAIN_LIST_GUIDS.has(id);
}
