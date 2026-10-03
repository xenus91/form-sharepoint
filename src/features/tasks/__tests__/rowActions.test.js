// src/features/tasks/__tests__/rowActions.test.js
// Действия по строке таблицы #tasks должны совпадать с кнопками КАРТОЧКИ задачи
// (TaskCard) для того же статуса и того же типа контента:
//   • «Не начата» → «Взять в работу» + «Изменить»;
//   • «в работе»  → кнопки результатов по ContentType (порядок и подписи — как в карточке)
//                   + «Изменить»;
//   • чужая задача «в работе» → плашка «В работе у X» вместо кнопок результатов;
//   • задачи внешнего источника (dob) → «Взять в работу» + «Изменить» (read-only карточка);
//   • завершённая задача → только «Изменить».

import { describe, it, expect, vi } from "vitest";
import { buildRowActions, resultActionSx, primaryActionSx, DEFAULT_TAKE_SX } from "../lib/rowActions";

const MAIN_NOT_STARTED = { sourceId: "main", Id: 10, Status: "Не начата", PercentComplete: 0 };
const MAIN_IN_PROGRESS = { sourceId: "main", Id: 11, Status: "В работе", PercentComplete: 0 };
const MAIN_DONE = { sourceId: "main", Id: 12, Status: "Завершена", PercentComplete: 1 };
const MAIN_CANCELLED = { sourceId: "main", Id: 13, Status: "Отменена", PercentComplete: 0 };
const DOB_NOT_STARTED = { sourceId: "dob", Id: 1, Status: "Не начата", PercentComplete: 0 };
const DOB_IN_PROGRESS = { sourceId: "dob", Id: 2, Status: "В работе", PercentComplete: 0 };

const labels = (actions) => actions.map((a) => a.label);

describe("buildRowActions — паритет с карточкой", () => {
  it("main «Не начата»: «Взять в работу» + «Изменить»", () => {
    const onTake = vi.fn();
    const onEdit = vi.fn();
    const actions = buildRowActions(MAIN_NOT_STARTED, { canTake: true, onTake, onEdit });
    expect(labels(actions)).toEqual(["Взять в работу", "Изменить"]);
    actions[0].onClick();
    actions[1].onClick();
    expect(onTake).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    // «Взять в работу» — акцентная (как в карточке), «Изменить» — вторичная
    expect(actions[0].variant).toBe("contained");
    expect(actions[1].variant).toBe("outlined");
  });

  it("main «в работе»: кнопки результатов по типу контента + «Изменить»", () => {
    const onResult = vi.fn();
    const actions = buildRowActions(MAIN_IN_PROGRESS, {
      choices: ["Найдена", "Не найдена"],
      onResult,
    });
    expect(labels(actions)).toEqual(["Найдена", "Не найдена", "Изменить"]);
    expect(actions.some((a) => a.label === "Взять в работу")).toBe(false);
    actions[1].onClick();
    expect(onResult).toHaveBeenCalledWith("Не найдена");
  });

  it("вид кнопки результата берётся из Behaviour.stylingResultButton", () => {
    const stylingByChoice = {
      "Найдена": { variant: "contained", bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", color: "#fff" },
      "Не найдена": { variant: "contained", bg: "#c62828", color: "#fff" },
      "Не требуется": { variant: "outlined", bg: null, color: "#171c8f" },
    };
    const actions = buildRowActions(MAIN_IN_PROGRESS, {
      choices: ["Найдена", "Не найдена", "Не требуется"],
      resolveStyling: (choice) => stylingByChoice[choice] || null,
    });
    const [found, notFound, notNeeded] = actions;
    expect(found.sx.backgroundImage).toContain("linear-gradient");
    expect(notFound.sx.backgroundColor).toBe("#c62828");
    expect(notFound.sx.backgroundImage).toBeUndefined();
    // outline-кнопка цвет не заливает — только рамка, как в карточке
    expect(notNeeded.variant).toBe("outlined");
    expect(notNeeded.sx).toEqual({ borderWidth: 1.5 });
  });

  it("чужую задачу «в работе» нельзя взять: плашка «В работе у X» без кнопок результатов", () => {
    const actions = buildRowActions(MAIN_IN_PROGRESS, {
      takenByOther: true,
      takerLabel: "Иванов Пётр",
      choices: ["Найдена", "Не найдена"],
      canTake: true,
    });
    expect(labels(actions)).toEqual(["В работе у Иванов Пётр", "Изменить"]);
    expect(actions[0].kind).toBe("info");
    expect(actions[0].onClick).toBeUndefined();
  });

  it("статус без правил (напр. «Отменена») — «Взять в работу» как fallback карточки", () => {
    const actions = buildRowActions(MAIN_CANCELLED, { canTake: true });
    expect(labels(actions)).toEqual(["Взять в работу", "Изменить"]);
  });

  it("завершённая задача — только «Изменить»", () => {
    const actions = buildRowActions(MAIN_DONE, { canTake: false, choices: ["Найдена"] });
    expect(labels(actions)).toEqual(["Изменить"]);
  });

  it("внешний источник (dob): «Взять в работу» + «Изменить», без результата", () => {
    const onTake = vi.fn();
    const actions = buildRowActions(DOB_NOT_STARTED, {
      canTake: true,
      choices: ["Найдена"], // у dob результатов не показываем — карточка read-only
      onTake,
    });
    expect(labels(actions)).toEqual(["Взять в работу", "Изменить"]);
    actions[0].onClick();
    expect(onTake).toHaveBeenCalledTimes(1);

    // dob-задача уже в работе: взять нельзя, «Изменить» остаётся
    const inProgress = buildRowActions(DOB_IN_PROGRESS, { canTake: false });
    expect(labels(inProgress)).toEqual(["Изменить"]);
  });

  it("«Взять в работу» выглядит как кнопка карточки, stylingActions.takeInWork имеет приоритет", () => {
    // по умолчанию — тот же градиент, что у кнопки в карточке
    const [take] = buildRowActions(MAIN_NOT_STARTED, { canTake: true });
    expect(take.sx.backgroundImage).toBe(DEFAULT_TAKE_SX.backgroundImage);

    // Behaviour.stylingActions.takeInWork (как в TaskCard) переопределяет вид
    const [custom] = buildRowActions(MAIN_NOT_STARTED, {
      canTake: true,
      takeStyling: { variant: "outlined", bg: "#0d47a1", color: "#fff" },
    });
    expect(custom.variant).toBe("outlined");
    expect(custom.sx.backgroundColor).toBe("#0d47a1");

    // «Изменить» — вторичная, как в карточке внешней задачи
    const edit = buildRowActions(MAIN_NOT_STARTED, { canTake: true }).pop();
    expect(edit.sx.color).toBe("#171c8f");

    expect(primaryActionSx(null).backgroundImage).toBe(DEFAULT_TAKE_SX.backgroundImage);
    expect(primaryActionSx({ variant: "text" })).toEqual({ borderWidth: 1.5 });
  });

  it("во время записи действия блокируются", () => {
    const actions = buildRowActions(MAIN_NOT_STARTED, { canTake: true, updating: true });
    expect(actions.every((a) => a.disabled)).toBe(true);

    const dobActions = buildRowActions(DOB_NOT_STARTED, { canTake: true, taking: true });
    expect(dobActions.every((a) => a.disabled)).toBe(true);
  });

  it("resultActionSx: градиент/плоский цвет только для contained", () => {
    expect(resultActionSx({ variant: "contained", bg: "linear-gradient(90deg,#000,#fff)" }))
      .toEqual({ backgroundImage: "linear-gradient(90deg,#000,#fff)", color: "#fff", borderColor: "transparent" });
    expect(resultActionSx({ variant: "contained", bg: "#123456", color: "#fff" }))
      .toEqual({ backgroundColor: "#123456", color: "#fff", borderColor: "transparent" });
    expect(resultActionSx({ variant: "outlined", bg: "#123456" })).toEqual({ borderWidth: 1.5 });
    expect(resultActionSx(null)).toEqual({ borderWidth: 1.5 });
  });
});
