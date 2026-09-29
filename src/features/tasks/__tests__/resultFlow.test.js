// src/features/tasks/__tests__/resultFlow.test.js
// Регрессия потока результата: Behaviour.ic = подтверждение двумя кнопками в карточке.
import { describe, it, expect } from "vitest";
import { parseBehaviour, resolveBehaviour } from "../../../services/behaviourParser";
import { resolveResultFlow } from "../resultFlow";

const rule = (json, choice) => resolveBehaviour(choice, parseBehaviour(json).value);

describe("resultFlow / Behaviour.ic", () => {
  const json = `{
    "_default": { "rf": [ { "f": "THU", "ti": "ЕО" } ] },
    "Найдена": { "loc": true, "aa": true, "aar": false, "anim": "celebrate" },
    "Не найдена": {
      "ic": true,
      "ok": "Создать заявку",
      "no": "Отмена",
      "anim": { "type": "sherlock", "title": "Создаю заявку на ООБ" }
    }
  }`;

  it("ic парсится и не включает диалог", () => {
    const r = rule(json, "Не найдена");
    expect(r.inlineConfirm).toBe(true);
    expect(r.requiresConfirmed).toBeNull();
  });

  it("поток для ic — complete (без диалога)", () => {
    const r = rule(json, "Не найдена");
    expect(resolveResultFlow("Не найдена", r)).toEqual({ action: "complete", reason: "behaviour.ic" });
  });

  it("тексты кнопок приходят из ok/no", () => {
    const r = rule(json, "Не найдена");
    expect(r.confirmTexts.okText).toBe("Создать заявку");
    expect(r.confirmTexts.cancelText).toBe("Отмена");
  });

  it("анимация sherlock из Behaviour.anim", () => {
    const r = rule(json, "Не найдена");
    expect(r.animation).toBe("sherlock");
    expect(r.animationConfig?.title).toBe("Создаю заявку на ООБ");
  });

  it("альтернативная запись c:inline → то же самое", () => {
    const r = rule('{"Не найдена": { "c": "inline", "ok": "Да" }}', "Не найдена");
    expect(r.inlineConfirm).toBe(true);
    expect(r.requiresConfirmed).toBe(false);
    expect(resolveResultFlow("Не найдена", r).action).toBe("complete");
  });

  it("без ic поведение прежнее: c=true → confirm", () => {
    const r = rule('{"Не найдена": { "c": true }}', "Не найдена");
    expect(r.inlineConfirm).toBeNull();
    expect(resolveResultFlow("Не найдена", r)).toEqual({ action: "confirm", reason: "behaviour.c" });
  });

  it("loc приоритетнее ic", () => {
    const r = rule('{"Не найдена": { "ic": true, "loc": true }}', "Не найдена");
    expect(resolveResultFlow("Не найдена", r)).toEqual({ action: "location", reason: "behaviour.loc" });
  });

  it("без Behaviour — complete, без диалогов", () => {
    expect(resolveResultFlow("Не найдена", rule("{}", "Не найдена"))).toEqual({
      action: "complete",
      reason: "no-behaviour",
    });
  });
});
