// @vitest-environment jsdom
// src/features/tasks/__tests__/TaskCard.deepLink.test.jsx
//
// Deep-link #tasks/<Id>?action=<значение> должен открывать в карточке РОВНО то, что
// открылось бы по клику на кнопку этого результата — и ничего не терять.
//
// Регресс, который здесь закреплён: эффект-«сброс» inline-состояния объявлен ПОСЛЕ
// deep-link эффекта и на монтировании затирал его (setInlineChoice(null)) — форма не
// открывалась вовсе, а таблица, которая на этот deep-link опирается, «молчала».
//
// Настройки — реальные (2026-10-03), запись TaskBehaviour «Результат поиска ЕО»:
//   «Найдена»     { "loc": true, "aa": true }      → диалог местоположения (не карточка)
//   «Не найдена»  { "ic": true, "ok": …, "no": … } → две кнопки в карточке

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TaskCard from "../components/TaskCard";

// Карточка сама подтягивает choices/поля по ContentType — в тесте они не нужны:
// мок убирает сетевой шум, поведение берётся из переданного taskConfig.
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

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const CT_SEARCH = "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E";

// ⭐ Настройки пользователя: подтверждение двумя кнопками (ic) + местоположение с
// доп. действиями (loc/aa) для той же записи TaskBehaviour.
const BEHAVIOUR_SEARCH = JSON.stringify({
  "_default": { rf: [{ f: "THU", ti: "ЕО" }] },
  "Найдена": { loc: true, aa: true, aar: false, anim: "celebrate" },
  "Не найдена": { ic: true, ok: "Подтвердить «Не найдена»", no: "Отмена", anim: "none" },
});

const PERM = { read: true, write: true };
const STYLING = JSON.stringify({
  "_default": { bg: "linear-gradient(180deg, #5a67d8 0%, #434190 100%)", c: "#ffffff", v: "ctd" },
  "Найдена": { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", c: "#ffffff", v: "ctd" },
  "Не найдена": { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", c: "#ffffff", v: "ctd" },
});

const behaviourRecord = {
  id: 2,
  title: "Результат поиска ЕО",
  description: "",
  behaviour: BEHAVIOUR_SEARCH,
  styling: STYLING,
  stylingActions: JSON.stringify({
    "_default": { v: "ctd" },
    takeInWork: { bg: "linear-gradient(180deg, #7b84ff 0%, #5a67d8 100%)", c: "#ffffff", v: "ctd" },
    confirm: { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", c: "#ffffff", v: "ctd" },
    cancel: { c: "#5f6368", v: "tx" },
  }),
  enabled: true,
  permissions: PERM,
};

// raw-вид записи, как его отдаёт список TaskBehaviour (Title/Behaviour/…)
const rawBehaviourRecord = {
  Id: 2,
  Title: "Результат поиска ЕО",
  Behaviour: BEHAVIOUR_SEARCH,
  StylingResultButton: STYLING,
  StylingActions: behaviourRecord.stylingActions,
  Enabled: true,
};

const taskConfig = {
  taskBehaviour: new Map([[2, behaviourRecord]]),
  taskBehaviourRecords: [rawBehaviourRecord],
  ctMetaMap: new Map([[CT_SEARCH, { id: CT_SEARCH, name: "Результат поиска ЕО", stringId: CT_SEARCH }]]),
  ctConfigMap: new Map(),
};

const TASK = {
  Id: 651,
  Title: "Найти ЕО",
  Body: "Проверить паллет",
  Status: "В процессе",
  PercentComplete: 0,
  AssignedTo: "Поршаков Сергей",
  AssignedToId: 207,
  EditorTitle: "Поршаков Сергей",
  ContentTypeId: CT_SEARCH,
  contentTypeId: CT_SEARCH,
  ResultSearchTHU: "",
  RelatedItems: "",
  raw: { ContentTypeId: CT_SEARCH },
};

const CHOICES = ["Найдена", "Не найдена"];

// ── Вторая запись: «Задача исправления проблемной ЕО» — prompt-поле «Причина» + подтверждение
const CT_FIX = "0x0108003365C4474CAE8C42BCE396314E88E51F008DE7E6A51CADB449AD082BE301AEB160001EA3FD7A60054A43B9375B07848DB0D7";
const BEHAVIOUR_FIX = JSON.stringify({
  "_default": { rf: [{ f: "THU", ti: "ЕО" }] },
  "Исправлено": { p: [], c: false, aa: false, aar: false, anim: "celebrate" },
  "Не исправлено": {
    p: [{ f: "CommentResult", ti: "Причина", t: "text", r: true }],
    c: true,
    ct: "Подтверждение результата",
    cm: "Вы уверены, что хотите завершить задачу как «Не исправлено»?",
    ok: "Подтвердить «Не исправлено»",
    no: "Отмена",
    anim: "none",
  },
});
const rawFixRecord = {
  Id: 1,
  Title: "Задача исправления проблемной ЕО",
  Behaviour: BEHAVIOUR_FIX,
  StylingResultButton: STYLING,
  StylingActions: "",
  Enabled: true,
};
const taskConfigFix = {
  taskBehaviour: new Map([[1, { ...behaviourRecord, id: 1, title: rawFixRecord.Title, behaviour: BEHAVIOUR_FIX }]]),
  taskBehaviourRecords: [...taskConfig.taskBehaviourRecords, rawFixRecord],
  ctMetaMap: new Map([[CT_FIX, { id: CT_FIX, name: "Исправление проблемной ЕО", stringId: CT_FIX }]]),
  ctConfigMap: new Map(),
};
const TASK_FIX = {
  ...TASK,
  Id: 652,
  Title: "Устранить проблемы",
  ContentTypeId: CT_FIX,
  contentTypeId: CT_FIX,
  raw: { ContentTypeId: CT_FIX },
};

const settle = async (ms = 250) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function mountCard(initialAction, spies = {}, opts = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(ThemeProvider, { theme: createTheme() },
        React.createElement(TaskCard, {
          taskConfig: opts.taskConfig || taskConfig,
          task: opts.task || TASK,
          isCompleted: false,
          isOverdue: false,
          fieldDefaultActions: [],
          choices: opts.choices || CHOICES,
          initialAction,
          currentUserId: 207,
          currentUserTitle: "Поршаков Сергей",
          onResultClick: spies.onResultClick || vi.fn(),
          onComplete: spies.onComplete || vi.fn(),
        }))
    );
  });
  await settle(600);
  const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  const inputs = () => [...host.querySelectorAll("input, textarea")];
  return { host, buttons, inputs };
}

describe("TaskCard — deep-link ?action=<значение>", () => {
  it("«Не найдена» (ic): открывает подтверждение двумя кнопками", async () => {
    const { buttons } = await mountCard("Не найдена");
    expect(buttons()).toEqual(["Подтвердить «Не найдена»", "Отмена"]);
  });

  it("«Найдена» (loc + aa): никакой формы — поток TasksView (диалог местоположения)", async () => {
    const onResultClick = vi.fn();
    const { buttons, inputs } = await mountCard("Найдена", { onResultClick });
    // карточке нечего показывать: местоположение и доп. действия собирает диалог TasksView
    expect(inputs()).toHaveLength(0);
    expect(buttons()).toEqual(["Не найдена", "Найдена"]);
    expect(onResultClick).toHaveBeenCalledWith(TASK, "Найдена");
  });

  it("deep-link не переоткрывается после «Отмена» (одноразовый)", async () => {
    const { buttons, host } = await mountCard("Не найдена");
    const cancel = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Отмена");
    await act(async () => {
      cancel.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
    await settle(400);
    expect(buttons()).toEqual(["Не найдена", "Найдена"]);
  });

  it("«Не исправлено» (prompt-поле + подтверждение): deep-link открывает форму с полем", async () => {
    // Раньше deep-link вообще не открывался (эффект-сброс затирал inlineChoice),
    // поэтому таблица «молчала» на этом результате.
    const { host, buttons, inputs } = await mountCard("Не исправлено", {}, {
      taskConfig: taskConfigFix, task: TASK_FIX, choices: ["Исправлено", "Не исправлено"],
    });
    expect(buttons()).toContain("Сохранить — Не исправлено");
    expect(inputs().some((i) => (i.getAttribute("placeholder") || "").includes("Причина"))).toBe(true);

    // обязательное поле: submit без значения не уходит и подсвечивает ошибку
    const save = [...host.querySelectorAll("button")].find((b) => /Сохранить/.test(b.textContent));
    await act(async () => {
      save.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(host.textContent).toContain("Заполните обязательные поля");
  });

  it("обычный клик по «Найдена» (loc) уходит в тот же поток, что и deep-link", async () => {
    const onResultClick = vi.fn();
    const { host } = await mountCard(undefined, { onResultClick });
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Найдена");
    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(onResultClick).toHaveBeenCalledWith(TASK, "Найдена");
  });
});
