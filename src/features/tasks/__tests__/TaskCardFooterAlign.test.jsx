// @vitest-environment jsdom
// src/features/tasks/__tests__/TaskCardFooterAlign.test.jsx
//
// Нижняя строка карточки: «Исполнитель: <кнопка> • Статус: …».
//
// Регрессия: кнопка «Кому назначено» — inline-flex с иконкой. Такой элемент
// выравнивается по baseline СВОЕЙ ИКОНКИ (у svg baseline = нижний край), из-за
// чего подписи вокруг кнопки оказывались на трёх разных высотах — строка
// «ехала лесенкой». Теперь подписи и кнопка лежат в одной flex-строке
// (align-items: center), а сама кнопка выровнена по центру строки.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TaskCard from "../components/TaskCard";

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
// Уточнение «человек или группа» по Id — сеть в тесте не нужна.
vi.mock("../lib/assignees", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveAssigneeCached: async (_task, person) => ({
      id: person?.id ?? null,
      kind: "user",
      title: person?.title || "Поршаков Сергей",
      loginName: null,
      email: null,
    }),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

// «Не начата» — в этой ветке нижняя строка: «Исполнитель: … • Статус: …».
const TASK = {
  Id: 10,
  Title: "Проверить паллет",
  Body: "Проверить паллет в ячейке",
  Status: "Не начата",
  PercentComplete: 0,
  AssignedTo: "Поршаков Сергей",
  AssignedToId: 207,
  Modified: "2026-10-03T09:00:00Z",
};

function renderCard() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(ThemeProvider, { theme: createTheme() },
        React.createElement(TaskCard, {
          task: TASK,
          isCompleted: false,
          isOverdue: false,
          fieldDefaultActions: [],
          choices: [],
          currentUserId: 207,
          currentUserTitle: "Поршаков Сергей",
          onResultClick: vi.fn(),
          onComplete: vi.fn(),
          onTakeInWork: vi.fn(),
        })),
    );
  });
  return { host, root };
}

const styleOf = (el) => (el ? window.getComputedStyle(el) : null);

describe("TaskCard — нижняя строка без «лесенки»", () => {
  it("подписи и кнопка исполнителя лежат в одной flex-строке", () => {
    const { host } = renderCard();
    // В карточке несколько кнопок «Кому назначено» — берём ту, что в нижней строке.
    const row = host.querySelector('[data-testid="task-card-footer-row"]');
    expect(row).toBeTruthy();
    const button = row.querySelector('[data-testid="assigned-to-button"]');
    expect(button).toBeTruthy();
    const rowStyle = styleOf(row);
    expect(rowStyle.display).toBe("inline-flex");
    expect(rowStyle.alignItems).toBe("center");
  });

  it("строка целиком: «Исполнитель:» и «• Статус:» — соседи кнопки, а не общий текст", () => {
    const { host } = renderCard();
    const row = host.querySelector('[data-testid="task-card-footer-row"]');
    // Кнопка лежит внутри обёртки AssignedToButtons — исключаем её по наличию
    // кнопки внутри, а не сравнением ссылок.
    const labels = [...row.children]
      // подписи — всё, что не кнопка принципала и не её прочерк
      .filter((el) => !el.querySelector("[data-principal-button]") && !el.hasAttribute("data-testid"))
      .map((el) => (el.textContent || "").trim());
    expect(labels).toEqual(["Исполнитель:", "• Кому назначено:", "• Статус: Не начата"]);
    // обе подписи — кнопки принципала: исполнитель и «кому назначено»
    expect(row.querySelector('[data-testid="taker-empty"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="assigned-to-button"]')).toBeTruthy();
  });

  it("кнопка выровнена по центру строки, а не по низу иконки", () => {
    const { host } = renderCard();
    const row = host.querySelector('[data-testid="task-card-footer-row"]');
    const button = row.querySelector('[data-testid="assigned-to-button"]');
    const style = styleOf(button);
    expect(style.verticalAlign).toBe("middle");
    expect(style.display).toBe("inline-flex");
  });

  it("кнопка не выше соседнего текста (не раздвигает строку)", () => {
    const { host } = renderCard();
    const row = host.querySelector('[data-testid="task-card-footer-row"]');
    const button = row.querySelector('[data-testid="assigned-to-button"]');
    const style = styleOf(button);
    // Высота берётся ОТ СТРОКИ (line-height подписи), а не задана числом:
    // иначе inline-flex с иконкой растолкал бы строку.
    expect(style.lineHeight).toBe("inherit");
    expect(style.height).toBe("auto");
    // min-height MUI (30 px у size="small") — выключен
    expect(["0px", "0"]).toContain(style.minHeight);
  });
});
