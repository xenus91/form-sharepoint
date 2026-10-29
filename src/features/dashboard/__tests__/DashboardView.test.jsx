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
        { Id: 1, Title: "Брак упаковки", Status: "Не начата", PercentComplete: 0, DueDate: new Date(Date.now() - 86400000).toISOString(), Modified: new Date().toISOString(), AssignedTo: { Id: 10, Title: "Иванов Иван" } },
        { Id: 2, Title: "Не работает терминал", Status: "В процессе выполнения", PercentComplete: 0.3, DueDate: null, Modified: new Date().toISOString(), AssignedTo: { Id: 20, Title: "Петров Пётр" } },
        { Id: 3, Title: "Повреждена тара", Status: "Завершена", PercentComplete: 1, DueDate: null, Modified: new Date().toISOString(), AssignedTo: { Id: 10, Title: "Иванов Иван" } },
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
    // Часы и дата под полуденным часом выведены штатной datetime-осью Apex;
    // нижней самодельной полосы мини-графиков нет.
    const dayLabels = [...host.querySelectorAll(".apexcharts-xaxis-label")]
      .filter((node) => /\d{2}\.\d{2}/.test(node.textContent));
    expect(dayLabels).toHaveLength(7);
    expect(host.querySelectorAll('[title*="— завершено"]').length).toBe(0);
    // Структурный smoke-check для JSDOM; выделение и колесо проверены в
    // Chromium по изменению диапазона реальной datetime-оси.
    expect(host.querySelector(".apexcharts-zoomable")).not.toBeNull();

    const notStartedCount = host.querySelector('[aria-label="Не начато: 1; показать разбивку по названиям"]');
    const inProgressCount = host.querySelector('[aria-label="В работе: 0; показать разбивку по названиям"]');
    const completedCount = host.querySelector('[aria-label="Завершено: 1; показать разбивку по названиям"]');
    const notStartedOverdue = host.querySelector('[aria-label="Просрочено · не начато: 1; показать разбивку по названиям"]');
    const inProgressOverdue = host.querySelector('[aria-label="Просрочено · в работе: 0; показать разбивку по названиям"]');
    expect(notStartedCount).not.toBeNull();
    expect(inProgressCount).not.toBeNull();
    expect(completedCount).not.toBeNull();
    expect(notStartedOverdue).not.toBeNull();
    expect(inProgressOverdue).not.toBeNull();
    await act(async () => {
      notStartedCount.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10 }));
      notStartedCount.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 10 }));
      notStartedCount.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    });
    const popover = document.body.querySelector(".MuiPopover-root");
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain("Брак упаковки");
    expect(popover.textContent).toContain("1");
    expect(document.body.querySelector(".MuiDialog-root")).toBeNull();

    const closeBreakdown = document.body.querySelector('[aria-label="Закрыть разбивку"]');
    expect(closeBreakdown).not.toBeNull();
    await act(async () => {
      closeBreakdown.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 220));
    });
    await act(async () => {
      notStartedOverdue.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    });
    const overduePopover = document.body.querySelector(".MuiPopover-root");
    expect(overduePopover.textContent).toContain("Просрочено · не начато");
    expect(overduePopover.textContent).toContain("Брак упаковки");
    expect(overduePopover.textContent).toContain("1");
    const closeOverdueBreakdown = document.body.querySelector('[aria-label="Закрыть разбивку"]');
    await act(async () => {
      closeOverdueBreakdown.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 220));
    });
    const executorCard = [...host.querySelectorAll('[role="button"]')]
      .find((node) => node.textContent.includes("Иванов Иван") && node.textContent.includes("открыто 1"));
    expect(executorCard).toBeDefined();
    await act(async () => {
      executorCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(document.body.querySelector(".MuiDialog-root")).not.toBeNull();
    expect(document.body.querySelector(".MuiDialog-root").textContent).toContain("Брак упаковки");
    await act(async () => { root.unmount(); host.remove(); });
  });
});
