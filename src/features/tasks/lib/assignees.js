// src/features/tasks/lib/assignees.js
//
// «Кому назначено» (AssignedTo) — список принципалов задачи и уточнение
// «это человек или группа».
//
// Зачем: в интерфейсах AssignedTo показывали просто строкой. Нужно показывать
// КНОПКУ с иконкой (человек / группа) и по клику — информацию о принципале.
// Тип принципала в самом задании не приходит (только Id и/или Title), поэтому
// уточняем его точечными запросами к SharePoint (см. tasks/principalDetails.js).

import apiClient from "../../../api";
import { resolvePrincipalDetail } from "../../../tasks/principalDetails";
import { dobApiBase, dobAxios } from "../../dob/api/dobClient";
import { toRequestUrl } from "../../../tasks/sourceClient";

const MAIN_TASKS_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639";

const asArray = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  return [value];
};

const titleOf = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return String(value.Title || value.title || value.LoginName || value.loginName || "").trim();
};

const idOf = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    const n = Number(value.Id ?? value.id);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Принципалы задачи «Кому назначено».
 * @param {object|null} task
 * @returns {{title:string, id:number|null}[]}
 */
export function parseAssignees(task) {
  if (!task) return [];
  const rawTitles = asArray(task.AssignedTo).map(titleOf).filter(Boolean);
  const ids = asArray(task.AssignedToId).map(idOf).filter((n) => Number.isFinite(n) && n > 0);

  let titles = rawTitles;
  if (rawTitles.length === 1) {
    const single = rawTitles[0];
    // SharePoint склеивает многозначный выбор как «A;#B» — это приходит ОДНОЙ
    // строкой, поэтому режем. Обычную запятую не трогаем: она может быть
    // частью названия («Группа ООБ, ТК-12»).
    if (single.includes(";#")) titles = single.split(";#").map((s) => s.trim()).filter(Boolean);
  }

  if (titles.length === 0 && ids.length === 0) return [];
  if (titles.length === 0) return ids.map((id) => ({ title: "", id }));
  if (titles.length === ids.length) return titles.map((title, i) => ({ title, id: ids[i] ?? null }));
  // Один Id на несколько имён (или наоборот) — Id относим к первому.
  if (ids.length === 1) return titles.map((title, i) => ({ title, id: i === 0 ? ids[0] : null }));
  return titles.map((title, i) => ({ title, id: ids[i] ?? null }));
}

/** Задача НЕ из основного списка (сайт ДОБ и т.п.)? */
export function isExternalTask(task) {
  const source = String(task?.sourceId || "").trim();
  if (source && source !== "main") return true;
  const guid = String(task?.listGuid || task?.sourceListGuid || "").trim();
  return !!guid && guid.toUpperCase() !== MAIN_TASKS_GUID;
}

/**
 * Клиент для уточнения принципала: у задачи внешнего сайта Id живёт в ЕГО
 * сайт-коллекции — на основном сайте тот же Id указывает на ДРУГОГО человека.
 */
export function principalGetForTask(task) {
  if (!isExternalTask(task)) return (url, cfg) => apiClient.get(url, cfg);
  const apiBase = dobApiBase();
  return (url, cfg) => dobAxios.get(toRequestUrl(apiBase, url), cfg);
}

/**
 * Уточнить принципала задачи: { kind: "user"|"group"|"unknown", title, email, loginName }.
 * Без Id уточнить нечего — возвращаем то, что знаем из самой задачи.
 */
export async function resolveAssignee(task, assignee) {
  const known = {
    id: assignee?.id ?? null,
    kind: "unknown",
    title: assignee?.title || "",
    loginName: null,
    email: null,
  };
  if (!known.id) return known;
  try {
    const detail = await resolvePrincipalDetail(known.id, { get: principalGetForTask(task) });
    if (detail) {
      return {
        id: known.id,
        kind: detail.kind || "unknown",
        title: detail.title || known.title,
        loginName: detail.loginName || null,
        email: detail.email || null,
      };
    }
  } catch {
    // без данных — показываем то, что есть в задаче
  }
  return known;
}

// Одинаковых исполнителей в списке много: один и тот же Id не должен
// уходить на сервер по разу на каждую строку. Держим «в полёте» по принципалу.
const _inflight = new Map();

/** То же, что resolveAssignee, но с дедупом одновременных запросов. */
export function resolveAssigneeCached(task, assignee) {
  const scope = isExternalTask(task) ? "ext" : "main";
  const key = `${scope}:${assignee?.id ?? "no-id"}`;
  const existing = _inflight.get(key);
  if (existing) return existing;
  const promise = resolveAssignee(task, assignee);
  _inflight.set(key, promise);
  return promise;
}

/** Сброс кэша «в полёте» (тесты). */
export function clearAssigneesInflight() {
  _inflight.clear();
}
