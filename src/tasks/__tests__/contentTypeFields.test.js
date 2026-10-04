// src/tasks/__tests__/contentTypeFields.test.js
// Форма закрытия строится по типу контента и типам колонок; поиск людей — по учётной записи.

import { describe, it, expect, beforeEach } from "vitest";
import {
  RESULT_CHECK_OOO_CT_ID,
  contentTypeIdOf,
  contentTypeIdMatches,
  fetchTaskContentTypeId,
  clearTaskContentTypeIdCache,
  RESULT_CHECK_OOO_CT_FULL_ID,
  isDialogRequired,
  isResultCheckTask,
  taskContentTypeId,
  taskContentTypeName,
  controlKindOf,
  fetchContentTypeFields,
  clearContentTypeFieldsCache,
  isFormField,
  buildContentTypeForm,
  validateRequiredFields,
  SYSTEM_AND_TASK_FIELDS,
  plainText,
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
    expect(controlKindOf(FIELD({ TypeAsString: "Choice" }))).toBe("select");
    expect(controlKindOf(FIELD({ TypeAsString: "Choice", FillInChoice: true }))).toBe("autocomplete");
    expect(controlKindOf(FIELD({ TypeAsString: "MultiChoice" }))).toBe("multichoice");
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

describe("состав формы — только FieldLinks типа контента", () => {
  const CT_ID = RESULT_CHECK_OOO_CT_FULL_ID;

  it("колонки списка, которых нет в типе контента, в форму не попадают", async () => {
    clearContentTypeFieldsCache();
    const link = (Id, Name, DisplayName) => ({ Id, Name, DisplayName, Required: false, Hidden: false, ReadOnly: false });
    const field = (Id, InternalName, TypeAsString, extra = {}) => ({
      Id, InternalName, Title: InternalName, TypeAsString, Required: false, Hidden: false, ReadOnlyField: false, ...extra,
    });
    const get = async (url) => {
      const u = String(url);
      if (u.includes("/contenttypes?")) {
        return {
          data: {
            d: {
              results: [{
                Id: "{99C7C1CB-2C1A-4A1F-9A4C-1E1E3D0B7A11}",
                StringId: CT_ID,
                Name: "Результат проверки ООБ",
                FieldLinks: {
                  results: [
                    link("{11111111-1111-1111-1111-111111111111}", "DescriptionCheckResult", "Описание результата проверки"),
                    link("{22222222-2222-2222-2222-222222222222}", "DobSearchResult", "Результат проверки"),
                    link("{33333333-3333-3333-3333-333333333333}", "Guilty", "Виновный"),
                  ],
                },
              }],
            },
          },
        };
      }
      if (u.includes("/fields?")) {
        return {
          data: {
            d: {
              results: [
                field("{11111111-1111-1111-1111-111111111111}", "DescriptionCheckResult", "Note", { Required: true }),
                field("{22222222-2222-2222-2222-222222222222}", "DobSearchResult", "Choice", { Choices: { results: ["Годен"] } }),
                field("{33333333-3333-3333-3333-333333333333}", "Guilty", "UserMulti", { AllowMultipleValues: true }),
                // Этих колонок в типе контента нет — в форму они попадать не должны
                field("{44444444-4444-4444-4444-444444444444}", "AdditionalActions", "MultiChoice", { Choices: { results: ["Перебрать"] } }),
                field("{55555555-5555-5555-5555-555555555555}", "AdditionalActionsRequired", "Boolean"),
              ],
            },
          },
        };
      }
      return { data: { d: {} } };
    };

    const fields = await fetchContentTypeFields(CT_ID, { get, listApi: "/api/web/lists(guid'463b634e-a71a-4fef-9a1f-b803431d8639')" });
    const names = fields.map((f) => f.InternalName);
    expect(names).toEqual(["DescriptionCheckResult", "DobSearchResult", "Guilty"]);
    expect(names).not.toContain("AdditionalActions");
    expect(names).not.toContain("AdditionalActionsRequired");
    // типы колонок подтянуты из метаданных списка (FieldLinks их не отдаёт)
    expect(fields.find((f) => f.InternalName === "Guilty").TypeAsString).toBe("UserMulti");
    expect(fields.find((f) => f.InternalName === "DescriptionCheckResult").Required).toBe(true);

    // и форма строится ровно по этим полям: результат-кнопки + виновный, без доп. действий
    const form = buildContentTypeForm(fields);
    expect(form.resultBlock.internalName).toBe("DobSearchResult");
    expect(form.controls.map((c) => c.internalName)).toEqual(["DescriptionCheckResult", "Guilty"]);
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

describe("распознавание типа контента «Результат проверки ООБ»", () => {
  it("ContentTypeId читается из строки, объекта SharePoint, OData-префикса и raw", () => {
    expect(contentTypeIdOf(RESULT_CHECK_OOO_CT_ID)).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(contentTypeIdOf({ StringValue: RESULT_CHECK_OOO_CT_ID })).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(contentTypeIdOf({ Id: { StringValue: RESULT_CHECK_OOO_CT_ID } })).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(taskContentTypeId({ ContentTypeId: { StringValue: RESULT_CHECK_OOO_CT_ID } })).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(taskContentTypeId({ raw: { ContentTypeId: RESULT_CHECK_OOO_CT_ID } })).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(taskContentTypeId({ raw: { ContentTypeId: { StringValue: RESULT_CHECK_OOO_CT_ID } } })).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(taskContentTypeId({ OData__ContentTypeId: RESULT_CHECK_OOO_CT_ID })).toBe(RESULT_CHECK_OOO_CT_ID);
    expect(taskContentTypeId({ contentTypeId: RESULT_CHECK_OOO_CT_ID.toLowerCase() })).toBe(RESULT_CHECK_OOO_CT_ID.toLowerCase());
    expect(taskContentTypeId(null)).toBe("");
  });

  it("задача опознаётся и по имени типа контента, если id не пришёл", () => {
    expect(taskContentTypeName({ raw: { ContentType: { Name: "Результат проверки ООБ" } } })).toBe("Результат проверки ООБ");
    expect(isResultCheckTask({ raw: { ContentType: { Name: "Результат проверки ООБ" } } })).toBe(true);
    expect(isResultCheckTask({ raw: { ContentType: { Name: "Задача рабочего процесса" } } })).toBe(false);
    expect(isResultCheckTask({ contentTypeId: RESULT_CHECK_OOO_CT_ID })).toBe(true);
    expect(isResultCheckTask({ contentTypeId: "0x0108" })).toBe(false);
    expect(isResultCheckTask(undefined)).toBe(false);
  });

  it("id элемента приходит дочерним (тип + сегмент) — матчинг только по префиксу", () => {
    // фактический ответ основного списка: наш «базовый» id — префикс реального
    expect(RESULT_CHECK_OOO_CT_FULL_ID.startsWith(RESULT_CHECK_OOO_CT_ID)).toBe(true);
    expect(contentTypeIdMatches(RESULT_CHECK_OOO_CT_FULL_ID, RESULT_CHECK_OOO_CT_ID)).toBe(true);
    // обратное направление не матчится — иначе «0x0108»/родительский тип дали бы ложь
    expect(contentTypeIdMatches(RESULT_CHECK_OOO_CT_ID, RESULT_CHECK_OOO_CT_FULL_ID)).toBe(false);
    expect(contentTypeIdMatches("0x0108", RESULT_CHECK_OOO_CT_ID)).toBe(false);
    // базовый id элемента закрывается списком известных id (сравнение по равенству)
    expect(contentTypeIdMatches(RESULT_CHECK_OOO_CT_ID, RESULT_CHECK_OOO_CT_ID)).toBe(true);
    expect(contentTypeIdMatches(RESULT_CHECK_OOO_CT_FULL_ID.toUpperCase(), RESULT_CHECK_OOO_CT_ID)).toBe(true);
    // соседние типы того же родителя НЕ совпадают
    expect(contentTypeIdMatches("0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E", RESULT_CHECK_OOO_CT_ID)).toBe(false);
    expect(isResultCheckTask({ ContentTypeId: RESULT_CHECK_OOO_CT_FULL_ID })).toBe(true);
    expect(isDialogRequired(null, RESULT_CHECK_OOO_CT_FULL_ID)).toBe(true);
  });

  it("isDialogRequired понимает объектный id и имя типа контента", () => {
    expect(isDialogRequired(null, { StringValue: RESULT_CHECK_OOO_CT_ID })).toBe(true);
    expect(isDialogRequired(null, "", "Результат проверки ООБ")).toBe(true);
    expect(isDialogRequired(null, "0x0108", "Задача рабочего процесса")).toBe(false);
    expect(isDialogRequired(null, "0x01080100C9C9515DE4E24001905074F980F9316000171B790935C7B84786EA282A503FB52C")).toBe(false);
    expect(isDialogRequired({ requiresDialog: false }, RESULT_CHECK_OOO_CT_ID)).toBe(false);
    expect(isDialogRequired({ requiresDialog: true }, "0x0108")).toBe(true);
  });
});

describe("ContentTypeId элемента, когда в строке его нет", () => {
  it("дочитывается у элемента основного списка и кэшируется", async () => {
    clearTaskContentTypeIdCache();
    const calls = [];
    const get = async (url) => {
      calls.push(String(url));
      return { data: { d: { ContentTypeId: RESULT_CHECK_OOO_CT_FULL_ID } } };
    };
    const id = await fetchTaskContentTypeId(13, { get });
    expect(id).toBe(RESULT_CHECK_OOO_CT_FULL_ID);
    expect(calls[0]).toContain("/items(13)");
    expect(calls[0]).toContain("$select=ContentTypeId");
    // второй запрос берётся из кэша — в сеть не идём
    const again = await fetchTaskContentTypeId(13, { get: async () => { throw new Error("no network"); } });
    expect(again).toBe(RESULT_CHECK_OOO_CT_FULL_ID);
    expect(calls.length).toBe(1);
    // и такой id сразу включает форму по колонкам типа контента
    expect(isDialogRequired(null, again)).toBe(true);
  });

  it("ошибка запроса не ломает открытие формы (пустой id)", async () => {
    clearTaskContentTypeIdCache();
    const failing = async () => { const e = new Error("500"); e.response = { status: 500 }; throw e; };
    await expect(fetchTaskContentTypeId(99, { get: failing })).resolves.toBe("");
    expect(isDialogRequired(null, "", "")).toBe(false);
  });
});
