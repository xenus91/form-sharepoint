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

  // ⚠️ Известное расхождение «карточка vs таблица»: resolveResultFlow смотрит только loc/ic/c,
  // поэтому ic-результат с полями (p) и доп. действиями (aa) в попапе таблицы завершается сразу —
  // поля собирает только карточка. Если таблица должна вести себя иначе, это решение по продукту,
  // а не «попутная» правка (см. docs/decisions/dob-task-sources.md).
  it("ic + p + aa: поток для таблицы всё равно complete — поля собирает только карточка", () => {
    const r = rule('{"Найдена": { "ic": true, "p": [{ "f": "Location1", "ti": "Местоположение" }], "aa": true }}', "Найдена");
    expect(r.promptFields).toHaveLength(1);
    expect(r.showAdditionalActions).toBe(true);
    expect(resolveResultFlow("Найдена", r)).toEqual({ action: "complete", reason: "behaviour.ic" });
  });

  // ── Клик из ТАБЛИЦЫ (попап по строке) ───────────────────────────────────────
  it("таблица + p:[Location1] → диалог местоположения (поля карточки собрать негде)", () => {
    const r = rule('{"Найдена": { "ic": true, "p": [{ "f": "Location1", "ti": "Местоположение" }] }}', "Найдена");
    expect(resolveResultFlow("Найдена", r, { fromTable: true })).toEqual({
      action: "location",
      reason: "behaviour.p.Location1",
    });
    // в карточке форма рисуется инлайн (поток не запускается), поэтому — complete
    expect(resolveResultFlow("Найдена", r, {})).toEqual({ action: "complete", reason: "behaviour.ic" });
    const onlyP = rule('{"Найдена": { "p": [{ "f": "Location1", "ti": "Местоположение" }] }}', "Найдена");
    expect(resolveResultFlow("Найдена", onlyP, {})).toEqual({ action: "complete", reason: "behaviour-direct" });
  });

  it("таблица + другие prompt-поля, подтверждение или aa → открываем карточку, а не пишем «молча»", () => {
    const byField = rule('{"X": { "p": [{ "f": "CommentResult", "ti": "Причина" }] }}', "X");
    expect(resolveResultFlow("X", byField, { fromTable: true })).toEqual({
      action: "open-card",
      reason: "behaviour.needs-form",
    });
    const byAA = rule('{"X": { "aa": true }}', "X");
    expect(resolveResultFlow("X", byAA, { fromTable: true })).toEqual({
      action: "open-card",
      reason: "behaviour.needs-form",
    });
    // одиночное поле Location1 + обязательное подтверждение (c) — тоже в карточку:
    // диалог местоположения подтвердить результат не может
    const locationAndConfirm = rule('{"X": { "p": [{ "f": "Location1" }], "c": true }}', "X");
    expect(resolveResultFlow("X", locationAndConfirm, { fromTable: true })).toEqual({
      action: "open-card",
      reason: "behaviour.needs-form",
    });
  });

  it("таблица + ic без полей → complete (подтверждения в таблице нет)", () => {
    const r = rule('{"Не найдена": { "ic": true }}', "Не найдена");
    expect(resolveResultFlow("Не найдена", r, { fromTable: true })).toEqual({
      action: "complete",
      reason: "behaviour.ic",
    });
  });

  it("без Behaviour — complete, без диалогов", () => {
    expect(resolveResultFlow("Не найдена", rule("{}", "Не найдена"))).toEqual({
      action: "complete",
      reason: "no-behaviour",
    });
  });
});
