// @vitest-environment jsdom
// src/features/dashboard/__tests__/dashboardData.test.jsx
//
// Сводка дашборда: разбивка по AssignedTo, просрочка по DueDate, «завершено за
// сегодня» и роллинг-таймлайн на 7 дней. Отбор по Office — без Department.

import { describe, it, expect, vi } from "vitest";
import {
  summarizeTasks,
  normalizeOffice,
  isOverdue,
  fetchOfficesByIds,
  ROLLING_DAYS,
} from "../dashboardData";

const NOW = new Date("2026-10-28T12:00:00Z").getTime();
const day = (offset) => new Date(NOW + offset * 86400000).toISOString();

const task = (o = {}) => ({
  Id: o.id ?? 1,
  Status: "Не начата",
  PercentComplete: 0,
  DueDate: null,
  Modified: day(0),
  AssignedTo: { Id: 10, Title: "Иванов Иван" },
  ...o,
});

describe("dashboardData — сводка", () => {
  it("раскладывает задачи по статусам и считает просрочку", () => {
    const { rows, totals } = summarizeTasks([
      task({ id: 1, Status: "Не начата", DueDate: day(-1) }),          // просрочена
      task({ id: 2, Status: "Не начата", DueDate: day(1) }),           // нет
      task({ id: 3, Status: "В процессе выполнения", DueDate: day(-2) }), // просрочена
      task({ id: 4, Status: "В процессе выполнения" }),
      task({ id: 5, Status: "Завершена", PercentComplete: 1, Modified: day(0) }),
      task({ id: 6, Status: "Завершена", PercentComplete: 1, Modified: day(-1) }), // не сегодня
    ], { now: NOW });

    expect(totals).toEqual({
      notStarted: 2, notStartedOverdue: 1,
      inProgress: 2, inProgressOverdue: 1,
      completedToday: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Иванов Иван");
    expect(rows[0].completedToday).toBe(1);
  });

  it("группирует по AssignedTo и сортирует по числу открытых", () => {
    const { rows } = summarizeTasks([
      task({ id: 1, AssignedTo: { Id: 10, Title: "Иванов" } }),
      task({ id: 2, AssignedTo: { Id: 20, Title: "Петров" } }),
      task({ id: 3, AssignedTo: { Id: 20, Title: "Петров" } }),
    ], { now: NOW });
    expect(rows.map((r) => r.title)).toEqual(["Петров", "Иванов"]);
    expect(rows[0].notStarted).toBe(2);
    expect(rows[1].notStarted).toBe(1);
  });

  it("таймлайн — 7 дней, сегодня последний, счёт только по завершённым", () => {
    const { timeline } = summarizeTasks([
      task({ id: 1, Status: "Завершена", PercentComplete: 1, Modified: day(0) }),
      task({ id: 2, Status: "Завершена", PercentComplete: 1, Modified: day(0) }),
      task({ id: 3, Status: "Завершена", PercentComplete: 1, Modified: day(-3) }),
      task({ id: 4, Status: "Завершена", PercentComplete: 1, Modified: day(-30) }), // вне окна
      task({ id: 5, Status: "Не начата", Modified: day(0) }),                       // не завершена
    ], { now: NOW });

    expect(timeline).toHaveLength(ROLLING_DAYS);
    expect(timeline[timeline.length - 1].isToday).toBe(true);
    expect(timeline[timeline.length - 1].count).toBe(2);
    expect(timeline[timeline.length - 4].count).toBe(1);
    expect(timeline.reduce((s, p) => s + p.count, 0)).toBe(3); // day(-30) не попал
  });

  it("без DueDate задача не считается просроченной", () => {
    expect(isOverdue({ DueDate: null }, NOW)).toBe(false);
    expect(isOverdue({ DueDate: day(-1) }, NOW)).toBe(true);
    expect(isOverdue({ DueDate: "мусор" }, NOW)).toBe(false);
  });

  it("Office сравнивается без регистра и пробелов", () => {
    expect(normalizeOffice(" РЦ-8117 ")).toBe("рц-8117");
    expect(normalizeOffice("РЦ-8117")).toBe(normalizeOffice("  рц-8117"));
    expect(normalizeOffice(null)).toBe("");
  });
});

describe("dashboardData — Office сотрудников", () => {
  it("запрашивает SiteUserInfoList пачками и возвращает Id → Office", async () => {
    const calls = [];
    const api = await import("../../../api");
    const spy = vi.spyOn(api.default, "get").mockImplementation(async (url) => {
      calls.push(url);
      return { data: { d: { results: [{ Id: 10, Office: "РЦ-8117" }] } } };
    });
    const out = await fetchOfficesByIds([10, 10, null, "x", 20]);
    expect(out[10]).toBe("РЦ-8117");
    // дубли и мусор отброшены: 10 и 20 → один запрос с двумя Id
    expect(calls).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toContain("Id eq 10 or Id eq 20");
    expect(calls[0]).toContain("SiteUserInfoList");
    expect(calls[0]).not.toContain("Department"); // Department не берём
    spy.mockRestore();
  });
});
