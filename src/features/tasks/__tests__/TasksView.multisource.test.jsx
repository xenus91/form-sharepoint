// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksView.multisource.test.jsx
//
// Сквозная проверка #tasks на мок-SharePoint (main + dob) с реальным payload
// пользователя: заявка ООБ из списка RequestsTask сайта ДОБ должна
//   • отрисоваться карточкой в карточном режиме,
//   • появиться строкой в табличном режиме,
//   • при этом таблица не должна запрашивать/показывать поля результата,
//   • фильтр должен покрывать пользователя и группу из DcEmail.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIN_LIST = "/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')";
const DOB_BASE = "/dob-api/sites/dob/doblogistic/_api";
const DOB_LIST = "/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')";

const MAIN_FIELDS = ["Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified", "PercentComplete", "DueDate", "Editor", "ContentTypeId", "RelatedItems", "ResultSearchTHU", "Location1", "OffDepKey", "AdditionalsActionsRequired", "AdditionalActions"];
const DOB_FIELDS = ["Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified", "PercentComplete", "DueDate", "Editor", "ContentTypeId", "RelatedItems"];

const state = vi.hoisted(() => ({ requests: [], behaviourOverride: null, thuChoices: null, dobTaken: {} }));

const MAIN_TASK = {
  Id: 10,
  Title: "Основная задача ООБ",
  Body: "Проверить паллет",
  Status: "Не начата",
  PercentComplete: 0,
  DueDate: "2026-10-05T10:00:00Z",
  Created: "2026-10-02T10:00:00Z",
  Modified: "2026-10-03T09:00:00Z",
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E",
  AssignedTo: { Id: 207, Title: "Поршаков Сергей" },
  Editor: { Id: 207, Title: "Поршаков Сергей" },
};

// Ровно тот элемент, который пользователь получил запросом к dob-списку
const DOB_TASK = {
  Id: 1,
  __metadata: { id: "f5501de9-9fe8-4a2a-9b1f-267cd047ea52", uri: `${DOB_BASE}${DOB_LIST}/Items(1)`, etag: '"2"', type: "SP.Data.RequestsTaskListItem" },
  AssignedTo: { results: [{ Id: 207, Title: "Поршаков Сергей" }] },
  Editor: { Id: 207, Title: "Поршаков Сергей" },
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F0064B41D430E2B5D4AB18CF8F3FE9605CF",
  Title: "Заявка ООБ",
  Status: "Не начата",
  PercentComplete: 0,
  Body: "Просмотр видеоархива",
  DueDate: null,
  RelatedItems: JSON.stringify([{ ItemId: 2, WebId: "4d397a16-e572-4dd6-9d81-9b6e83c4ab30", ListId: "21b5b544-bd98-4b06-891f-c5a137331394" }]),
  Modified: "2026-10-03T00:29:42Z",
  Created: "2026-10-03T00:29:41Z",
};

// Поля результата основного списка: у КАЖДОГО типа контента — своё поле
// со своими choices (требование: в таблице те же кнопки, что в карточке по CT).
const RESULT_FIELD_THU = {
  Id: "aaaaaaaa-0000-0000-0000-000000000001",
  InternalName: "ResultSearchTHU",
  Title: "Результат поиска ТНУ",
  TypeAsString: "Choice",
  TypeDisplayName: "Результирующий выбор",
  TypeShortDescription: "Результат задачи",
  Choices: { results: ["Найдена", "Не найдена"] },
};
const RESULT_FIELD_OOB = {
  Id: "bbbbbbbb-0000-0000-0000-000000000002",
  InternalName: "ResultOOB",
  Title: "Результат заявки ООБ",
  TypeAsString: "Choice",
  TypeDisplayName: "Результирующий выбор",
  TypeShortDescription: "Результат задачи",
  Choices: { results: ["Исправлено", "Не исправлено"] },
};
// «Результат проверки ООБ»: своё поле результата — кнопки результата в диалоге.
const RESULT_FIELD_CHECK = {
  Id: "cccccccc-0000-0000-0000-000000000003",
  InternalName: "DobSearchResult",
  Title: "DobSearchResult",
  TypeAsString: "Choice",
  TypeDisplayName: "Результирующий выбор",
  TypeShortDescription: "Результат задачи",
  Choices: { results: ["Годен", "Брак"] },
};
const RESULT_FIELDS = [RESULT_FIELD_THU, RESULT_FIELD_OOB, RESULT_FIELD_CHECK];

// Значения поля ТНУ можно переставить/дополнить: поведение не должно зависеть
// от порядка значений в поле (иначе кнопка «Найдена» могла уехать в «дополнительные»).
const resultFieldsNow = () => RESULT_FIELDS.map((f) => (
  f.InternalName === "ResultSearchTHU" && state.thuChoices
    ? { ...f, Choices: { results: state.thuChoices } }
    : f
));

// Типы контента задач: ТНУ-задача → поле ResultSearchTHU, задача ООБ → ResultOOB.
const CT_THU = MAIN_TASK.ContentTypeId;
// Тип контента «Результат проверки ООБ» — закрывается ТОЛЬКО через диалог по колонкам.
const CT_CHECK = "0x0108003365C4474CAE8C42BCE396314E88E51F00DDA2B3C73567D14D8127B2CBCC18DC19";

// Колонки типа контента (как отдаёт SharePoint в $expand=Fields).
const CT_CHECK_FIELDS = [
  { InternalName: "Title", Title: "Имя задачи", TypeAsString: "Text", Required: false },
  { InternalName: "TaskStatus", Title: "Состояние задачи", TypeAsString: "Choice", Required: false },
  { InternalName: "DobSearchResult", Title: "DobSearchResult", TypeAsString: "Choice", Required: true, Choices: { results: ["Годен", "Брак"] } },
  { InternalName: "DescriptionCheckResult", Title: "DescriptionCheckResult", TypeAsString: "Note", Required: true },
  { InternalName: "ErrorTypeValidation", Title: "ErrorTypeValidation", TypeAsString: "Choice", FillInChoice: true, Choices: { results: ["Ошибка типа A", "Ошибка типа B"] } },
  { InternalName: "ErrorCountValidation", Title: "ErrorCountValidation", TypeAsString: "Number", Required: false },
  { InternalName: "Guilty", Title: "Guilty", TypeAsString: "User", AllowMultipleValues: true, Required: false },
];
// Тип контента задачи с Behaviour-кнопками результатов (не «Результат проверки ООБ»).
const CT_OOB = "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB37F";
// ⭐ id «Результат проверки ООБ» РОВНО такой, каким его отдаёт основной список:
// базовый тип + дочерний сегмент. Строгое равенство с RESULT_CHECK_OOO_CT_ID
// здесь не срабатывает — работает только сопоставление по префиксу.
const CT_CHECK_FULL =
  "0x0108003365C4474CAE8C42BCE396314E88E51F00DDA2B3C73567D14D8127B2CBCC18DC1900EA27BBB7EC9C434BA049A0C60A2EA435";
// GUID основного списка задач (Tasks) — на него ведёт форма ДОБ для задач нового типа.
const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";
const CT_META = [
  { StringId: CT_THU, Name: "Задача ТНУ", Id: { StringValue: CT_THU }, FieldLinks: { results: [{ Id: RESULT_FIELD_THU.Id }] } },
  { StringId: CT_OOB, Name: "Задача ООБ", Id: { StringValue: CT_OOB }, FieldLinks: { results: [{ Id: RESULT_FIELD_OOB.Id }] } },
  { StringId: CT_CHECK, Name: "Результат проверки ООБ", Id: { StringValue: CT_CHECK }, FieldLinks: { results: [{ Id: RESULT_FIELD_CHECK.Id }] } },
];

// TaskBehaviour (список настроек): у результата «Не исправлено» есть prompt-поле,
// поэтому такой результат нельзя завершить «одним кликом» из таблицы — карточка
// должна открыться с этим результатом (как будто нажали кнопку в карточке).
const TASK_BEHAVIOUR_RECORD = {
  Id: 1,
  Title: "Задача ООБ",
  Enabled: true,
  Behaviour: JSON.stringify({
    "исправлено": { c: false },
    "не исправлено": {
      p: [{ f: "Location1", ti: "Где найдено", r: true }],
      c: true,
      ct: "Подтверждение результата",
      cm: "Вы уверены?",
      ok: "Подтвердить",
      no: "Отмена",
    },
  }),
  StylingResultButton: "",
  StylingActions: "",
};

// ⭐ РОВНО настройка пользователя из списка TaskBehaviour («Результат поиска ЕО»):
//   «Найдена» → loc + aa (диалог «Где найдена ЕО?» с блоком доп. действий) + celebrate;
//   «Не найдена» → ic (подтверждение двумя кнопками в карточке) + sherlock.
const TASK_BEHAVIOUR_SEARCH_RECORD = {
  Id: 2,
  Title: "Задача ТНУ",
  Enabled: true,
  Behaviour: JSON.stringify({
    "_default": { rf: [{ f: "THU", ti: "ЕО" }, { f: "Recipient/SCNumberText", ti: "Получатель" }] },
    "Найдена": { loc: true, aa: true, aar: false, anim: "celebrate" },
    "Не найдена": {
      ic: true,
      ok: "Подтвердить «Не найдена»",
      no: "Отмена",
      anim: { type: "sherlock", title: "Создаю заявку на ООБ", text: "Отправляю запрос в ООБ...", emoji: "\uD83D\uDD75" },
    },
  }),
  StylingResultButton: JSON.stringify({
    i: false,
    "_default": { bg: "linear-gradient(180deg, #5a67d8 0%, #434190 100%)", c: "#ffffff", v: "ctd" },
    "Найдена": { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", c: "#ffffff", v: "ctd" },
    "Не найдена": { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", c: "#ffffff", v: "ctd" },
  }),
  StylingActions: JSON.stringify({
    i: false,
    "_default": { v: "ctd" },
    takeInWork: { bg: "linear-gradient(180deg, #7b84ff 0%, #5a67d8 100%)", c: "#ffffff", v: "ctd" },
    confirm: { bg: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", c: "#ffffff", v: "ctd" },
    cancel: { c: "#5f6368", v: "tx" },
    promptSubmit: { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", c: "#ffffff", v: "ctd" },
    promptCancel: { c: "#5f6368", v: "tx" },
  }),
};

// ТНУ-задача «в работе» (Editor = я): в карточке — кнопки результата её типа контента.
const MAIN_THU_IN_PROGRESS = {
  ...MAIN_TASK,
  Id: 12,
  Title: "Поиск ЕО (ТНУ)",
  Body: "Найти ЕО 808117004021471765",
  Status: "В работе",
  PercentComplete: 0,
};

// main-задача, уже взятая в работу (Editor = я) — в карточке у неё кнопки результатов
// её типа контента (ООБ → «Исправлено» / «Не исправлено»)
const MAIN_IN_PROGRESS = {
  ...MAIN_TASK,
  Id: 11,
  Title: "Задача в работе ООБ",
  Status: "В работе",
  PercentComplete: 0,
  ContentTypeId: CT_OOB,
};

// Задача нового типа контента: у неё уже выбран виновный — проверяем, что диалог
// отправит его как Collection(Edm.Int32) в GuiltyId.
const MAIN_CHECK_IN_PROGRESS = {
  ...MAIN_TASK,
  Id: 13,
  Title: "Проверка ЕО (ООБ)",
  Body: "Проверить результат",
  Status: "В работе",
  PercentComplete: 0,
  ContentTypeId: CT_CHECK_FULL,
  Guilty: { results: [{ Id: 5, Title: "Иванов Иван Иванович", LoginName: "i:0#.f|membership|ivanov.ii@lenta.com" }] },
};

// ⭐ Строка, в которой типа контента НЕТ вовсе (так выглядит таблица, если select
// источника не содержал ContentTypeId). Тип дочитывается у самого элемента при
// открытии формы — иначе «Изменить» уводит на #tasks/<Id> обычной карточкой.
const MAIN_CHECK_NO_CT = {
  ...MAIN_CHECK_IN_PROGRESS,
  Id: 14,
  Title: "Проверка ЕО без типа",
  ContentTypeId: null,
};

const MAIN_TASKS_BY_ID = { 10: MAIN_TASK, 11: MAIN_IN_PROGRESS, 12: MAIN_THU_IN_PROGRESS, 13: MAIN_CHECK_IN_PROGRESS, 14: MAIN_CHECK_NO_CT };

// Задача, назначенная на группу из DcEmail (Id 33 на сайте ДОБ)
const DOB_GROUP_TASK = { ...DOB_TASK, Id: 2, Title: "Заявка ООБ (на группу)", AssignedTo: { results: [{ Id: 33, Title: "ООБ" }] }, Modified: "2026-10-02T00:00:00Z" };

function fieldDefs(names) {
  return names.map((n) => ({ InternalName: n, Title: n, TypeAsString: n === "DueDate" ? "DateTime" : "Text" }));
}

function parseSelect(url) {
  const sel = decodeURIComponent(url).match(/\$select=([^&]*)/);
  return sel ? sel[1].split(",") : [];
}

function parseFilter(url) {
  const f = decodeURIComponent(url).match(/\$filter=([^&]*)/);
  return f ? f[1] : "";
}

vi.mock("../../../api", () => {
  const get = async (url) => {
    state.requests.push({ source: "main", url: String(url) });
    const u = String(url);
    const d = decodeURIComponent(u);
    if (u.includes("/web/currentuser")) return { data: { d: { Id: 207, Title: "Поршаков Сергей" } } };
    if (u.includes("GetMyProperties")) {
      return { data: { d: { UserProfileProperties: { results: [{ Key: "Office", Value: "РЦ-8117" }, { Key: "Department", Value: "Отдел обеспечения бизнеса" }] } } } };
    }
    if (u.includes("getbytitle('DcEmail')")) {
      return { data: { d: { results: [{ Id: 5, OffDepKey: "РЦ-8117Отдел обеспечения бизнеса", Email: { results: [{ Id: 33 }] } }] } } };
    }
    if (u.includes("/web/getuserbyid(33)")) {
      const err = new Error("not found");
      err.response = { status: 404, data: {} };
      throw err;
    }
    if (u.includes("/web/sitegroups/getbyid(33)")) return { data: { d: { Id: 33, Title: "ООБ" } } };
    // Поля типа контента — диалог закрытия строит форму строго по колонкам
    if (d.includes("/contenttypes('0x") && d.includes("$expand=Fields")) {
      const isCheck = d.includes(CT_CHECK.toLowerCase()) || d.includes(CT_CHECK);
      return { data: { d: { Fields: { results: isCheck ? CT_CHECK_FIELDS : [] } } } };
    }
    if (d.includes(`${MAIN_LIST}/fields`)) {
      // $filter=TypeDisplayName — выборка полей результата
      if (/TypeDisplayName eq/.test(d)) return { data: { d: { results: resultFieldsNow() } } };
      // $filter=InternalName eq 'X' — конкретное поле
      const byName = d.match(/InternalName eq '([^']+)'/);
      if (byName) {
        const all = [...fieldDefs(MAIN_FIELDS), ...resultFieldsNow()];
        return { data: { d: { results: all.filter((f) => f.InternalName === byName[1]) } } };
      }
      return { data: { d: { results: fieldDefs(MAIN_FIELDS) } } };
    }
    // Типы контента списка — по FieldLinks определяем поле результата для задачи
    if (d.includes(`${MAIN_LIST}/contenttypes`)) return { data: { d: { results: CT_META } } };
    // Настройки поведения задач (TaskBehaviour) — как в тенанте, одним списком
    if (u.includes("getbytitle('TaskBehaviour')")) {
      const searchRecord = state.behaviourOverride
        ? { ...TASK_BEHAVIOUR_SEARCH_RECORD, Behaviour: state.behaviourOverride }
        : TASK_BEHAVIOUR_SEARCH_RECORD;
      return { data: { d: { results: [TASK_BEHAVIOUR_RECORD, searchRecord] } } };
    }
    // взятие в работу / завершение перечитывают СВЕЖИЙ статус элемента
    const single = d.match(/\/items\((\d+)\)/);
    if (single) {
      const n = Number(single[1]);
      const base = MAIN_TASKS_BY_ID[n] || MAIN_TASK;
      // у элемента тип контента есть всегда — даже если его не было в select списка
      const ctId = base.ContentTypeId || (n === 14 ? CT_CHECK_FULL : null);
      return { data: { d: { ...base, ContentTypeId: ctId, __metadata: { etag: '"1"', type: "SP.Data.TasksListItem" } } } };
    }
    if (d.includes(`${MAIN_LIST}/items`)) return { data: { d: { results: [MAIN_TASK, MAIN_IN_PROGRESS, MAIN_THU_IN_PROGRESS, MAIN_CHECK_IN_PROGRESS, MAIN_CHECK_NO_CT] } } };
    if (d.includes(`${MAIN_LIST}?`)) return { data: { d: { ListItemEntityTypeFullName: "SP.Data.TasksListItem" } } };
    // TaskBehaviour / прочие списки — пусто
    return { data: { d: { results: [] } } };
  };
  const post = async (url, body, config) => {
    state.requests.push({
      source: "main",
      url: String(url),
      body,
      merge: /merge/i.test(String(config?.headers?.["X-HTTP-Method"] || "")),
    });
    // Как настоящий SharePoint: в Boolean-колонку строку не принимает.
    const reqVal = body?.AdditionalsActionsRequired ?? body?.AdditionalActionsRequired;
    if (reqVal !== undefined && typeof reqVal !== "boolean") {
      const err = new Error("Request failed with status code 400");
      err.response = {
        status: 400,
        data: {
          error: {
            message: {
              value:
                'Не удается преобразовать значение-примитив в ожидаемый тип "Edm.Boolean". Дополнительные сведения см. во внутреннем исключении.',
            },
          },
        },
      };
      throw err;
    }
    return { data: { d: {} } };
  };
  return {
    default: { get, post, defaults: { headers: {} }, interceptors: { request: { use() {} }, response: { use() {} } } },
    invalidate: vi.fn(),
    getCacheStats: () => ({}),
    cachedGet: (client, url, opts) => client.get(url, opts),
    normalizeNextUrl: (u) => u,
  };
});

// dobAxios живёт отдельным axios-инстансом (cross-site) — мокаем модуль целиком
vi.mock("../../dob/api/dobClient", () => {
  const dobApiBase = () => DOB_BASE;
  const get = async (url) => {
    const u = String(url);
    state.requests.push({ source: "dob", url: u });
    const d = decodeURIComponent(u);
    if (u.includes("/web/currentuser")) return { data: { d: { Id: 207 } } };
    if (u.includes("/web/sitegroups/getbyname") || u.includes("/web/sitegroups?$filter=Title")) {
      return { data: { d: { Id: 33, Title: "ООБ", results: [{ Id: 33, Title: "ООБ" }] } } };
    }
    if (u.includes("/fields?") && /InternalName eq 'Status'/.test(decodeURIComponent(u).replace(/\$filter=/, ""))) {
      return { data: { d: { results: [{ InternalName: "Status", Title: "Статус", Choices: { results: ["Не начата", "В работе", "Завершена"] } }] } } };
    }
    if (d.includes(`${DOB_LIST}/fields`)) return { data: { d: { results: fieldDefs(DOB_FIELDS) } } };
    if (d.includes(`${DOB_LIST}/items`)) {
      const filter = parseFilter(u);
      // После «Взять в работу» (MERGE статуса) элемент реально меняется на сайте —
      // мок отражает это, иначе «Изменить после взятия» нечем проверить.
      const applyTaken = (row) => (state.dobTaken[row.Id]
        ? { ...row, ...state.dobTaken[row.Id] }
        : row);
      const rows = [applyTaken(DOB_TASK)];
      if (/AssignedToId eq 33/.test(filter)) rows.push(applyTaken(DOB_GROUP_TASK));
      return { data: { d: { results: rows.filter((r) => filter.includes(`eq ${r.AssignedTo.results[0].Id}`)) } } };
    }
    return { data: { d: { results: [] } } };
  };
  const post = async (url, body) => {
    state.requests.push({ source: "dob", url: String(url), method: "MERGE", body });
    // Взятие в работу: статус + Editor (как это делает SharePoint).
    const itemId = Number(String(url).match(/items\((\d+)\)/)?.[1]);
    if (Number.isFinite(itemId) && body?.Status === "В работе") {
      state.dobTaken[itemId] = { Status: "В работе", PercentComplete: 0, Editor: { Id: 207, Title: "Поршаков Сергей" } };
    }
    return { data: { d: {} }, status: 204 };
  };
  return {
    DOB_SITE_RELATIVE: "/sites/dob/doblogistic",
    DOB_LIST_GUID: "21B5B544-BD98-4B06-891F-C5A137331394",
    dobApiBase,
    dobListApi: () => `${DOB_BASE}${DOB_LIST}`,
    getDobDigest: async () => "digest",
    dobAxios: { get, post, interceptors: { request: { use() {} }, response: { use() {} } } },
  };
});

// CKEditor в jsdom не поднимается: рич-текст в диалоге подменяем textarea
// с тем же контрактом value/onChange.
vi.mock("../../dob/components/RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const { default: TasksView } = await import("../../../TasksView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;
// Кэш TaskBehaviour модульный (30 мин) и переживает тесты внутри файла: без сброса
// тест с другим Behaviour получил бы запись, закэшированную предыдущими тестами.
const { clearTaskBehaviourCache } = await import("../../../services/taskBehaviour");
const { clearTaskContentTypeIdCache } = await import("../../../tasks/contentTypeFields");

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
globalThis.matchMedia = window.matchMedia;

const settle = async (ms = 600) => {
  for (let i = 0; i < Math.ceil(ms / 50); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
};

function renderTasksView(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={createTheme()}>
          <NotificationsProvider>
            <TasksView {...props} />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  });
  return host;
}

// Карточка задачи: наименьший MUI-Paper, в котором есть её заголовок.
function cardByText(host, re) {
  return [...host.querySelectorAll(".MuiPaper-root")]
    .filter((el) => re.test(el.textContent || ""))
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0] || null;
}
function cardButton(card, text) {
  return [...(card?.querySelectorAll("button") || [])].find((b) => b.textContent.trim() === text) || null;
}
function dialogEl() {
  return [...document.querySelectorAll('[role="dialog"], .MuiDialog-root')].pop() || null;
}
const mouseClick = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const wait200 = () => new Promise((r) => setTimeout(r, 200));

async function clickByText(host, re) {
  const el = [...host.querySelectorAll("button,[role=tab]")].find((b) => re.test(b.textContent || ""));
  if (!el) return false;
  await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  return true;
}

describe("TasksView — multi-source (#tasks)", () => {
  beforeEach(() => {
    state.requests = [];
    state.dobTaken = {};
    state.behaviourOverride = null;
    localStorage.clear();
    sessionStorage.clear();
    clearTaskBehaviourCache();
    clearTaskContentTypeIdCache();
  });

  it("карточный режим: заявка из dob-списка отрисована рядом с main-задачей", async () => {
    const host = renderTasksView();
    await settle(3000);

    const external = host.querySelectorAll('[data-testid="external-task-card"]');
    expect(external.length).toBeGreaterThanOrEqual(1);
    const dobCard = [...external].find((el) => /Заявка ООБ/.test(el.textContent || ""));
    expect(dobCard).toBeTruthy();
    // карточка выглядит как обычная задача: «Кому назначено» = AssignedTo,
    // «Исполнитель» пуст (никто не взял), есть кнопка «Взять в работу»
    expect(dobCard.textContent).toMatch(/Кому назначено: Поршаков Сергей/);
    expect(dobCard.textContent).toMatch(/Исполнитель: —/);
    expect(dobCard.textContent).toContain("#1");
    expect([...dobCard.querySelectorAll("button")].some((b) => /Взять в работу/.test(b.textContent || ""))).toBe(true);
    expect(dobCard.textContent).not.toContain("DOB Logistic");
    expect(dobCard.textContent).not.toMatch(/другого (сайта|источника)/i);
    // До взятия в работу формы задачи нет: единственная кнопка — «Взять в работу».
    expect([...dobCard.querySelectorAll("button")].some((b) => /Изменить/.test(b.textContent || ""))).toBe(false);

    // Взяли в работу → появилась «Изменить» (требование 2026-10-04)
    await act(async () => {
      [...dobCard.querySelectorAll("button")].find((b) => /Взять в работу/.test(b.textContent || ""))
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 400));
    });
    await settle(600);
    const dobCardAfter = [...host.querySelectorAll('[data-testid="external-task-card"]')]
      .find((el) => /Заявка ООБ/.test(el.textContent || ""));
    expect([...dobCardAfter.querySelectorAll("button")].some((b) => /Изменить/.test(b.textContent || ""))).toBe(true);
    expect([...dobCardAfter.querySelectorAll("button")].some((b) => /Взять в работу/.test(b.textContent || ""))).toBe(false);

    // main-задача тоже на месте
    expect(host.textContent).toContain("Основная задача ООБ");

    // dob-запрос ушёл на сайт ДОБ через /dob-api и покрывает пользователя И группу
    const dobItemReqs = state.requests.filter((r) => r.source === "dob" && r.url.includes("/items"));
    expect(dobItemReqs.length).toBeGreaterThanOrEqual(1);
    for (const req of dobItemReqs) {
      expect(req.url.startsWith(`${DOB_BASE}/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')`)).toBe(true);
    }
    // Первый запрос может уйти до того, как группа из DcEmail срезолвится на сайте ДОБ;
    // после резолва фильтр обязан содержать и пользователя, и Id группы.
    const fullFilter = dobItemReqs.map((r) => parseFilter(r.url)).find((f) => f.includes("AssignedToId eq 207") && f.includes("AssignedToId eq 33"));
    expect(fullFilter).toBeTruthy();
  }, 30000);

  it("табличный режим: строки обоих источников и никаких полей результата в запросе", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    expect(host.textContent).toMatch(/Таблица задач · \d+ шт\./);
    // строки обоих источников в таблице
    expect(host.textContent).toContain("Заявка ООБ");
    expect(host.textContent).toContain("Основная задача ООБ");
    // колонки: «Кому назначено» — заполнена, «Исполнитель» — заполнен
    expect(host.textContent).toContain("Кому назначено");
    expect(host.textContent).toContain("Исполнитель");
    expect(host.textContent).toMatch(/Поршаков Сергей/);
    // «Описание задачи» — сразу после «Заголовка», значение из Body dob-задачи
    expect(host.textContent).toContain("Описание задачи");
    expect(host.textContent.indexOf("Описание задачи")).toBeLessThan(host.textContent.indexOf("Статус"));
    expect(host.textContent).toContain("Просмотр видеоархива");

    // ── шапка закреплена + поиск/сортировка ────────────────────────────────
    // domLayout=normal → строки скроллятся внутри грида, шапка остаётся на месте
    expect(host.querySelector(".ag-layout-normal")).toBeTruthy();
    expect(host.querySelector(".ag-layout-auto-height")).toBeNull();
    // под заголовками НЕТ строк фильтров — поиск один, над таблицей
    expect(host.querySelectorAll(".ag-header .ag-floating-filter").length).toBe(0);
    const search = host.querySelector('[data-testid="tasks-grid-search"]');
    expect(search).toBeTruthy();
    expect(search.tagName).toBe("INPUT");

    const countRows = () => host.querySelectorAll(".ag-center-cols-container .ag-row").length;
    // 3 main-задачи (ООБ «не начата», ООБ «в работе», ТНУ «в работе», Результат проверки ООБ) + 2 dob
    expect(countRows()).toBe(7);

    // колонки шапки — для проверки сортировки по клику
    const headerCells = [...host.querySelectorAll(".ag-header .ag-header-cell")];
    const titleIdx = headerCells.findIndex((h) => /Заголовок/.test(h.textContent || ""));
    expect(titleIdx).toBeGreaterThanOrEqual(0);

    // ── сортировка по клику на заголовок ──────────────────────────────────
    // AG Grid позиционирует строки абсолютно, поэтому порядок в DOM не равен
    // визуальному: читаем строки центрального контейнера и сортируем по row-index.
    const readTitles = () => [...host.querySelectorAll('.ag-center-cols-container .ag-row')]
      .map((row) => ({
        index: Number(row.getAttribute("row-index")),
        title: (row.querySelector('.ag-cell[col-id="Title"]')?.textContent || "").trim(),
      }))
      .sort((a, b) => a.index - b.index)
      .map((r) => r.title);
    const titlesInitial = readTitles();
    expect(titlesInitial.length).toBe(7);

    // AG Grid вешает обработчик сортировки на .ag-header-cell-label внутри ячейки
    const titleLabel = headerCells[titleIdx].querySelector(".ag-header-cell-label");
    expect(titleLabel).toBeTruthy();
    const clickHeader = async () => {
      await act(async () => {
        titleLabel.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 400));
      });
      return readTitles();
    };

    // 1-й клик — по возрастанию, 2-й — по убыванию
    const asc = await clickHeader();
    expect(headerCells[titleIdx].getAttribute("aria-sort")).toBe("ascending");
    expect([...asc]).toEqual([...titlesInitial].sort());

    const desc = await clickHeader();
    expect(headerCells[titleIdx].getAttribute("aria-sort")).toBe("descending");
    expect([...desc]).toEqual([...titlesInitial].sort().reverse());
    expect(desc).not.toEqual(asc);

    // поиск над таблицей фильтрует по всем полям: «Основная» → только main-задача.
    // Ставим value через нативный setter, иначе React value-tracker не увидит изменение.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(search, "Основная");
      search.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
    });
    const rowsAfter = countRows();
    expect(rowsAfter).toBe(1);
    expect(host.textContent).toContain("Основная задача ООБ");
    // в таблице нет ни колонки источника, ни бейджей «другого источника»
    expect(host.textContent).not.toContain("DOB Logistic");
    expect(host.textContent).not.toMatch(/другого (сайта|источника)/i);

    // ни один мульти-источниковый запрос не просит поля результата
    for (const req of state.requests) {
      const select = parseSelect(req.url);
      if (req.source === "dob") {
        expect(select).not.toContain("ResultSearchTHU");
        expect(select).not.toContain("Location1");
      }
    }
    // колонок результата в таблице нет
    expect(host.textContent).not.toContain("ResultSearchTHU");
  }, 30000);

  it("«Взять в работу» на карточке dob шлёт MERGE статуса в список источника", async () => {
    const host = renderTasksView();
    await settle(3000);

    const dobCard = [...host.querySelectorAll('[data-testid="external-task-card"]')]
      .find((el) => /Заявка ООБ/.test(el.textContent || ""));
    expect(dobCard).toBeTruthy();
    const takeBtn = [...dobCard.querySelectorAll("button")].find((b) => /Взять в работу/.test(b.textContent || ""));
    expect(takeBtn).toBeTruthy();

    await act(async () => {
      takeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    });
    await settle(800);

    const merge = state.requests.find((r) => r.source === "dob" && r.method === "MERGE");
    expect(merge).toBeTruthy();
    expect(merge.url).toContain("lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')/items(1)");
    expect(merge.body).toEqual({ Status: "В работе" });
  }, 30000);

  it("#tasks/<Id задачи> открывает карточку задачи, а не ищет элемент ProblemsPallet", async () => {
    // Проверяем роут из таблицы: openTaskForm(main:10) → #tasks/10.
    const host = renderTasksView({ initialElementId: "10" });
    await settle(3000);

    // карточка задачи отрисована в hash-режиме
    expect(host.textContent).toContain("Основная задача ООБ");
    // и НЕТ сообщения про элемент ProblemsPallet
    expect(host.textContent).not.toMatch(/Связанная задача для элемента/);
    expect(host.textContent).not.toMatch(/Задача для элемента #10 не найдена/);
    // элемент ProblemsPallet по этому Id не запрашивался
    expect(state.requests.some((r) => /ProblemsPallet/i.test(r.url))).toBe(false);
  }, 30000);

  it("#tasks/13 (тип «Результат проверки ООБ») уводит на форму ДОБ, а не в стандартную карточку", async () => {
    // deep-link на задачу нового типа: карточку #tasks/<Id> показывать нельзя —
    // задача ведёт себя как dob-задача и открывается формой DobTaskEditView.
    window.location.hash = "#tasks/13";
    renderTasksView({ initialElementId: "13" });
    await settle(3500);
    expect(window.location.hash).toBe(`#dob_tasks/13?list=${MAIN_GUID}`);
  }, 40000);

  it("«Изменить» в таблице: строка без ContentTypeId — тип дочитывается, открывается форма ДОБ", async () => {
    window.location.hash = "#tasks";
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const row = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
      .find((r) => /Проверка ЕО без типа/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    const cell = row.querySelector(".ag-cell");
    await act(async () => {
      cell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 120, clientY: 140 }));
      await new Promise((r) => setTimeout(r, 250));
    });

    const popup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')]
      .filter((el) => el.style.opacity !== "0").pop() || null;
    const edit = [...(popup?.querySelectorAll("button") || [])]
      .find((b) => /^Изменить$/.test((b.textContent || "").trim()));
    expect(edit).toBeTruthy();
    await act(async () => {
      edit.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 300));
    });
    await settle(600);

    // тип контента дочитан у элемента (items(14)) и увёл на форму ДОБ
    expect(state.requests.some((r) => /items\(14\)/.test(r.url))).toBe(true);
    expect(window.location.hash).toBe(`#dob_tasks/14?list=${MAIN_GUID}`);
  }, 40000);

  it("действия по задаче открываются В ТОЧКЕ КЛИКА по строке (popup, а не колонка)", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    // MUI держит закрывающийся popup в DOM (jsdom не эмитит transitionend),
    // поэтому берём последний и считаем закрытым по opacity: 0.
    const popup = () => {
      const el = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop() || null;
      return el && el.style.opacity === "0" ? null : el;
    };
    // Кнопка «Кому назначено» (AssignedToButtons) — не действие по задаче.
    const popupButtons = () => [...(popup()?.querySelectorAll("button") || [])]
      .filter((b) => b.getAttribute("data-testid") !== "assigned-to-button");
    const findButton = (re) => popupButtons().find((b) => re.test(b.textContent || ""));
    const centerRows = () => [...host.querySelectorAll(".ag-center-cols-container .ag-row")];
    const rowByText = (re) => centerRows().find((r) => re.test(r.textContent || ""));
    const clickCell = async (row, x, y) => {
      const cell = row?.querySelector(".ag-cell");
      expect(cell).toBeTruthy();
      await act(async () => {
        cell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        await new Promise((r) => setTimeout(r, 250));
      });
    };

    // пока не кликнуто — попапа нет и колонки действий в таблице тоже нет
    expect(popup()).toBeNull();
    expect(host.querySelectorAll('[col-id="rowActions"]').length).toBe(0);
    expect(host.textContent).toContain("в точке клика");

    // одиночный клик по строке dob-задачи = только выделение (без перехода)
    const hashBefore = window.location.hash;
    const dobRow = rowByText(/Заявка ООБ/);
    expect(dobRow).toBeTruthy();
    await clickCell(dobRow, 240, 360);
    expect(window.location.hash).toBe(hashBefore);

    // popup открылся именно в точке клика: координаты клика ушли в позиционирование
    const paper = popup();
    expect(paper).toBeTruthy();
    const styleText = paper.getAttribute("style") || "";
    expect(styleText).toContain("240px");
    expect(styleText).toContain("360px");
    // В нём — действия карточки этой задачи. Задача ещё «Не начата»: формы у неё
    // нет, единственное действие — «Взять в работу» (правило 2026-10-04).
    expect(popupButtons().length).toBe(1);
    expect(findButton(/Взять в работу/)).toBeTruthy();
    expect(findButton(/Изменить/)).toBeFalsy();

    // «Взять в работу» из попапа шлёт MERGE статуса в список источника
    await act(async () => {
      findButton(/Взять в работу/).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
    const merge = state.requests.find((r) => r.source === "dob" && r.method === "MERGE");
    expect(merge).toBeTruthy();
    expect(merge.body).toMatchObject({ Status: "В работе" });
    // после действия попап закрылся
    expect(popup()).toBeNull();

    // Список перечитан: задача уже «В работе» (взята) → в попапе появилась «Изменить»
    await settle(800);
    await clickCell(rowByText(/Заявка ООБ/), 300, 400);
    expect(findButton(/Взять в работу/)).toBeFalsy();
    expect(findButton(/Изменить/)).toBeTruthy();

    // «Изменить» открывает форму задачи источника (её же роут из карточки)
    const hashBeforeEdit = window.location.hash;
    await act(async () => {
      findButton(/Изменить/).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(window.location.hash).not.toBe(hashBeforeEdit);
    expect(window.location.hash.toLowerCase()).toBe("#dob_tasks/1?list=03fc1b92-baff-44dc-b8a3-d04acbe329d3");
  }, 30000);

  it("в попапе на main-строке есть «Взять в работу», и она шлёт MERGE в основной список", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const mainRow = [...host.querySelectorAll('.ag-center-cols-container .ag-row')]
      .find((r) => /Основная задача ООБ/.test(r.textContent || ""));
    expect(mainRow).toBeTruthy();
    const cell = mainRow.querySelector(".ag-cell");
    await act(async () => {
      cell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 180, clientY: 220 }));
      await new Promise((r) => setTimeout(r, 250));
    });

    const buttons = () => {
      const el = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop() || null;
      // Кнопка «Кому назначено» (AssignedToButtons) — не действие строки.
      const list = el && el.style.opacity !== "0" ? [...el.querySelectorAll("button")] : [];
      return list.filter((b) => b.getAttribute("data-testid") !== "assigned-to-button");
    };
    const texts = buttons().map((b) => b.textContent || "");
    // «Не начата» → задача ещё не взята в работу: только «Взять в работу»
    expect(texts.some((t) => /Взять в работу/.test(t))).toBe(true);
    expect(texts.some((t) => /Изменить/.test(t))).toBe(false);

    const takeBtn = buttons().find((b) => /Взять в работу/.test(b.textContent || ""));
    await act(async () => {
      takeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 250));
    });
    await settle(500);

    // MERGE статуса ушёл в ОСНОВНОЙ список (main), а не в dob
    const merge = state.requests.find((r) => r.source === "main" && r.merge);
    expect(merge).toBeTruthy();
    expect(merge.url).toContain("items(10)");
    expect(String(merge.body?.Status || "").length).toBeGreaterThan(0);
    expect(state.requests.some((r) => r.source === "dob" && r.method === "MERGE")).toBe(false);
  }, 30000);

  it("«Изменить» в попапе main-строки открывает форму задачи (#tasks/<Id>)", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    // задача «в работе» (уже взята) — только у неё доступна «Изменить»
    const row = [...host.querySelectorAll('.ag-center-cols-container .ag-row')]
      .find((r) => /Задача в работе ООБ/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.querySelector(".ag-cell").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 })
      );
      await new Promise((r) => setTimeout(r, 250));
    });

    const popup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop();
    const edit = [...(popup?.querySelectorAll("button") || [])].find((b) => /Изменить/.test(b.textContent || ""));
    expect(edit).toBeTruthy();
    await act(async () => {
      edit.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 250));
    });
    // main-задача открывается своей формой (Id), а не формой dob-списка
    expect(window.location.hash).toBe("#tasks/11");

    // а у НЕ взятой в работу main-задачи «Изменить» нет — только «Взять в работу»
    const idleRow = [...host.querySelectorAll('.ag-center-cols-container .ag-row')]
      .find((r) => /Основная задача ООБ/.test(r.textContent || ""));
    await act(async () => {
      idleRow.querySelector(".ag-cell").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 260, clientY: 300 })
      );
      await new Promise((r) => setTimeout(r, 250));
    });
    const idlePopup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop();
    const idleLabels = [...idlePopup.querySelectorAll("button")]
      .filter((b) => b.getAttribute("data-testid") !== "assigned-to-button")
      .map((b) => b.textContent.trim());
    expect(idleLabels).toEqual(["Взять в работу"]);
  }, 30000);

  it("таблица: результат с полем и подтверждением (p + c) — форма В ПОПОВЕРЕ, затем диалог подтверждения", async () => {
    // Как в карточке: клик по результату открывает форму (поле из Behaviour.p) прямо в месте,
    // «Сохранить» → диалог подтверждения (Behaviour.c) → и только потом запись результата.
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const row = [...host.querySelectorAll('.ag-center-cols-container .ag-row')]
      .find((r) => /Задача в работе ООБ/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.querySelector(".ag-cell").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 })
      );
      await new Promise((r) => setTimeout(r, 250));
    });

    const popup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')]
      .filter((el) => el.style.opacity !== "0" && /#11\b/.test(el.textContent || "")).pop();
    expect(popup).toBeTruthy();
    const notFixed = [...popup.querySelectorAll("button")].find((b) => /Не исправлено/.test(b.textContent || ""));
    expect(notFixed).toBeTruthy();

    await act(async () => { mouseClick(notFixed); await wait200(); });

    // никакого «слепого» завершения: открылась форма с полем из Behaviour.p
    expect(state.requests.some((r) => r.source === "main" && r.body && r.body.ResultOOB === "Не исправлено")).toBe(false);
    const editor = document.body.querySelector('[data-testid="tasks-row-result-editor"]');
    expect(editor).toBeTruthy();
    expect(editor.textContent).toContain("Где найдено");
    const area = editor.querySelector("textarea, input");
    expect(area).toBeTruthy();
    await act(async () => {
      const proto = area.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(area, "Зона отгрузки, ряд 5");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await wait200();
    });

    const save = [...editor.querySelectorAll("button")].find((b) => /Сохранить/.test(b.textContent || ""));
    await act(async () => { mouseClick(save); await wait200(); });

    // форма ушла, но запись ещё не сделана: сначала подтверждение (c: true)
    expect(state.requests.some((r) => r.source === "main" && r.body && r.body.ResultOOB === "Не исправлено")).toBe(false);
    const confirmDialog = [...document.querySelectorAll('.MuiDialog-root, [role="dialog"]')]
      .filter((d) => /Вы уверены/.test(d.textContent || "")).pop();
    expect(confirmDialog).toBeTruthy();
    const confirmBtn = [...confirmDialog.querySelectorAll("button")]
      .find((b) => /Подтвердить/.test(b.textContent || ""));
    await act(async () => { mouseClick(confirmBtn); await wait200(); });
    await settle(900);

    // MERGE: результат + значение поля, собранное формой
    const write = state.requests
      .filter((r) => r.source === "main" && r.merge && r.body && r.body.ResultOOB === "Не исправлено")
      .pop();
    expect(write).toBeTruthy();
    expect(write.url).toContain("items(11)");
    expect(String(write.body.Location1 || "")).toContain("Зона отгрузки");
  }, 40000);

  it("для main-задачи «в работе» попап даёт кнопки результатов — как карточка", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const row = [...host.querySelectorAll('.ag-center-cols-container .ag-row')]
      .find((r) => /Задача в работе ООБ/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.querySelector(".ag-cell").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 })
      );
      await new Promise((r) => setTimeout(r, 250));
    });

    const buttons = () => {
      const el = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop() || null;
      // Кнопка «Кому назначено» (AssignedToButtons) — не действие строки.
      const list = el && el.style.opacity !== "0" ? [...el.querySelectorAll("button")] : [];
      return list.filter((b) => b.getAttribute("data-testid") !== "assigned-to-button");
    };
    const findButton = (re) => buttons().find((b) => re.test(b.textContent || ""));
    // Кнопки — из поля результата ЭТОГО типа контента (ООБ), а не из общего списка
    // ТНУ-поля: ровно как в карточке по Behaviour/CT.
    expect(buttons().map((b) => b.textContent)).toEqual(["Исправлено", "Не исправлено", "Изменить"]);
    expect(findButton(/Найдена/)).toBeFalsy();
    // задача уже в работе — «Взять в работу» не предлагается
    expect(findButton(/Взять в работу/)).toBeFalsy();

    // результат из попапа уходит в основной список в поле результата этого CT
    await act(async () => {
      findButton(/Исправлено/).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 300));
    });
    await settle(800);
    const write = state.requests.find((r) => r.source === "main" && r.body && r.body.ResultOOB === "Исправлено");
    expect(write).toBeTruthy();
    expect(write.url).toContain("items(11)");
  }, 30000);

  it("Behaviour «Результат поиска ЕО»: «Найдена» → диалог «Где найдена ЕО?» с доп. действиями, запись — после «Отправить»", async () => {
    const host = renderTasksView();
    await settle(3000);

    const card = cardByText(host, /Поиск ЕО \(ТНУ\)/);
    expect(card).toBeTruthy();
    const found = cardButton(card, "Найдена");
    expect(found).toBeTruthy();

    await act(async () => { mouseClick(found); await wait200(); });
    // Behaviour.anim = celebrate: диалог открывается после анимации (1.6 с)
    await settle(2200);

    const dialog = dialogEl();
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Где найдена ЕО?");
    expect(dialog.textContent).toContain("Местоположение (Location1)");
    // aa: true → в диалоге есть блок доп. действий; aar: false → он необязательный
    expect(dialog.textContent).toMatch(/Дополнительные действия/);
    expect(dialog.textContent).toMatch(/необязательно/i);
    // до «Отправить» задача НЕ завершается
    expect(state.requests.some((r) => r.source === "main" && r.body && r.body.ResultSearchTHU === "Найдена")).toBe(false);

    const area = dialog.querySelector("textarea");
    expect(area).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(area, "Зона отгрузки, ряд 5");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await wait200();
    });
    const send = [...dialog.querySelectorAll("button")].find((b) => /Отправить/.test(b.textContent || ""));
    expect(send).toBeTruthy();
    await act(async () => { mouseClick(send); await wait200(); });
    await settle(900);

    const write = state.requests.find((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU === "Найдена");
    expect(write).toBeTruthy();
    expect(write.url).toContain("items(12)");
    expect(String(write.body.Location1 || "")).toContain("Зона отгрузки");
    // aa: true → поле обязательности уходит. В этом списке колонка Boolean, а метаданные
    // приходят как «Text», поэтому первая попытка со строкой падает (400 Edm.Boolean),
    // а авто-повтор отправляет boolean — успешная запись последняя.
    const attempts = state.requests.filter((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU === "Найдена");
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(typeof attempts[attempts.length - 1].body.AdditionalsActionsRequired).toBe("boolean");
    void write;
  }, 40000);

  it("Behaviour «Не найдена» (ic): подтверждение двумя кнопками В КАРТОЧКЕ, без диалога и записи до подтверждения", async () => {
    const host = renderTasksView();
    await settle(3000);

    const labelsOf = () => [...(cardByText(host, /Поиск ЕО \(ТНУ\)/)?.querySelectorAll("button") || [])]
      .map((b) => b.textContent.trim()).filter(Boolean);

    const dialogsBefore = document.querySelectorAll('[role="dialog"], .MuiDialog-root').length;
    await act(async () => { mouseClick(cardButton(cardByText(host, /Поиск ЕО \(ТНУ\)/), "Не найдена")); await wait200(); });
    expect(labelsOf()).toContain("Подтвердить «Не найдена»");
    expect(labelsOf()).toContain("Отмена");
    // ic — это UI карточки: НИКАКИХ новых диалогов и никакой записи до подтверждения
    expect(document.querySelectorAll('[role="dialog"], .MuiDialog-root').length).toBe(dialogsBefore);
    expect(state.requests.some((r) => r.source === "main" && r.body && r.body.ResultSearchTHU)).toBe(false);

    // «Отмена» возвращает кнопки результата
    await act(async () => { mouseClick(cardButton(cardByText(host, /Поиск ЕО \(ТНУ\)/), "Отмена")); await wait200(); });
    expect(labelsOf()).toEqual(expect.arrayContaining(["Найдена", "Не найдена"]));

    // подтверждение → анимация sherlock (тексты из Behaviour.anim) → MERGE
    await act(async () => { mouseClick(cardButton(cardByText(host, /Поиск ЕО \(ТНУ\)/), "Не найдена")); await wait200(); });
    await act(async () => { mouseClick(cardButton(cardByText(host, /Поиск ЕО \(ТНУ\)/), "Подтвердить «Не найдена»")); await wait200(); });
    expect(host.textContent + document.body.textContent).toMatch(/Создаю заявку на ООБ|Отправляю запрос/);
    await settle(2000);

    const write = state.requests.find((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU === "Не найдена");
    expect(write).toBeTruthy();
    expect(write.url).toContain("items(12)");
  }, 40000);

  it("«Результат проверки ООБ»: карточка как у dob (взять/изменить), «Изменить» ведёт в форму ДОБ", async () => {
    const host = renderTasksView();
    await settle(3000);

    // задача нового типа рисуется read-only карточкой ДОБ — БЕЗ кнопок результата
    const card = [...host.querySelectorAll('[data-testid="external-task-card"]')]
      .find((el) => /Проверка ЕО \(ООБ\)/.test(el.textContent || ""));
    expect(card).toBeTruthy();
    expect([...card.querySelectorAll("button")].some((b) => b.textContent.trim() === "Годен")).toBe(false);

    const edit = [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Изменить");
    expect(edit).toBeTruthy();
    window.location.hash = "#tasks";
    await act(async () => { mouseClick(edit); await wait200(); });
    await settle(300);

    // ⭐ как задачи сайта dob: открывается форма ДОБ, но с основным списком
    expect(window.location.hash).toBe(`#dob_tasks/13?list=${MAIN_GUID}`);
    // «молча» ничего не пишем — результат соберёт форма закрытия
    expect(state.requests.some((r) => r.source === "main" && r.merge)).toBe(false);
  }, 40000);

  it("«Результат проверки ООБ» в таблице: попап как у dob — без кнопок результата, «Изменить» в форму ДОБ", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const row = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
      .find((r) => /Проверка ЕО \(ООБ\)/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.querySelector(".ag-cell").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 })
      );
      await new Promise((r) => setTimeout(r, 250));
    });

    const popup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')]
      .filter((el) => el.style.opacity !== "0" && /#13\b/.test(el.textContent || "")).pop();
    expect(popup).toBeTruthy();
    const labels = [...popup.querySelectorAll("button")].map((b) => b.textContent.trim());
    // как у dob: только действия, кнопок результата нет (их собирает форма ДОБ)
    expect(labels).toContain("Изменить");
    expect(labels).not.toContain("Годен");

    const edit = [...popup.querySelectorAll("button")].find((b) => b.textContent.trim() === "Изменить");
    await act(async () => { mouseClick(edit); await wait200(); });
    await settle(300);
    expect(window.location.hash).toBe(`#dob_tasks/13?list=${MAIN_GUID}`);
    expect(state.requests.some((r) => r.source === "main" && r.merge)).toBe(false);
  }, 40000);

  it("таблица + конфиг инлайном (p:[Location1], без aa): форма в поповере, как в карточке, без диалогов", async () => {
    // 1:1 настройка пользователя: у «Найдена» нет loc — только prompt-поле Location1
    // и подпись кнопки. Поведение обязано совпадать с карточкой: форма в месте, без диалога.
    state.behaviourOverride = JSON.stringify({
      _default: { rf: [{ f: "THU", ti: "ЕО" }, { f: "Recipient/SCNumberText", ti: "Получатель" }] },
      "Найдена": {
        ic: true,
        ok: "Сохранить",
        no: "Отмена",
        p: [{ f: "Location1", ti: "Местоположение", t: "multiline" }],
        anim: "none",
      },
      "Не найдена": { ic: true, ok: "Подтвердить «Не найдена»", no: "Отмена", anim: "none" },
    });

    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const row = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
      .find((r) => /Поиск ЕО/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.querySelector(".ag-cell").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 220, clientY: 300 })
      );
      await new Promise((r) => setTimeout(r, 250));
    });

    const popup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')]
      .filter((el) => el.style.opacity !== "0" && /#12\b/.test(el.textContent || "")).pop();
    expect(popup).toBeTruthy();
    const found = [...popup.querySelectorAll("button")].find((b) => b.textContent.trim() === "Найдена");
    expect(found).toBeTruthy();

    // jsdom не размонтирует модалки прошлых тестов — считаем только НОВЫЕ диалоги
    const dialogsBefore = new Set(document.querySelectorAll('.MuiDialog-root, [role="dialog"]'));
    await act(async () => { mouseClick(found); await wait200(); });

    // Никакой записи и НИКАКОГО диалога местоположения — форма прямо в поповере
    expect(state.requests.some((r) => r.source === "main" && r.body && r.body.ResultSearchTHU === "Найдена")).toBe(false);
    const newDialogs = [...document.querySelectorAll('.MuiDialog-root, [role="dialog"]')].filter((d) => !dialogsBefore.has(d));
    expect(newDialogs).toHaveLength(0);
    const editor = document.body.querySelector('[data-testid="tasks-row-result-editor"]');
    expect(editor).toBeTruthy();
    expect(editor.textContent).toContain("Местоположение");
    // aa у результата нет → блока доп. действий нет
    expect(editor.textContent).not.toMatch(/Дополнительные действия/);

    const area = editor.querySelector("textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(area, "Зона отгрузки, стеллаж 3");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await wait200();
    });
    const save = [...editor.querySelectorAll("button")].find((b) => /Сохранить/.test(b.textContent || ""));
    expect(save).toBeTruthy();
    await act(async () => { mouseClick(save); await wait200(); });
    await settle(900);

    // MERGE: результат + Location1, без legacy-полей доп. действий (aa нет)
    const attempted = state.requests.filter((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU === "Найдена");
    expect(attempted).toHaveLength(1);
    const last = attempted[0];
    expect(last.body.Location1).toContain("Зона отгрузки");
    expect("AdditionalsActionsRequired" in last.body).toBe(false);
    expect("AdditionalActions" in last.body).toBe(false);
  }, 40000);

  it("таблица: «Найдена» в попапе открывает тот же диалог местоположения, что и карточка", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    const row = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
      .find((r) => /Поиск ЕО/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.querySelector(".ag-cell").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 }));
      await wait200();
    });

    const popup = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')]
      .filter((el) => el.style.opacity !== "0" && /#12\b/.test(el.textContent || "")).pop();
    const found = [...(popup?.querySelectorAll("button") || [])].find((b) => b.textContent.trim() === "Найдена");
    expect(found).toBeTruthy();
    // jsdom не размонтирует закрытые модалки: смотрим диалоги, появившиеся после клика
    const dialogsBefore = new Set(document.querySelectorAll('.MuiDialog-root, [role="dialog"]'));
    await act(async () => { mouseClick(found); await wait200(); });
    await settle(2200);

    const dialog = [...document.querySelectorAll('.MuiDialog-root, [role="dialog"]')]
      .filter((d) => !dialogsBefore.has(d) && /Где найдена ЕО\?/.test(d.textContent || "")).pop();
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Где найдена ЕО?");
    expect(dialog.textContent).toContain("Местоположение (Location1)");
    expect(dialog.textContent).toMatch(/Дополнительные действия/);
  }, 40000);

  it("карточка: конфиг ic + p (Location1) + anim — форма В КАРТОЧКЕ, запись только после «Сохранить», без AA-полей", async () => {
    // Точный конфиг пользователя. Раньше при таком наборе клик по «Найдена» завершал
    // задачу сразу (кнопка попадала в «дополнительные» значения и уходила в TasksView).
    state.behaviourOverride = JSON.stringify({
      _default: { rf: [{ f: "THU", ti: "ЕО" }, { f: "Recipient/SCNumberText", ti: "Получатель" }] },
      "Найдена": {
        ic: true,
        ok: "Сохранить",
        no: "Отмена",
        p: [{ f: "Location1", ti: "Местоположение", t: "multiline" }],
        anim: { type: "celebrate", title: "Паллет найден", text: "Отличная работа!", emoji: "\uD83C\uDF89" },
      },
      "Не найдена": {
        ic: true,
        ok: "Подтвердить «Не найдена»",
        no: "Отмена",
        anim: { type: "sherlock", title: "Создаю заявку на ООБ", text: "Отправляю запрос в ООБ...", emoji: "\uD83D\uDD75" },
      },
    });

    const host = renderTasksView();
    await settle(3000);

    const card = cardByText(host, /Поиск ЕО \(ТНУ\)/);
    expect(card).toBeTruthy();
    expect([...card.querySelectorAll("button")]
      .filter((b) => b.getAttribute("data-testid") !== "assigned-to-button")
      .map((b) => b.textContent.trim()).filter(Boolean).sort())
      .toEqual(["Найдена", "Не найдена"]);

    const dialogsBefore = new Set(document.querySelectorAll('.MuiDialog-root, [role="dialog"]'));
    await act(async () => { mouseClick(cardButton(card, "Найдена")); await wait200(); });
    await settle(300);

    // ни записи, ни диалогов — форма с полем прямо в карточке
    expect(state.requests.some((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU)).toBe(false);
    expect([...document.querySelectorAll('.MuiDialog-root, [role="dialog"]')].filter((d) => !dialogsBefore.has(d))).toHaveLength(0);
    const cardWithForm = cardByText(host, /Поиск ЕО \(ТНУ\)/);
    const area = [...cardWithForm.querySelectorAll("textarea")]
      .find((el) => /Местоположение/.test(el.getAttribute("placeholder") || ""));
    expect(area).toBeTruthy();
    const formButtons = [...cardWithForm.querySelectorAll("button")].map((b) => b.textContent.trim());
    // подпись кнопки отправки — из Behaviour.ok (как в карточке при ic)
    expect(formButtons).toContain("Сохранить");
    expect(formButtons).toContain("Отмена");

    // заполняем и сохраняем
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(area, "Зона отгрузки, ряд 5");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await wait200();
    });
    await act(async () => {
      const save = [...cardWithForm.querySelectorAll("button")].find((b) => /Сохранить/.test(b.textContent || ""));
      mouseClick(save);
      await wait200();
    });
    await settle(1500);

    const write = state.requests.filter((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU === "Найдена").pop();
    expect(write).toBeTruthy();
    expect(String(write.body.Location1 || "")).toContain("Зона отгрузки");
    expect(write.body.Status).toBe("Завершена");
    // aa в правиле нет → legacy-поля доп. действий не отправляются (их может не быть в типе контента)
    expect("AdditionalsActionsRequired" in write.body).toBe(false);
    expect("AdditionalActions" in write.body).toBe(false);
  }, 40000);

  it("карточка: порядок значений поля не решает, будет ли форма (обратный порядок choices)", async () => {
    // «Не найдена» стоит в поле ПЕРВОЙ: раньше она занимала «главную» кнопку, а «Найдена»
    // уходила в дополнительные значения и завершала задачу без формы.
    state.thuChoices = ["Не найдена", "Найдена"];
    state.behaviourOverride = JSON.stringify({
      _default: { rf: [{ f: "THU", ti: "ЕО" }] },
      "Найдена": { p: [{ f: "Location1", ti: "Местоположение", t: "multiline" }], anim: "none" },
      "Не найдена": { anim: "none" },
    });

    const host = renderTasksView();
    await settle(3000);

    const card = cardByText(host, /Поиск ЕО \(ТНУ\)/);
    expect(card).toBeTruthy();
    await act(async () => { mouseClick(cardButton(card, "Найдена")); await wait200(); });
    await settle(300);

    // результат с полем не завершается «молча» и не уходит в диалог: форма — в карточке
    expect(state.requests.some((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU)).toBe(false);
    const cardWithForm = cardByText(host, /Поиск ЕО \(ТНУ\)/);
    expect([...cardWithForm.querySelectorAll("textarea")]
      .some((el) => /Местоположение/.test(el.getAttribute("placeholder") || ""))).toBe(true);
    // подпись — «Сохранить — <результат>» (у правила нет ic, значит нет и ok/no)
    expect([...cardWithForm.querySelectorAll("button")].map((b) => b.textContent.trim()).some((t) => /^Сохранить/.test(t))).toBe(true);
  }, 40000);

});
