// @vitest-environment jsdom
// src/features/dashboard/__tests__/DashboardView.test.jsx
//
// Дашборд рендерится: плитки статусов, карточки по AssignedTo и таймлайн.
// Данные подменяются, чтобы тест не зависел от сети.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

vi.mock("../dashboardData", async (orig) => {
  const real = await orig();
  return {
    ...real,
    fetchDashboardData: async () => ({
      applied: true,
      prefix: "РЦ-",
      dcEmailCount: 12,
      peopleCount: 8,
      totalTasks: 40,
      tasks: [
        { Id: 1, Status: "Не начата", PercentComplete: 0, DueDate: new Date(Date.now() - 86400000).toISOString(), Modified: new Date().toISOString(), AssignedTo: { Id: 10, Title: "Иванов Иван" } },
        { Id: 2, Status: "В процессе выполнения", PercentComplete: 0.3, DueDate: null, Modified: new Date().toISOString(), AssignedTo: { Id: 20, Title: "Петров Пётр" } },
        { Id: 3, Status: "Завершена", PercentComplete: 1, DueDate: null, Modified: new Date().toISOString(), AssignedTo: { Id: 10, Title: "Иванов Иван" } },
      ],
    }),
  };
});

const DashboardView = (await import("../DashboardView")).default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

describe("DashboardView", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("показывает Office, плитки, карточки исполнителей и таймлайн", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(ThemeProvider, { theme: createTheme() },
          React.createElement(DashboardView, { office: "РЦ-8117" })),
      );
      await new Promise((r) => setTimeout(r, 80));
    });
    const text = host.textContent;
    expect(text).toContain("Дашборд задач");
    expect(text).toContain("РЦ-8117");
    expect(text).toContain("префикс DcEmail");
    expect(text).toContain("РЦ-");
    // плитки
    expect(text).toContain("Не начато");
    expect(text).toContain("В работе");
    expect(text).toContain("Завершено сегодня");
    // карточки исполнителей
    expect(text).toContain("Иванов Иван");
    expect(text).toContain("Петров Пётр");
    expect(text).toContain("По исполнителям · 2");
    // таймлайн
    expect(text).toContain("Завершено: 7 суток по часам");
    // Временная ось сгруппирована штатными подписями ApexCharts: один нижний
    // group-label на сутки; самодельной полосы мини-графиков под графиком нет.
    const dayLabels = [...host.querySelectorAll(".apexcharts-xaxis-group-label")];
    expect(dayLabels).toHaveLength(7);
    expect(dayLabels.every((node) => /\d{2}\.\d{2}/.test(node.textContent))).toBe(true);
    expect(host.querySelectorAll('[title*="— завершено"]').length).toBe(0);
    await act(async () => { root.unmount(); host.remove(); });
  });
});
