// src/features/tasks/__tests__/rowActions.test.js
// Действия по строке таблицы #tasks должны совпадать с кнопками КАРТОЧКИ задачи
// (TaskCard) для того же статуса и того же типа контента:
//   • «Не начата» → «Взять в работу» + «Изменить»;
//   • «в работе»  → кнопки результатов по ContentType (порядок и подписи — как в карточке)
//                   + «Изменить»;
//   • задача НЕ взята в работу («Не начата» и любой прочий незавершённый статус) →
//     только «Взять в работу»: «Изменить» недоступна, пока задачу не взяли;
//   • «Изменить» появляется ТОЛЬКО после взятия в работу — у main вместе с
//     кнопками результата, у ДОБ (внешний источник и main-задачи «Результат
//     проверки ООБ») вместо них;
//   • чужая задача «в работе» → плашка «В работе у X» вместо кнопок результатов;
//   • завершённая задача (любая) → ни одной кнопки, только плашка «Задача завершена».

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
  it("main «Не начата»: только «Взять в работу» (форма — после взятия)", () => {
    const onTake = vi.fn();
    const onEdit = vi.fn();
    const actions = buildRowActions(MAIN_NOT_STARTED, { canTake: true, onTake, onEdit });
    expect(labels(actions)).toEqual(["Взять в работу"]);
    actions[0].onClick();
    expect(onTake).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    // «Взять в работу» — акцентная, как в карточке
    expect(actions[0].variant).toBe("contained");
  });

  it("main-задача «Результат проверки ООБ» (externalLike): без кнопок результата, «Изменить» — после взятия", () => {
    // Как у задач dob: результат и поля собирает форма ДОБ, в карточке/таблице
    // кнопок результата нет (иначе был бы «молчаливый» обход формы).
    const onResult = vi.fn();
    const onEdit = vi.fn();
    const row = { sourceId: "main", Id: 13, Status: "В работе", PercentComplete: 0 };
    const actions = buildRowActions(row, {
      choices: ["Годен", "Брак"],
      onResult,
      onEdit,
      externalLike: true,
      resolveEditor: () => ({ fields: [{ internalName: "DescriptionCheckResult" }] }),
    });
    expect(labels(actions)).toEqual(["Изменить"]);
    expect(onResult).not.toHaveBeenCalled();
    actions[0].onClick();
    expect(onEdit).toHaveBeenCalledTimes(1);

    // Не взята в работу: единственное действие — «Взять в работу».
    const notStarted = buildRowActions(
      { sourceId: "main", Id: 14, Status: "Не начата", PercentComplete: 0 },
      { canTake: true, externalLike: true, onEdit, choices: ["Годен"] },
    );
    expect(labels(notStarted)).toEqual(["Взять в работу"]);
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

  it("чужую задачу «в работе» нельзя взять: плашка «В работе у X» и ничего больше", () => {
    const actions = buildRowActions(MAIN_IN_PROGRESS, {
      takenByOther: true,
      takerLabel: "Иванов Пётр",
      choices: ["Найдена", "Не найдена"],
      canTake: true,
    });
    expect(labels(actions)).toEqual(["В работе у Иванов Пётр"]);
    expect(actions[0].kind).toBe("info");
    expect(actions[0].onClick).toBeUndefined();
    // ни кнопок результата, ни «Изменить»: задача чужая
    expect(actions.some((a) => a.key === "edit")).toBe(false);
    expect(actions.some((a) => a.key.startsWith("result:"))).toBe(false);

    // свою задачу «в работе» видим полностью: результаты + «Изменить»
    const mine = buildRowActions(MAIN_IN_PROGRESS, { choices: ["Найдена"], takenByOther: false });
    expect(labels(mine)).toEqual(["Найдена", "Изменить"]);
  });

  it("статус без правил (напр. «Отменена») — «Взять в работу» как fallback карточки", () => {
    // задача не в работе → «Изменить» нет, единственное действие — взятие
    const actions = buildRowActions(MAIN_CANCELLED, { canTake: true });
    expect(labels(actions)).toEqual(["Взять в работу"]);
    // даже если взять по статусу нельзя — кнопка есть (fallback карточки)
    expect(labels(buildRowActions(MAIN_CANCELLED, { canTake: false }))).toEqual(["Взять в работу"]);
  });

  it("завершённая задача — кнопок нет вообще (только плашка «Задача завершена»)", () => {
    const actions = buildRowActions(MAIN_DONE, { canTake: true, choices: ["Найдена"], updating: false });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ key: "completed", kind: "info", label: "Задача завершена" });
    expect(actions[0].onClick).toBeUndefined();

    // завершённая dob-задача — то же самое: ни «Взять в работу», ни «Изменить»
    const dobDone = buildRowActions(
      { sourceId: "dob", Id: 3, Status: "Завершена", PercentComplete: 1 },
      { canTake: true },
    );
    expect(labels(dobDone)).toEqual(["Задача завершена"]);
    expect(dobDone[0].kind).toBe("info");
  });

  it("внешний источник (dob): сначала только «Взять в работу», «Изменить» — после взятия", () => {
    const onTake = vi.fn();
    const onEdit = vi.fn();
    const actions = buildRowActions(DOB_NOT_STARTED, {
      canTake: true,
      choices: ["Найдена"], // у dob результатов не показываем — карточка read-only
      onTake,
      onEdit,
    });
    expect(labels(actions)).toEqual(["Взять в работу"]);
    actions[0].onClick();
    expect(onTake).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();

    // взята в работу (мной): «Изменить» доступна, «Взять в работу» больше нет
    const inProgress = buildRowActions(DOB_IN_PROGRESS, { canTake: false, onEdit });
    expect(labels(inProgress)).toEqual(["Изменить"]);
    inProgress[0].onClick();
    expect(onEdit).toHaveBeenCalledTimes(1);

    // взята другим — только плашка, никаких кнопок
    const foreign = buildRowActions(DOB_IN_PROGRESS, {
      canTake: false,
      takenByOther: true,
      takerLabel: "Иванов Пётр",
    });
    expect(labels(foreign)).toEqual(["В работе у Иванов Пётр"]);
    expect(foreign[0].kind).toBe("info");
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

    // «Изменить» — вторичная, как в карточке внешней задачи (после взятия в работу)
    const edit = buildRowActions(MAIN_IN_PROGRESS, { choices: [] }).pop();
    expect(edit.key).toBe("edit");
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

  it("«Изменить» у main-задач закреплена внизу; до взятия в работы её нет ни у кого", () => {
    // dob-строка «в работе» (взята мной): взять нельзя — «Изменить» доступна
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

    // «Изменить» ровно одна там, где задача ВЗЯТА В РАБОТУ (правила 2026-10-04)
    const expectEdits = (row, count) => {
      const actions = buildRowActions(row, { canTake: true, choices: ["Найдена"] });
      expect(actions.filter((a) => a.key === "edit")).toHaveLength(count);
    };
    // main: «в работе» — есть, «Не начата»/«Отменена»/«Завершена» — нет
    expectEdits(MAIN_IN_PROGRESS, 1);
    expectEdits(MAIN_NOT_STARTED, 0);
    expectEdits(MAIN_CANCELLED, 0);
    expectEdits(MAIN_DONE, 0);
    // dob: до взятия в работу — нет, после — есть, у завершённой — нет
    expectEdits(DOB_NOT_STARTED, 0);
    expectEdits(DOB_IN_PROGRESS, 1);
    expectEdits({ sourceId: "dob", Id: 4, Status: "Завершена", PercentComplete: 1 }, 0);
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
