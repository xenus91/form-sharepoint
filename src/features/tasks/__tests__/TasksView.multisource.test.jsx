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

const MAIN_FIELDS = ["Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified", "PercentComplete", "DueDate", "Editor", "ContentTypeId", "RelatedItems", "ResultSearchTHU", "Location1", "OffDepKey"];
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

// Завершённая задача основного списка — для вкладки «Завершенные» (по ней
// проверяем «Просмотр»: форма должна открываться, а не «ничего не происходить»).
const MAIN_DONE_TASK = {
  Id: 881,
  Title: "Завершённая задача ООБ",
  Body: "Установить местоположение ЕО&amp;#58; 808003003003003003 для получателя 109",
  Status: "Завершена",
  PercentComplete: 1,
  Created: "2026-10-01T08:00:00Z",
  Modified: "2026-10-03T10:30:00Z",
  DueDate: "2026-10-02T10:00:00Z",
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E",
  AssignedTo: { Id: 207, Title: "Поршаков Сергей" },
  Editor: { Id: 207, Title: "Поршаков Сергей" },
  ResultSearchTHU: "Найдена",
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
    // Вложения СВЯЗАННОГО элемента (скрепка на карточке): один батч на страницу.
    if (d.includes("getbytitle('ProblemsPallet')/items?") && d.includes("$expand=AttachmentFiles")) {
      const files = state.relatedAttachments || {};
      const fm = d.match(/\$filter=([^&]*)/);
      const ids = fm ? [...fm[1].matchAll(/Id eq (\d+)/g)].map((x) => Number(x[1])) : [];
      const results = ids.map((id) => ({
        Id: id,
        AttachmentFiles: { results: (files[id] || []).map((FileName) => ({ FileName })) },
      }));
      return { data: { d: { results } } };
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
    // Завершённые грузятся отдельным запросом (REST: $orderby=Modified desc) —
    // без этой ветки вкладка «Завершенные» всегда пуста.
    if (d.includes(`${MAIN_LIST}/items`) && d.includes("$orderby=Modified desc")) {
      return { data: { d: { results: [MAIN_DONE_TASK] } } };
    }
    if (d.includes(`${MAIN_LIST}/items`)) return { data: { d: { results: [MAIN_TASK, MAIN_IN_PROGRESS, MAIN_THU_IN_PROGRESS, MAIN_CHECK_IN_PROGRESS, MAIN_CHECK_NO_CT, ...(state.extraMainTasks || [])] } } };
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

// CKEditor в jsdom не поднимается: рич-текст в диалоге подменяем textarea
// с тем же контрактом value/onChange.
vi.mock("../components/RichEditor", () => ({
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
  // Корень — на хосте: тест, который открывает попап, может размонтировать дерево
  // и убрать портал MUI из document.body (иначе следующий тест видит чужой попап).
  host.__root = root;
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


describe("TasksView — multi-source (#tasks)", () => {
  beforeEach(() => {
    state.requests = [];
    state.extraMainTasks = [];
    state.relatedAttachments = {};
    state.dobTaken = {};
    state.behaviourOverride = null;
    localStorage.clear();
    sessionStorage.clear();
    clearTaskBehaviourCache();
    clearTaskContentTypeIdCache();
  });




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

  // Задача со связанным элементом ProblemsPallet — по ней считается вложения.
  const relatedTask = () => ({
    ...MAIN_TASK,
    Id: 99,
    Title: "Задача со связанным элементом",
    RelatedItems: JSON.stringify([{ ListId: "{21b5b544-bd98-4b06-891f-c5a137331394}", ItemId: 25413 }]),
  });
  const attachmentBatch = () =>
    state.requests.filter(
      (r) => /getbytitle\('ProblemsPallet'\)\/items/.test(r.url) && /Id eq /.test(r.url),
    );

  it("#tasks/<Id>: нет батча вложений по всему списку задач", async () => {
    // Регрессия: в hash-режиме список карточек не рендерится, но счётчики
    // вложений считались для ВСЕХ задач — уходил запрос с
    // $filter=Id eq 25413 or Id eq 25414 or … (выглядело как перебор соседних
    // элементов ProblemsPallet).
    state.extraMainTasks = [relatedTask()];
    renderTasksView({ initialElementId: "10" });
    await settle(3000);
    expect(attachmentBatch().map((r) => r.url)).toEqual([]);
  }, 30000);

  it("в режиме списка батч вложений по-прежнему уходит — скрепка работает", async () => {
    // Контроль к предыдущему на тех же данных: отличается только режим.
    state.extraMainTasks = [relatedTask()];
    renderTasksView();
    await settle(3000);
    const batch = attachmentBatch();
    expect(batch.length).toBeGreaterThan(0);
    expect(batch[0].url).toContain("Id eq 25413");
  }, 30000);

  it("#tasks/13 (тип «Результат проверки ООБ») открывает стандартную карточку #tasks/<Id>", async () => {
    // deep-link на задачу нового типа: карточку #tasks/<Id> показывать нельзя —
    // задача ведёт себя как dob-задача и открывается формой DobTaskEditView.
    window.location.hash = "#tasks/13";
    renderTasksView({ initialElementId: "13" });
    await settle(3500);
    expect(window.location.hash).toBe("#tasks/13");
  }, 40000);







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
    // Поля AdditionalsActionsRequired/AdditionalActions удалены из списка —
    // в записи их быть не должно, и повторных попыток тоже.
    const attempts = state.requests.filter((r) => r.source === "main" && r.merge && r.body && r.body.ResultSearchTHU === "Найдена");
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect("AdditionalsActionsRequired" in attempts[attempts.length - 1].body).toBe(false);
    expect("AdditionalActions" in attempts[attempts.length - 1].body).toBe(false);
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

  it("«Результат проверки ООБ»: карточка с «взять/изменить», «Изменить» открывает карточку задачи", async () => {
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
    expect(window.location.hash).toBe("#tasks/13");
    // «молча» ничего не пишем — результат соберёт форма закрытия
    expect(state.requests.some((r) => r.source === "main" && r.merge)).toBe(false);
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
      .filter((b) => !b.closest("[data-principal-button]"))
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


  it("тумблер «Я исполнитель»: оставляет только задачи, которые я взял в работу", async () => {
    // Чужая задача «в работе»: Editor — не я, поэтому под тумблер не попадает.
    state.extraMainTasks = [{
      ...MAIN_TASK,
      Id: 21,
      Title: "Чужая задача в работе",
      Status: "В работе",
      PercentComplete: 0,
      AssignedTo: { results: [{ Id: 5, Title: "Иванов Иван Иванович" }] },
      Editor: { Id: 5, Title: "Иванов Иван Иванович" },
    }];

    const host = renderTasksView();
    await settle(2500);

    const toggle = host.querySelector('[data-testid="my-tasks-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    // Кнопка стоит НА ОДНОЙ СТРОКЕ с переключателем группировки.
    // Проверяем строго: родитель обёртки кнопки — строка ровно из двух детей
    // (переключатель группировки + обёртка кнопки). Если бы кнопка была на
    // отдельной строке, её родителем оказалась бы внешняя колонка шапки, в
    // которой три ребёнка (вкладки, группировка, кнопка).
    const sharedRow = toggle.parentElement.parentElement;
    expect(sharedRow.children.length).toBe(2);
    expect([...sharedRow.children].some((c) => (c.textContent || "").includes("Группировка по ТК"))).toBe(true);
    expect([...sharedRow.children].some((c) => c.contains(toggle))).toBe(true);

    // По РАЗНЫЕ стороны строки: группировка — первый (левый) ребёнок, кнопка —
    // последний (правый), а строка расталкивает их space-between.
    const kids = [...sharedRow.children];
    expect(kids[0].textContent).toContain("Группировка по ТК");
    expect(kids[kids.length - 1].contains(toggle)).toBe(true);
    expect(window.getComputedStyle(sharedRow).justifyContent).toBe("space-between");

    // Пока тумблер выключен — видны и моя, и чужая задача.
    expect(host.textContent).toContain("Чужая задача в работе");
    expect(host.textContent).toContain("Задача в работе ООБ");

    // Включаем.
    await act(async () => { mouseClick(toggle); await wait200(); });
    await settle(500);
    expect(host.querySelector('[data-testid="my-tasks-toggle"]').getAttribute("aria-pressed")).toBe("true");
    // нажатое состояние — заливка (contained)
    expect(host.querySelector('[data-testid="my-tasks-toggle"]').className).toContain("MuiButton-contained");

    // Чужая исчезла, моя осталась.
    expect(host.textContent).not.toContain("Чужая задача в работе");
    expect(host.textContent).toContain("Задача в работе ООБ");

    // Выключаем — чужая вернулась.
    await act(async () => { mouseClick(host.querySelector('[data-testid="my-tasks-toggle"]')); await wait200(); });
    await settle(500);
    expect(host.textContent).toContain("Чужая задача в работе");
  }, 40000);

  it("скрепка на карточке: у связанного элемента есть вложения — кнопка со счётчиком и ?ID=", async () => {
    // Задача СО связанным элементом (ProblemsPallet, Id 25202), у которого 2 вложения.
    state.extraMainTasks = [{
      ...MAIN_TASK,
      Id: 30,
      Title: "Задача со связанным элементом",
      RelatedItems: JSON.stringify([{ ListId: "{21b5b544-bd98-4b06-891f-c5a137331394}", ItemId: 25202 }]),
    }];
    state.relatedAttachments = { 25202: ["photo.jpg", "act.pdf"] };

    const host = renderTasksView();
    await settle(2500);

    // вложения связанного элемента грузятся одним батчем
    const hits = state.requests.filter((r) => r.url.includes("getbytitle('ProblemsPallet')/items?") && r.url.includes("$expand=AttachmentFiles"));
    expect(hits.length).toBe(1);

    const clips = host.querySelectorAll('[data-testid="related-attachments-button"]');
    expect(clips.length).toBe(1); // только у задачи со связанным элементом
    expect(clips[0].textContent).toContain("2");

    // клик ставит ?ID=<Id связанного элемента> — его читает ItemViewer
    await act(async () => { mouseClick(clips[0]); await wait200(); });
    expect(new URLSearchParams(window.location.search).get("ID")).toBe("25202");
  }, 40000);

  it("скрепка есть и в карточке #tasks/<Id>: те же вложения связанного элемента", async () => {
    state.extraMainTasks = [{
      ...MAIN_TASK,
      Id: 30,
      Title: "Задача со связанным элементом",
      RelatedItems: JSON.stringify([{ ListId: "{21b5b544-bd98-4b06-891f-c5a137331394}", ItemId: 25202 }]),
    }];
    state.relatedAttachments = { 25202: ["photo.jpg", "act.pdf"] };

    const host = renderTasksView({ initialElementId: "30" });
    await settle(3000);

    // карточка задачи открыта в hash-режиме
    expect(host.textContent).toContain("Задача со связанным элементом");

    const clip = host.querySelector('[data-testid="related-attachments-button"]');
    expect(clip).toBeTruthy();
    expect(clip.textContent).toContain("2");

    await act(async () => { mouseClick(clip); await wait200(); });
    expect(new URLSearchParams(window.location.search).get("ID")).toBe("25202");
  }, 40000);

  it("без вложений у связанного элемента скрепки на карточке нет", async () => {
    state.extraMainTasks = [{
      ...MAIN_TASK,
      Id: 31,
      Title: "Связанный элемент без вложений",
      RelatedItems: JSON.stringify([{ ListId: "{21b5b544-bd98-4b06-891f-c5a137331394}", ItemId: 25203 }]),
    }];
    state.relatedAttachments = { 25203: [] };

    const host = renderTasksView();
    await settle(2500);
    expect(host.querySelector('[data-testid="related-attachments-button"]')).toBeNull();
  }, 40000);
});
