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

  it("цвета кнопок результата — ровно как в карточке (StylingResultButton → sx)", () => {
    // Форма, которую реально отдаёт resolveStylingForChoice: background (shorthand),
    // color, variant и hover — всё это TaskCard переносит в sx без изменений.
    const stylingByChoice = {
      "Найдена": {
        background: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)",
        color: "#fff",
        variant: "contained",
        "&:hover": { filter: "brightness(1.1)" },
      },
      "Не найдена": { background: "#c62828", color: "#fff", variant: "contained", "&:hover": { filter: "brightness(1.1)" } },
      "Не требуется": { color: "#171c8f", variant: "outlined" },
    };
    const actions = buildRowActions(MAIN_IN_PROGRESS, {
      choices: ["Найдена", "Не найдена", "Не требуется"],
      resolveStyling: (choice) => stylingByChoice[choice] || null,
    });
    const [found, notFound, notNeeded] = actions;

    expect(found.variant).toBe("contained");
    expect(found.sx.background).toBe(stylingByChoice["Найдена"].background); // градиент не теряется
    expect(found.sx.color).toBe("#fff");
    expect(found.sx["&:hover"]).toEqual({ filter: "brightness(1.1)" }); // hover — как в карточке
    expect(found.sx.variant).toBeUndefined(); // variant — проп кнопки, внутрь sx не попадает

    expect(notFound.sx.background).toBe("#c62828"); // плоский цвет — тоже через background

    // outline-кнопка: цвет текста из Behaviour + утолщённая рамка, как в TaskCard
    expect(notNeeded.variant).toBe("outlined");
    expect(notNeeded.sx).toEqual({ borderWidth: 1.5, color: "#171c8f" });
  });

  it("иконки действий берутся из Behaviour («i») — как в карточке", () => {
    const ICON = { type: "icon", name: "DoneIcon" };
    const actions = buildRowActions(MAIN_IN_PROGRESS, {
      choices: ["Найдена", "Не найдена"],
      resolveIcon: (choice) => (choice === "Найдена" ? ICON : null),
    });
    expect(actions[0].icon).toBe(ICON); // иконка из Behaviour
    expect(actions[1].icon).toBe("result"); // нет «i» — нейтральная по умолчанию

    const [take] = buildRowActions(MAIN_NOT_STARTED, { canTake: true, takeIcon: () => ICON });
    expect(take.icon).toBe(ICON);
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

    // Behaviour.stylingActions.takeInWork (как в TaskCard) накладывается поверх
    const [custom] = buildRowActions(MAIN_NOT_STARTED, {
      canTake: true,
      takeStyling: { variant: "outlined", background: "#0d47a1", color: "#fff" },
    });
    expect(custom.variant).toBe("outlined");
    expect(custom.sx.background).toBe("#0d47a1");
    expect(custom.sx.backgroundImage).toBeUndefined(); // outline не заливаем градиентом

    // contained + Behaviour: стили сверху градиента карточки
    const [gradientTake] = buildRowActions(MAIN_NOT_STARTED, {
      canTake: true,
      takeStyling: { variant: "contained", background: "linear-gradient(90deg,#000,#fff)", color: "#000" },
    });
    expect(gradientTake.sx.background).toBe("linear-gradient(90deg,#000,#fff)");
    expect(gradientTake.sx.color).toBe("#000");
    // как в карточке: базовый hover «Взять в работу» остаётся (Behaviour его не задаёт)
    expect(gradientTake.sx["&:hover"]).toEqual(DEFAULT_TAKE_SX["&:hover"]);

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

  it("resultActionSx: стили Behaviour проходят насквозь, outline — только рамка", () => {
    const styled = { variant: "contained", background: "linear-gradient(90deg,#000,#fff)", color: "#fff", "&:hover": { filter: "brightness(1.1)" } };
    expect(resultActionSx(styled, styled.variant)).toEqual({
      background: "linear-gradient(90deg,#000,#fff)",
      color: "#fff",
      "&:hover": { filter: "brightness(1.1)" },
    });
    expect(resultActionSx({ variant: "outlined", background: "#123456" }, "outlined"))
      .toEqual({ borderWidth: 1.5, background: "#123456" });
    // нет Behaviour — MUI defaults (contained primary), как в карточке
    expect(resultActionSx(null)).toEqual({});
  });

  it("«Изменить» есть в меню ВСЕГДА и закреплена внизу (в т.ч. у «образцовых»/dob)", () => {
    // dob-строка «в работе»: взять нельзя — «Изменить» обязана остаться
    const dob = buildRowActions({ sourceId: "dob", Id: 2, Status: "В работе" }, { canTake: false });
    expect(labels(dob)).toEqual(["Изменить"]);
    expect(dob.at(-1).sticky).toBe(true);

    // много кнопок результата — «Изменить» всё равно последняя и закреплена
    const many = buildRowActions(MAIN_IN_PROGRESS, {
      choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    });
    expect(many.at(-1)).toMatchObject({ key: "edit", sticky: true });
    const notSticky = many.filter((a) => !a.sticky);
    expect(notSticky).toHaveLength(10);

    // у всех веток (main/dob, любой статус) ровно одна «Изменить»
    for (const row of [MAIN_NOT_STARTED, MAIN_IN_PROGRESS, MAIN_DONE, MAIN_CANCELLED, DOB_NOT_STARTED, DOB_IN_PROGRESS]) {
      const actions = buildRowActions(row, { canTake: true, choices: ["Найдена"] });
      expect(actions.filter((a) => a.key === "edit")).toHaveLength(1);
    }
  });

  it("resolveEditor: кнопка результата получает инлайн-форму для поповера", () => {
    const row = { sourceId: "main", Id: 5, Status: "В работе", compositeId: "main:5" };
    const editor = { result: "Найдена", fields: [{ internalName: "Location1", title: "Местоположение", required: false }] };
    const [found] = buildRowActions(row, {
      choices: ["Найдена"],
      resolveEditor: (choice) => (choice === "Найдена" ? editor : null),
      onResult: () => {},
    });
    expect(found.key).toBe("result:Найдена");
    expect(found.editor).toBe(editor);
    // если форма не нужна — editor null, клик идёт обычным путём
    const [plain] = buildRowActions(row, { choices: ["Найдена"], resolveEditor: () => null, onResult: () => {} });
    expect(plain.editor).toBeNull();
  });
});
