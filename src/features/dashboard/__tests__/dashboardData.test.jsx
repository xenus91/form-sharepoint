// @vitest-environment jsdom
// src/features/dashboard/__tests__/dashboardData.test.jsx
//
// Сводка дашборда: отбор через DcEmail (префикс DC Office → SingleEmail),
// разбивка по AssignedTo, просрочка по DueDate и почасовой роллинг на 7 суток.

import { describe, it, expect, vi } from "vitest";
import {
  summarizeTasks,
  officeToPrefix,
  emailKey,
  isOverdue,
  fetchDcEmailByPrefix,
  fetchUserEmailsByIds,
  ROLLING_DAYS,
} from "../dashboardData";

const NOW = new Date("2026-10-28T12:00:00Z").getTime();
const at = (msOffset) => new Date(NOW + msOffset).toISOString();
const day = (offset) => at(offset * 86400000);
const HOUR = 3600000;

const task = (o = {}) => ({
  Id: o.id ?? 1,
  Status: "Не начата",
  PercentComplete: 0,
  DueDate: null,
  Modified: day(0),
  AssignedTo: { Id: 10, Title: "Иванов Иван" },
  ...o,
});

describe("DcEmail-отбор", () => {
  it("DC Office → префикс: берём 4 знака справа (номер РЦ)", () => {
    expect(officeToPrefix("РЦ-8117")).toBe("8117");
    expect(officeToPrefix(" РЦ-8117 ")).toBe("8117");
    // короткое значение возвращается как есть, пустого префикса не будет
    expect(officeToPrefix("РЦ-8")).toBe("РЦ-8");
    expect(officeToPrefix("")).toBe("");
  });

  it("e-mail и логин приводятся к одному ключу", () => {
    expect(emailKey("i:0#.w|retail\\sergey.porshakov")).toBe("sergey.porshakov");
    expect(emailKey("Sergey.Porshakov@lenta.com")).toBe("sergey.porshakov");
    expect(emailKey("  SERGEY.PORSHAKOV ")).toBe("sergey.porshakov");
    expect(emailKey(null)).toBe("");
  });

  it("DcEmail запрашивается по startswith(OffDepKey) с полем SingleEmail", async () => {
    const api = await import("../../../api");
    const spy = vi.spyOn(api.default, "get").mockResolvedValue({ data: { d: { results: [{ Id: 1, OffDepKey: "РЦ-Группа отгрузки", SingleEmail: "a@b.c" }] } } });
    const rows = await fetchDcEmailByPrefix("8117");
    const url = decodeURIComponent(spy.mock.calls[0][0]);
    expect(url).toContain("getbytitle('DcEmail')");
    expect(url).toContain("startswith(OffDepKey,'8117')");
    expect(url).toContain("SingleEmail");
    expect(url).not.toContain("Department");
    expect(rows).toHaveLength(1);
    spy.mockRestore();
  });

  it("пустой префикс — запроса нет", async () => {
    const api = await import("../../../api");
    const spy = vi.spyOn(api.default, "get");
    expect(await fetchDcEmailByPrefix("")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("e-mail сотрудников берутся пачкой, Department не запрашиваем", async () => {
    const api = await import("../../../api");
    const calls = [];
    const spy = vi.spyOn(api.default, "get").mockImplementation(async (url) => {
      calls.push(url);
      return { data: { d: { results: [{ Id: 10, EMail: "i@l.ru", UserName: "i:0#.w|retail\\i" }] } } };
    });
    const out = await fetchUserEmailsByIds([10, 10, null, "x", 20]);
    expect(out[10].email).toBe("i@l.ru");
    expect(calls).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toContain("Id eq 10 or Id eq 20");
    expect(calls[0]).not.toContain("Department");
    spy.mockRestore();
  });
});

describe("Сводка", () => {
  it("раскладывает по статусам и считает просрочку", () => {
    const { rows, totals } = summarizeTasks([
      task({ id: 1, Status: "Не начата", DueDate: day(-1) }),
      task({ id: 2, Status: "Не начата", DueDate: day(1) }),
      task({ id: 3, Status: "В процессе выполнения", DueDate: day(-2) }),
      task({ id: 4, Status: "В процессе выполнения" }),
      task({ id: 5, Status: "Завершена", PercentComplete: 1, Modified: day(0) }),
      task({ id: 6, Status: "Завершена", PercentComplete: 1, Modified: day(-1) }),
    ], { now: NOW });

    expect(totals).toEqual({
      notStarted: 2, notStartedOverdue: 1,
      inProgress: 2, inProgressOverdue: 1,
      completedToday: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].completedToday).toBe(1);
  });

  it("группирует по AssignedTo и сортирует по числу открытых", () => {
    const { rows } = summarizeTasks([
      task({ id: 1, AssignedTo: { Id: 10, Title: "Иванов" } }),
      task({ id: 2, AssignedTo: { Id: 20, Title: "Петров" } }),
      task({ id: 3, AssignedTo: { Id: 20, Title: "Петров" } }),
    ], { now: NOW });
    expect(rows.map((r) => r.title)).toEqual(["Петров", "Иванов"]);
    expect([rows[0].notStarted, rows[1].notStarted]).toEqual([2, 1]);
  });

  it("таймлайн почасовой: 7 суток × 24, считает только завершённые", () => {
    const { timeline, days } = summarizeTasks([
      task({ id: 1, Status: "Завершена", PercentComplete: 1, Modified: at(-2 * HOUR) }),
      task({ id: 2, Status: "Завершена", PercentComplete: 1, Modified: at(-2 * HOUR) }),
      task({ id: 3, Status: "Завершена", PercentComplete: 1, Modified: at(-30 * HOUR) }),
      task({ id: 4, Status: "Завершена", PercentComplete: 1, Modified: day(-30) }), // вне окна
      task({ id: 5, Status: "Не начата", Modified: at(-2 * HOUR) }),               // не завершена
    ], { now: NOW });

    expect(timeline).toHaveLength(ROLLING_DAYS * 24);
    // окно начинается с 00:00, поэтому ищем корзину по времени, а не по индексу
    const at2hAgo = new Date(NOW - 2 * HOUR);
    const key2hAgo = `${at2hAgo.getFullYear()}-${String(at2hAgo.getMonth() + 1).padStart(2, "0")}-${String(at2hAgo.getDate()).padStart(2, "0")}T${String(at2hAgo.getHours()).padStart(2, "0")}`;
    expect(timeline.find((p) => p.key === key2hAgo).count).toBe(2);
    expect(timeline[0].hour).toBe(0);            // роллинг с начала суток
    expect(timeline[0].count).toBe(0);
    expect(timeline.reduce((s, p) => s + p.count, 0)).toBe(3);
    expect(days.length).toBeGreaterThanOrEqual(ROLLING_DAYS - 1);
  });

  it("без DueDate задача не просрочена, мусорная дата игнорируется", () => {
    expect(isOverdue({ DueDate: null }, NOW)).toBe(false);
    expect(isOverdue({ DueDate: day(-1) }, NOW)).toBe(true);
    expect(isOverdue({ DueDate: "мусор" }, NOW)).toBe(false);
  });
});
