// src/tasks/__tests__/contentTypeFields.test.js
// Форма закрытия строится по типу контента и типам колонок; поиск людей — по учётной записи.

import { describe, it, expect, beforeEach } from "vitest";
import {
  RESULT_CHECK_OOO_CT_ID,
  SYSTEM_AND_TASK_FIELDS,
  buildContentTypeForm,
  clearContentTypeFieldsCache,
  controlKindOf,
  isDialogRequired,
  isFormField,
  plainText,
  taskContentTypeId,
  validateRequiredFields,
} from "../contentTypeFields";
import {
  accountLocalPart,
  accountQueryVariants,
  clearUserSearchCache,
  matchesUser,
  normalizeAccountSeparators,
  personDisplayName,
  personOptionLabel,
  searchSiteUsers,
} from "../userSearch";

const FIELD = (over = {}) => ({
  InternalName: "X",
  Title: "X",
  TypeAsString: "Text",
  Required: false,
  Hidden: false,
  ReadOnlyField: false,
  ...over,
});

describe("contentTypeFields — тип контента «Результат проверки ООБ»", () => {
  it("контролы строятся по типам колонок SharePoint", () => {
    expect(controlKindOf(FIELD({ TypeAsString: "Note" }))).toBe("richtext");
    expect(controlKindOf(FIELD({ TypeAsString: "Number" }))).toBe("number");
    expect(controlKindOf(FIELD({ TypeAsString: "Choice" }))).toBe("autocomplete");
    expect(controlKindOf(FIELD({ TypeAsString: "User" }))).toBe("person");
    expect(controlKindOf(FIELD({ TypeAsString: "UserMulti" }))).toBe("person");
    expect(controlKindOf(FIELD({ TypeAsString: "Calculated" }))).toBe(null);
  });

  it("системные и служебные поля задачи в форму не попадают", () => {
    expect(isFormField(FIELD({ InternalName: "Title" }))).toBe(false);
    expect(isFormField(FIELD({ InternalName: "AssignedTo", TypeAsString: "User" }))).toBe(false);
    expect(isFormField(FIELD({ InternalName: "Modified", TypeAsString: "DateTime" }))).toBe(false);
    expect(isFormField(FIELD({ InternalName: "Hidden1", Hidden: true }))).toBe(false);
    expect(isFormField(FIELD({ InternalName: "ReadOnly1", ReadOnlyField: true }))).toBe(false);
    expect(isFormField(FIELD({ InternalName: "DescriptionCheckResult", TypeAsString: "Note" }))).toBe(true);
    expect(isFormField(FIELD({ InternalName: "Guilty", TypeAsString: "User" }))).toBe(true);
    expect(SYSTEM_AND_TASK_FIELDS.has("TaskStatus")).toBe(true);
  });

  it("buildContentTypeForm: результат отдельно, поля с подписями и обязательностью", () => {
    const fields = [
      FIELD({ InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен", "Брак"] } }),
      FIELD({ InternalName: "DescriptionCheckResult", TypeAsString: "Note", Required: true, Title: "DescriptionCheckResult" }),
      FIELD({ InternalName: "ErrorTypeValidation", TypeAsString: "Choice", FillInChoice: true, Choices: { results: ["Тип A"] } }),
      FIELD({ InternalName: "ErrorCountValidation", TypeAsString: "Number", Title: "ErrorCountValidation" }),
      FIELD({ InternalName: "Guilty", Title: "Guilty", TypeAsString: "User", AllowMultipleValues: true }),
      FIELD({ InternalName: "TaskStatus", TypeAsString: "Choice" }),
    ];
    const form = buildContentTypeForm(fields);
    expect(form.resultBlock).toMatchObject({
      internalName: "DobSearchResult",
      choices: ["Годен", "Брак"],
      required: true,
    });
    const names = form.controls.map((c) => c.internalName);
    expect(names).toEqual(["DescriptionCheckResult", "ErrorTypeValidation", "ErrorCountValidation", "Guilty"]);
    const desc = form.controls.find((c) => c.internalName === "DescriptionCheckResult");
    expect(desc.kind).toBe("richtext");
    expect(desc.required).toBe(true);
    expect(desc.title).toBe("Описание результата проверки"); // понятная подпись вместо InternalName
    const errType = form.controls.find((c) => c.internalName === "ErrorTypeValidation");
    expect(errType.kind).toBe("autocomplete");
    expect(errType.allowFillIn).toBe(true);
    const guilty = form.controls.find((c) => c.internalName === "Guilty");
    expect(guilty.kind).toBe("person");
    expect(guilty.multiple).toBe(true);
    expect(guilty.title).toBe("Виновный");
    expect(form.required.map((c) => c.internalName)).toEqual(["DescriptionCheckResult"]);
  });

  it("обязательные поля из SharePoint не дают отправить пустую форму", () => {
    const form = buildContentTypeForm([
      FIELD({ InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен"] } }),
      FIELD({ InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true }),
      FIELD({ InternalName: "Guilty", Title: "Guilty", TypeAsString: "User", Required: true, AllowMultipleValues: true }),
      FIELD({ InternalName: "ErrorCountValidation", TypeAsString: "Number" }),
    ]);
    // пусто → проблемы по обязательным
    let problems = validateRequiredFields(form.controls, {}, form.resultBlock, "");
    expect(problems.length).toBe(3);
    expect(problems[0]).toContain("Результат проверки");
    // рич-текст из тегов не считается заполненным
    problems = validateRequiredFields(form.controls, { DescriptionCheckResult: "<p>&nbsp;</p>", Guilty: [] }, form.resultBlock, "Годен");
    expect(problems).toEqual(["Заполните «Описание результата проверки»", "Заполните «Виновный»"]);
    // всё заполнено → можно отправлять
    problems = validateRequiredFields(
      form.controls,
      { DescriptionCheckResult: "<p>Проверено</p>", Guilty: [{ Id: 5 }], ErrorCountValidation: 2 },
      form.resultBlock,
      "Годен",
    );
    expect(problems).toEqual([]);
    expect(plainText("<p>Проверено</p>")).toBe("Проверено");
  });

  it("диалог включается для типа контента «Результат проверки ООБ» и ключом Behaviour.dlg", () => {
    const ctId = RESULT_CHECK_OOO_CT_ID;
    // по типу контента — без всякой настройки
    expect(isDialogRequired(null, ctId)).toBe(true);
    expect(isDialogRequired({ requiresDialog: null }, ctId)).toBe(true);
    // Behaviour.dlg:true — для любого типа контента
    expect(isDialogRequired({ requiresDialog: true }, "0x0108OTHER")).toBe(true);
    // явное отключение
    expect(isDialogRequired({ requiresDialog: false }, ctId)).toBe(false);
    // обычный CT без настройки
    expect(isDialogRequired(null, "0x0108OTHER")).toBe(false);

    expect(taskContentTypeId({ ContentTypeId: ctId })).toBe(ctId);
    expect(taskContentTypeId({ raw: { ContentTypeId: { StringValue: ctId } } })).toBe(ctId);
  });
});

describe("userSearch — поиск людей по учётной записи", () => {
  beforeEach(() => {
    clearUserSearchCache();
    if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  });

  it("разделители _ приводятся к . (и в запросе, и в логине)", () => {
    expect(normalizeAccountSeparators("ivanov_ii")).toBe("ivanov.ii");
    expect(normalizeAccountSeparators("i:0#.f|membership|ivanov_ii@lenta.com")).toBe("i:0#.f|membership|ivanov.ii@lenta.com");
    expect(normalizeAccountSeparators("ivanov.ii")).toBe("ivanov.ii");
    expect(accountQueryVariants("ivanov_ii")).toEqual(["ivanov_ii", "ivanov.ii"]);
    expect(accountQueryVariants("ivanov.ii")).toEqual(["ivanov.ii"]);
    expect(accountLocalPart("i:0#.f|membership|ivanov.ii@lenta.com")).toBe("ivanov.ii");
  });

  it("matchesUser находит и по «точечному» варианту учётной записи", () => {
    const user = { Id: 7, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov.ii@lenta.com", Email: "ivanov.ii@lenta.com" };
    expect(matchesUser(user, "ivanov_ii")).toBe(true);
    expect(matchesUser(user, "ivanov.ii")).toBe(true);
    expect(matchesUser(user, "Иванов")).toBe(true);
    expect(matchesUser(user, "petrov")).toBe(false);
  });

  it("searchSiteUsers: серверный фильтр + фолбэк по странице сайта", async () => {
    const calls = [];
    const get = async (url) => {
      calls.push(url);
      if (url.includes("substringof")) {
        if (url.includes("ivanov.ii")) {
          return { data: { d: { results: [{ Id: 7, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov.ii@lenta.com", Email: "ivanov.ii@lenta.com" }] } } };
        }
        return { data: { d: { results: [] } } };
      }
      if (url.includes("/web/siteusers?")) {
        return {
          data: {
            d: {
              results: [
                { Id: 7, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov.ii@lenta.com" },
                { Id: 8, Title: "Петров Пётр", LoginName: "i:0#.f|membership|petrov_pp@lenta.com" },
              ],
            },
          },
        };
      }
      return { data: { d: { results: [] } } };
    };
    // запрос с подчёркиванием: сервер точного совпадения не даёт, спасает «точечный» вариант
    const found = await searchSiteUsers("ivanov_ii", { get });
    expect(found.map((u) => u.Id)).toEqual([7]);
    expect(calls.some((u) => u.includes("ivanov.ii"))).toBe(true);
    // фолбэк: сервер ничего не вернул → фильтруем страницу siteusers локально
    const fallback = await searchSiteUsers("petrov_pp", { get });
    expect(fallback.map((u) => u.Id)).toEqual([8]);
  });

  it("подписи: имя, а с должностью — «Имя — Должность»", () => {
    const user = { Id: 7, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov.ii@lenta.com" };
    expect(personDisplayName(user)).toBe("Иванов Иван");
    expect(personOptionLabel(user, "Главный специалист")).toBe("Иванов Иван — Главный специалист");
    expect(personOptionLabel(user, "")).toBe("Иванов Иван");
  });
});
