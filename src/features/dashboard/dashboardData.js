// src/features/dashboard/dashboardData.js
// Данные дашборда: сводка по открытым задачам в разрезе AssignedTo + роллинг-
// таймлайн завершённых за последние дни.
//
// Отбор задач — по OFFICE сотрудника (AssignedTo). Department не используется:
// на тенанте сводка нужна в разрезе склада/офиса, а департамент в SiteUserInfoList
// заполнен непоследовательно и дробил бы одну смену на несколько строк.

import apiClient from "../../api";
import { TASKS_LIST_API } from "../../tasks/config";
import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from "../../tasks/status";

/** Сколько дней показывает роллинг-таймлайн (включая сегодняшний). */
export const ROLLING_DAYS = 7;

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const resultsOf = (resp) => resp?.data?.d?.results ?? [];

/** Office сравниваем без регистра и пробелов — в профиле бывает «РЦ-8117 » и «рц-8117». */
export function normalizeOffice(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Просрочена ли задача: DueDate в прошлом. Без DueDate — не просрочена. */
export function isOverdue(task, now = Date.now()) {
  const raw = task?.DueDate;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) && t < now;
}

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

const DAY_LABELS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/**
 * Сводка по задачам одного Office.
 * @param {any[]} tasks — задачи с полями Status/PercentComplete/DueDate/Modified/AssignedTo
 * @param {{ now?: number, rollingDays?: number }} [opts]
 * @returns {{ rows: any[], totals: any, timeline: any[] }}
 */
export function summarizeTasks(tasks, opts = {}) {
  const { now = Date.now(), rollingDays = ROLLING_DAYS } = opts;
  const todayKey = dayKey(now);

  const byAssignee = new Map();
  const totals = {
    notStarted: 0, notStartedOverdue: 0,
    inProgress: 0, inProgressOverdue: 0,
    completedToday: 0,
  };

  for (const t of Array.isArray(tasks) ? tasks : []) {
    const a = t?.AssignedTo || {};
    const id = a.Id ?? t?.AssignedToId ?? null;
    const title = a.Title || t?.AssignedToTitle || "Не назначено";
    const key = id == null ? `title:${title}` : `id:${id}`;

    let row = byAssignee.get(key);
    if (!row) {
      row = {
        key, id, title,
        notStarted: 0, notStartedOverdue: 0,
        inProgress: 0, inProgressOverdue: 0,
        completedToday: 0,
      };
      byAssignee.set(key, row);
    }

    const overdue = isOverdue(t, now);
    if (isCompletedStatus(t?.Status, t?.PercentComplete)) {
      // «Завершено за сегодня» — по Modified: отдельного поля «когда завершена»
      // в списке Tasks нет, а завершение всегда обновляет Modified.
      if (t?.Modified && dayKey(t.Modified) === todayKey) {
        row.completedToday += 1;
        totals.completedToday += 1;
      }
    } else if (isInProgressStatus(t?.Status)) {
      row.inProgress += 1;
      totals.inProgress += 1;
      if (overdue) { row.inProgressOverdue += 1; totals.inProgressOverdue += 1; }
    } else if (isNotStartedStatus(t?.Status) || !t?.Status) {
      row.notStarted += 1;
      totals.notStarted += 1;
      if (overdue) { row.notStartedOverdue += 1; totals.notStartedOverdue += 1; }
    }
  }

  const rows = [...byAssignee.values()].sort(
    (x, y) => (y.notStarted + y.inProgress) - (x.notStarted + x.inProgress)
      || String(x.title).localeCompare(String(y.title), "ru"),
  );

  // Роллинг-таймлайн: последние rollingDays дней включая сегодняшний.
  const timeline = [];
  for (let i = rollingDays - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 86400000);
    timeline.push({
      key: dayKey(d),
      label: DAY_LABELS[d.getDay()],
      day: d.getDate(),
      isToday: i === 0,
      count: 0,
    });
  }
  const idxByKey = new Map(timeline.map((p, i) => [p.key, i]));
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!isCompletedStatus(t?.Status, t?.PercentComplete) || !t?.Modified) continue;
    const i = idxByKey.get(dayKey(t.Modified));
    if (i != null) timeline[i].count += 1;
  }

  return { rows, totals, timeline };
}

/**
 * Office участников сайта ПАЧКОЙ (по 50 id на запрос — фильтр SharePoint
// имеет предел длины). Возвращает Id пользователя → Office.
 */
export async function fetchOfficesByIds(ids) {
  const uniq = [...new Set((ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
  const out = {};
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const filter = chunk.map((n) => `Id eq ${n}`).join(" or ");
    const url = `/web/SiteUserInfoList/items?$select=Id,Office&$filter=${encodeURIComponent(filter)}&$top=50`;
    try {
      const resp = await apiClient.get(url, ACCEPT);
      for (const item of resultsOf(resp)) {
        if (item?.Id != null) out[Number(item.Id)] = String(item?.Office ?? "");
      }
    } catch (e) {
      console.warn("dashboard: не удалось получить Office", e?.response?.status);
    }
  }
  return out;
}

/**
 * Задачи для дашборда + отбор по Office текущего пользователя.
 *
 * Если Office определить не удалось (пустой профиль), фильтр НЕ применяем и
 * возвращаем officeApplied=false — иначе дашборд показывал бы пустоту без
 * объяснения причины.
 */
export async function fetchDashboardData(office) {
  const select = "Id,Title,Status,PercentComplete,DueDate,Modified,AssignedTo/Id,AssignedTo/Title";
  const url = `${TASKS_LIST_API}/items?$select=${select}&$expand=AssignedTo&$top=1000&$orderby=Modified desc`;
  const resp = await apiClient.get(url, ACCEPT);
  let tasks = resultsOf(resp);

  const wanted = normalizeOffice(office);
  let officeApplied = false;
  if (wanted) {
    const ids = tasks.map((t) => t?.AssignedTo?.Id).filter((n) => n != null);
    const offices = await fetchOfficesByIds(ids);
    tasks = tasks.filter((t) => normalizeOffice(offices[Number(t?.AssignedTo?.Id)]) === wanted);
    officeApplied = true;
  }

  return { tasks, officeApplied };
}
