// @vitest-environment jsdom
// src/features/tasks/__tests__/taskTakeover.test.jsx
//
// Перехват задачи, взятой в работу другим сотрудником: если с момента взятия
// прошло больше 30 минут, блокировка «задача у другого» снимается и завершить
// её может любой. До этого карточка показывала «Возьмите другую задачу» БЕЗ
// всякой привязки ко времени — задача висела на человеке, который ушёл со смены.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TaskCard from "../components/TaskCard";
import {
  isTakeoverAvailable,
  takenInWorkAtMs,
  TAKEOVER_AFTER_MINUTES,
} from "../../../tasks/takeover";

vi.mock("../../../tasks/resultField", () => ({
  fetchResultFieldsMeta: async () => [],
  fetchContentTypeResultMap: async () => new Map(),
  getResultFieldForTask: () => null,
  getResultChoicesForTask: async () => ({ choices: null, field: null }),
}));
vi.mock("../../../tasks/relatedFields", () => ({
  parseRelatedRef: () => null,
  fetchRelatedFields: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const NOW = new Date("2026-10-22T12:00:00Z").getTime();
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();

describe("Правило перехвата — 30 минут с момента взятия в работу", () => {
  it("29 минут — ещё чужая, перехватывать нельзя", () => {
    expect(isTakeoverAvailable({ Modified: minutesAgo(29) }, { now: NOW })).toBe(false);
  });

  it("30 минут ровно — уже можно перехватить", () => {
    expect(isTakeoverAvailable({ Modified: minutesAgo(TAKEOVER_AFTER_MINUTES) }, { now: NOW })).toBe(true);
  });

  it("45 минут — можно перехватить", () => {
    expect(isTakeoverAvailable({ Modified: minutesAgo(45) }, { now: NOW })).toBe(true);
  });

  it("нет отметки времени — перехват не разрешаем вслепую", () => {
    expect(isTakeoverAvailable({}, { now: NOW })).toBe(false);
    expect(isTakeoverAvailable({ Modified: "не дата" }, { now: NOW })).toBe(false);
  });

  it("отметку берём из Modified (в том числе из raw)", () => {
    expect(takenInWorkAtMs({ Modified: minutesAgo(10) })).toBe(NOW - 10 * 60_000);
    expect(takenInWorkAtMs({ raw: { Modified: minutesAgo(10) } })).toBe(NOW - 10 * 60_000);
  });
});

// Карточный уровень: баннер перехвата рендерится ОТДЕЛЬНО от дерева веток
// действий (IIFE перед ним в TaskCard.jsx), поэтому воспроизводится в jsdom —
// в отличие от ветки isLockedForMe, до которой тестовая конфигурация не доходит.
import TaskCardCmp from "../components/TaskCard";

// ВАЖНО: от реального Date.now(), а не от фиксированной даты — isTakeoverAvailable
// внутри карточки времени теста не знает, и «5 минут назад» от фиксированного
// NOW превращалось в «6 часов назад», из-за чего баннер показывался всегда.
const minAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

async function mountCard(modifiedIso) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(ThemeProvider, { theme: createTheme() },
        React.createElement(TaskCardCmp, {
          taskConfig: { contentTypes: [], behaviour: {}, prompts: [], resultFields: [], actions: {}, styling: {} },
          task: {
            Id: 555, Title: "ЕО 123456", Status: "В процессе выполнения",
            Editor: "Иванов Иван", EditorTitle: "Иванов Иван", EditorId: 999,
            AssignedToId: 999, AssignedTo: "Иванов Иван", Modified: modifiedIso,
            raw: { Editor: { Id: 999, Title: "Иванов Иван" } },
          },
          isCompleted: false, isOverdue: false, fieldDefaultActions: [],
          choices: ["Найдена", "Не найдена"],
          currentUserId: 207, currentUserTitle: "Поршаков Сергей",
          onResultClick: vi.fn(), onComplete: vi.fn(), onTakeInWork: vi.fn(),
        }))
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
  return {
    hint: () => host.querySelector('[data-testid="takeover-hint"]'),
    text: () => host.textContent,
    close: () => act(() => { root.unmount(); host.remove(); }),
  };
}

describe("Карточка — баннер перехвата", () => {
  it("5 минут назад: баннера нет (задача ещё чужая)", async () => {
    const v = await mountCard(minAgo(5));
    expect(v.hint()).toBeNull();
    v.close();
  });

  it("40 минут назад: баннер виден и называет того, у кого задача", async () => {
    const v = await mountCard(minAgo(40));
    expect(v.hint()).not.toBeNull();
    expect(v.text()).toContain("В работе у Иванов Иван более 30 минут");
    expect(v.text()).toContain("можно перехватить");
    v.close();
  });
});
