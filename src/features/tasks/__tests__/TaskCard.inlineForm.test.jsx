// @vitest-environment jsdom
// src/features/tasks/__tests__/TaskCard.inlineForm.test.jsx
//
// «Инлайном вместо диалога»: чтобы результат собирал местоположение и доп. действия
// ПРЯМО В КАРТОЧКЕ (без диалога «Где найдена ЕО?»), ключ Behaviour.loc не нужен —
// достаточно prompt-поля Behaviour.p (поле Location1) + Behaviour.aa для доп. действий.
// loc (даже вместе с p) всегда ведёт в диалог TasksView — это проверяется здесь же,
// чтобы правило не потерялось.

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

// ⭐ Одна и та же запись TaskBehaviour «Результат поиска ЕО» в двух вариантах:
//   INLINE — «Найдена» собирается в карточке (p + aa, без loc);
//   DIALOG — «Найдена» уходит в диалог местоположения TasksView (loc).
const behaviourOf = (foundRule) => JSON.stringify({
  "_default": { rf: [{ f: "THU", ti: "ЕО" }, { f: "Recipient/SCNumberText", ti: "Получатель" }] },
  "Найдена": foundRule,
  "Не найдена": {
    ic: true,
    ok: "Подтвердить «Не найдена»",
    no: "Отмена",
    anim: { type: "sherlock", title: "Создаю заявку на ООБ", text: "Отправляю запрос в ООБ...", emoji: "🕵" },
  },
});

const BEHAVIOUR_INLINE = behaviourOf({
  p: [{ f: "Location1", ti: "Местоположение", t: "multiline" }],
  aa: true,
  aar: false,
  anim: "celebrate",
});
const BEHAVIOUR_DIALOG = behaviourOf({ loc: true, aa: true, aar: false, anim: "celebrate" });

// StylingResultButton / StylingActions — как в настройках пользователя.
const STYLING = JSON.stringify({
  i: false,
  "_default": { bg: "linear-gradient(180deg, #5a67d8 0%, #434190 100%)", c: "#ffffff", v: "ctd" },
  "Найдена": { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", c: "#ffffff", v: "ctd" },
  "Не найдена": { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", c: "#ffffff", v: "ctd" },
});
const STYLING_ACTIONS = JSON.stringify({
  i: false,
  "_default": { v: "ctd" },
  takeInWork: { bg: "linear-gradient(180deg, #7b84ff 0%, #5a67d8 100%)", c: "#ffffff", v: "ctd" },
  confirm: { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", c: "#ffffff", v: "ctd" },
  cancel: { c: "#5f6368", v: "tx" },
  promptSubmit: { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", c: "#ffffff", v: "ctd" },
  promptCancel: { c: "#5f6368", v: "tx" },
});

function makeConfig(behaviour) {
  const record = {
    id: 2,
    title: "Результат поиска ЕО",
    description: "",
    behaviour,
    styling: STYLING,
    stylingActions: STYLING_ACTIONS,
    enabled: true,
  };
  return {
    taskBehaviour: new Map([[2, record]]),
    ctMetaMap: new Map([[CT_SEARCH, { id: CT_SEARCH, name: "Результат поиска ЕО", stringId: CT_SEARCH }]]),
    ctConfigMap: new Map(),
  };
}

const TASK = {
  Id: 651,
  Title: "Найти ЕО",
  Body: "Проверить ЕО 808117004021471765",
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

const settle = async (ms = 250) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function mountCard(behaviour, spies = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(ThemeProvider, { theme: createTheme() },
        React.createElement(TaskCard, {
          taskConfig: makeConfig(behaviour),
          task: TASK,
          isCompleted: false,
          isOverdue: false,
          fieldDefaultActions: [],
          choices: CHOICES,
          currentUserId: 207,
          currentUserTitle: "Поршаков Сергей",
          onResultClick: spies.onResultClick || vi.fn(),
          onComplete: spies.onComplete || vi.fn(),
        }))
    );
  });
  await settle(600);
  const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  const findButton = (re) => [...host.querySelectorAll("button")].find((b) => re.test(b.textContent || ""));
  const inputs = () => [...host.querySelectorAll("input, textarea")];
  const click = async (el) => {
    await act(async () => {
      el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
  };
  const dialogs = () => document.querySelectorAll('[role="dialog"], .MuiDialog-root').length;
  return { host, buttons, findButton, inputs, click, dialogs };
}

// «ic» = подтверждение двумя кнопками: оно включает инлайн-режим, но САМО по себе
// полей не показывает — поля берутся из p, доп. действия из aa.
const BEHAVIOUR_IC_ONLY = behaviourOf({ ic: true, ok: "Подтвердить «Найдена»", no: "Отмена", anim: "none" });
const BEHAVIOUR_IC_P_AA = behaviourOf({
  ic: true,
  ok: "Подтвердить «Найдена»",
  no: "Отмена",
  p: [{ f: "Location1", ti: "Местоположение", t: "multiline" }],
  aa: true,
  aar: false,
  anim: "none",
});

describe("TaskCard — результат инлайном (p + aa, без loc)", () => {
  it("клик по «Найдена» открывает форму В КАРТОЧКЕ: поле Location1 + доп. действия, без диалогов", async () => {
    const { host, buttons, inputs, click, dialogs } = await mountCard(BEHAVIOUR_INLINE);
    expect(buttons().sort()).toEqual(["Найдена", "Не найдена"]);
    expect(dialogs()).toBe(0);

    await click([...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Найдена"));

    // Никакого диалога — всё inline в карточке
    expect(dialogs()).toBe(0);
    // prompt-поле из Behaviour.p
    const area = inputs().find((i) => (i.getAttribute("placeholder") || "").includes("Местоположение"));
    expect(area).toBeTruthy();
    // доп. действия из Behaviour.aa и подпись «необязательно» из aar: false
    expect(host.textContent).toMatch(/Дополнительные действия/);
    expect(host.textContent).toMatch(/необязательно/i);
    // кнопки формы — из StylingActions.promptSubmit/promptCancel
    expect(buttons()).toContain("Сохранить — Найдена");
    expect(buttons()).toContain("Отмена");
  });

  it("submit инлайн-формы отдаёт Location1 и выбранные доп. действия", async () => {
    const onComplete = vi.fn();
    const onResultClick = vi.fn();
    const { findButton, inputs, click } = await mountCard(BEHAVIOUR_INLINE, { onComplete, onResultClick });

    await click(findButton(/^Найдена$/));
    const area = inputs().find((i) => (i.getAttribute("placeholder") || "").includes("Местоположение"));
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(area, "Зона отгрузки, ряд 5");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
    });

    await click(findButton(/Сохранить — Найдена/));
    // Behaviour.anim = celebrate → submit уходит после анимации (1.6 с)
    await settle(2000);

    expect(onResultClick).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [task, choice, values, req, acts] = onComplete.mock.calls[0];
    expect(task.Id).toBe(651);
    expect(choice).toBe("Найдена");
    expect(values).toMatchObject({ Location1: "Зона отгрузки, ряд 5" });
    expect(req).toBe("Нет"); // доп. действия необязательные (aar: false) и не выбраны
    expect(acts).toEqual([]);
  });

  it("«Отмена» возвращает кнопки результата (карточка без формы)", async () => {
    const { buttons, findButton, click } = await mountCard(BEHAVIOUR_INLINE);
    await click(findButton(/^Найдена$/));
    expect(buttons()).toContain("Сохранить — Найдена");
    await click(findButton(/^Отмена$/));
    expect(buttons().sort()).toEqual(["Найдена", "Не найдена"]);
  });

  it("ic БЕЗ p: только две кнопки, полей ввода нет", async () => {
    const { buttons, inputs, host, click, dialogs } = await mountCard(BEHAVIOUR_IC_ONLY);
    await click([...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Найдена"));
    expect(dialogs()).toBe(0);
    expect(inputs()).toHaveLength(0); // ← ключевой момент: ic сам по себе полей не даёт
    expect(buttons()).toEqual(["Подтвердить «Найдена»", "Отмена"]);
  });

  it("ic + p + aa: инлайн-форма с полем и доп. действиями, кнопка подписана из Behaviour.ok", async () => {
    const { host, buttons, inputs, click, dialogs } = await mountCard(BEHAVIOUR_IC_P_AA);
    await click([...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Найдена"));
    expect(dialogs()).toBe(0);
    expect(inputs().some((i) => (i.getAttribute("placeholder") || "").includes("Местоположение"))).toBe(true);
    expect(host.textContent).toMatch(/Дополнительные действия/);
    // ic задаёт подпись кнопки отправки (ok), стили — promptSubmit/promptCancel
    expect(buttons()).toContain("Подтвердить «Найдена»");
    expect(buttons()).toContain("Отмена");
    expect(buttons()).not.toContain("Сохранить — Найдена");
  });

  it("контраст: с ключом loc форма в карточке НЕ открывается — результат уходит в диалог TasksView", async () => {
    const onResultClick = vi.fn();
    const { buttons, inputs, host, click, dialogs } = await mountCard(BEHAVIOUR_DIALOG, { onResultClick });
    await click([...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Найдена"));
    expect(inputs()).toHaveLength(0);
    expect(dialogs()).toBe(0);
    expect(buttons().sort()).toEqual(["Найдена", "Не найдена"]);
    expect(onResultClick).toHaveBeenCalledWith(TASK, "Найдена");
  });
});
