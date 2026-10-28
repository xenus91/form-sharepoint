// src/features/dashboard/dashboardData.js
// Данные дашборда.
//
// Отбор задач — НЕ по Office из профиля пользователя, а через список DcEmail,
// тем же принципом, которым задачи фильтруются по OfficeDepartment:
//   1. DC Office (например «РЦ-8117») → отрезаем 4 знака справа → префикс «РЦ-».
//   2. Берём из DcEmail все строки, у которых OffDepKey начинается с префикса.
//   3. Идентификатор исполнителя — поле SingleEmail этих строк.
//   4. Задачи AssignedTo, чей e-mail/логин совпал с SingleEmail, попадают в сводку.

import apiClient from "../../api";
import { TASKS_LIST_API } from "../../tasks/config";
import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from "../../tasks/status";

/** Сколько дней в роллинг-окне таймлайна. */
export const ROLLING_DAYS = 7;
/** Сколько знаков справа отрезаем у DC Office, чтобы получить префикс DcEmail. */
export const OFFICE_SUFFIX_TRIM = 4;

const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
const DCEMAIL_LIST_TITLE = "DcEmail";
const resultsOf = (resp) => resp?.data?.d?.results ?? [];

/** «РЦ-8117» → «РЦ-». Короткие значения не режем в пустую строку. */
export function officeToPrefix(office) {
  const s = String(office ?? "").trim();
  if (s.length <= OFFICE_SUFFIX_TRIM) return s;
  return s.slice(0, s.length - OFFICE_SUFFIX_TRIM);
}

/**
 * Приводим e-mail/логин к одному ключу: «i:0#.w|retail\sergey.porshakov»,
 * «sergey.porshakov@lenta.com» и «Sergey.Porshakov» дают «sergey.porshakov».
 */
export function emailKey(value) {
  let s = String(value ?? "").trim().toLowerCase();
  if (!s) return "";
  const slash = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("|"));
  if (slash >= 0) s = s.slice(slash + 1);
  const at = s.indexOf("@");
  if (at > 0) s = s.slice(0, at);
  return s;
}

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

const pad = (n) => String(n).padStart(2, "0");
const hourKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
const DAY_LABELS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/**
 * Сводка по задачам + почасовой роллинг-таймлайн.
 * @returns {{ rows: any[], totals: any, timeline: any[], days: any[] }}
 */
export function summarizeTasks(tasks, opts = {}) {
  const { now = Date.now(), rollingDays = ROLLING_DAYS } = opts;
  const nowD = new Date(now);
  const todayKey = `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`;

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
        key, id, title, email: t?.assigneeEmail || "",
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
      const m = t?.Modified ? new Date(t.Modified) : null;
      if (m && `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}` === todayKey) {
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

  // Почасовой роллинг: rollingDays*24 корзин, последняя — текущий час.
  const timeline = [];
  const totalHours = rollingDays * 24;
  const startHour = new Date(now);
  startHour.setMinutes(0, 0, 0);
  startHour.setTime(startHour.getTime() - (totalHours - 1) * 3600000);
  for (let i = 0; i < totalHours; i += 1) {
    const d = new Date(startHour.getTime() + i * 3600000);
    timeline.push({
      key: hourKey(d),
      hour: d.getHours(),
      label: `${pad(d.getHours())}:00`,
      dayLabel: DAY_LABELS[d.getDay()],
      day: d.getDate(),
      dayKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      isToday: i >= totalHours - nowD.getHours() - 1,
      count: 0,
    });
  }
  const idx = new Map(timeline.map((p, i) => [p.key, i]));
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!isCompletedStatus(t?.Status, t?.PercentComplete) || !t?.Modified) continue;
    const i = idx.get(hourKey(new Date(t.Modified)));
    if (i != null) timeline[i].count += 1;
  }

  // Подписи дней для оси: по одной на сутки.
  const days = [];
  for (const p of timeline) {
    const last = days[days.length - 1];
    if (!last || last.key !== p.dayKey) days.push({ key: p.dayKey, label: p.dayLabel, day: p.day });
  }

  return { rows, totals, timeline, days };
}

/** Строки DcEmail, у которых OffDepKey начинается с префикса DC Office. */
export async function fetchDcEmailByPrefix(prefix) {
  const p = String(prefix ?? "").trim().replace(/'/g, "''");
  if (!p) return [];
  const url = `/web/lists/getbytitle('${DCEMAIL_LIST_TITLE}')/items`
    + `?$select=Id,OffDepKey,SingleEmail`
    + `&$filter=${encodeURIComponent(`startswith(OffDepKey,'${p}')`)}&$top=500`;
  const resp = await apiClient.get(url, ACCEPT);
  return resultsOf(resp);
}

/** Id → { email, userName } пачками по 50 (предел длины $filter). */
export async function fetchUserEmailsByIds(ids) {
  const uniq = [...new Set((ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
  const out = {};
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const filter = chunk.map((n) => `Id eq ${n}`).join(" or ");
    const url = `/web/SiteUserInfoList/items?$select=Id,EMail,UserName,Title`
      + `&$filter=${encodeURIComponent(filter)}&$top=50`;
    try {
      const resp = await apiClient.get(url, ACCEPT);
      for (const it of resultsOf(resp)) {
        if (it?.Id == null) continue;
        out[Number(it.Id)] = { email: String(it?.EMail ?? ""), userName: String(it?.UserName ?? "") };
      }
    } catch (e) {
      console.warn("dashboard: не удалось получить e-mail пользователя", e?.response?.status);
    }
  }
  return out;
}

/**
 * Задачи дашборда: Tasks → отбор по SingleEmail из DcEmail (префикс DC Office).
 * Возвращает также диагностику, чтобы в шапке было видно, почему пусто.
 */
export async function fetchDashboardData(office) {
  const select = "Id,Title,Status,PercentComplete,DueDate,Modified,AssignedTo/Id,AssignedTo/Title";
  const url = `${TASKS_LIST_API}/items?$select=${select}&$expand=AssignedTo&$top=2000&$orderby=Modified desc`;

  const prefix = officeToPrefix(office);
  const [taskResp, dcRows] = await Promise.all([
    apiClient.get(url, ACCEPT),
    prefix ? fetchDcEmailByPrefix(prefix).catch(() => []) : Promise.resolve([]),
  ]);

  const all = resultsOf(taskResp);
  const allowed = new Set(
    dcRows.map((r) => emailKey(r?.SingleEmail)).filter(Boolean),
  );

  let tasks = all;
  let applied = false;
  if (allowed.size > 0) {
    const users = await fetchUserEmailsByIds(all.map((t) => t?.AssignedTo?.Id));
    tasks = all.filter((t) => {
      const u = users[Number(t?.AssignedTo?.Id)];
      if (!u) return false;
      const k = emailKey(u.email) || emailKey(u.userName);
      return !!k && allowed.has(k);
    });
    for (const t of tasks) {
      const u = users[Number(t?.AssignedTo?.Id)];
      t.assigneeEmail = u?.email || u?.userName || "";
    }
    applied = true;
  }

  return {
    tasks,
    applied,
    prefix,
    dcEmailCount: dcRows.length,
    peopleCount: allowed.size,
    totalTasks: all.length,
  };
}
