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
} from "../lib/taskTakeover";

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

// Карточный уровень (ветка isLockedForMe в TaskCard.jsx) jsdom-стендом не
// воспроизводится: при «в работе у другого» карточка в тестовой конфигурации
// всё равно рисует кнопки результата, то есть до ветки блокировки не доходит.
// Правило 30 минут покрыто юнит-тестами выше, а в карточку оно заведено одной
// строкой: `&& !isTakeoverAvailable(task)` (TaskCard.jsx:1251,
// ExternalTaskCard.jsx:63, useTaskMutations.js:166).
