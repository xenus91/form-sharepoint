// src/features/tasks/__tests__/resultDispatch.test.js
// Единый диспетчер кнопок результата: одна настройка TaskBehaviour → одно поведение
// и в карточке, и в таблице. Проверяем РЕАЛЬНЫЕ настройки пользователя (2026-10-03).
//
//   «Результат поиска ЕО»
//     • Найдена:    { "loc": true, "aa": true }        → диалог местоположения (flow)
//     • Не найдена: { "ic": true, "ok": …, "no": … }   → две кнопки в карточке
//
//   «Задача исправления проблемной ЕО»
//     • Исправлено:    { "p": [], "c": false }         → сразу запись результата (flow)
//     • Не исправлено: { "p": [{…}], "c": true }       → форма карточки (prompt-поля)

import { describe, it, expect } from "vitest";
import { resolveResultDispatch } from "../lib/resultDispatch";

describe("resolveResultDispatch — Behaviour решает, что делает кнопка", () => {
  it("«Найдена» (loc + aa): диалог местоположения, а НЕ карточка с формой", () => {
    // loc:true + aa:true — в таблице открывался диалог местоположения (в нём же
    // собираются доп. действия). Раньше таблица открывала карточку с prompt-формой
    // и теряла местоположение — это и был регресс.
    expect(resolveResultDispatch({ requiresLocation: true, showAdditionalActions: true })).toBe("flow");
  });

  it("«Не найдена» (ic): две кнопки в карточке", () => {
    expect(resolveResultDispatch({ inlineConfirm: true })).toBe("card-buttons");
    // ic вместе с prompt-полями — это уже форма (ic-кнопки появляются только без полей)
    expect(resolveResultDispatch({ inlineConfirm: true, promptFields: [{ f: "Comment" }] })).toBe("card-form");
  });

  it("«Не исправлено» (p + c): форма карточки, затем диалог подтверждения", () => {
    expect(resolveResultDispatch({
      promptFields: [{ internalName: "CommentResult", required: true }],
      requiresConfirmed: true,
    })).toBe("card-form");
  });

  it("«Исправлено» (p: [], c: false): сразу запись результата", () => {
    expect(resolveResultDispatch({ promptFields: [], requiresConfirmed: false })).toBe("flow");
  });

  it("доп. действия без местоположения: форма карточки (иначе их негде собрать)", () => {
    expect(resolveResultDispatch({ showAdditionalActions: true })).toBe("card-form");
  });

  it("подтверждение (c) и пустое правило: общий поток TasksView", () => {
    expect(resolveResultDispatch({ requiresConfirmed: true })).toBe("flow");
    expect(resolveResultDispatch(null)).toBe("flow");
    expect(resolveResultDispatch(undefined)).toBe("flow");
  });
});
