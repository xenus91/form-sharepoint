// @vitest-environment jsdom
// src/features/dob/__tests__/DobTaskEditView.guiltyById.test.jsx
//
// «Виновные» в ВЫПОЛНЕННОЙ заявке ООБ (#dob_tasks/906?list=…).
//
// Причина поломки: SharePoint не всегда раскрывает многозначное поле
// «Пользователь или группа» в $expand (колонка скрыта, слишком много expands,
// старая ферма). Тогда в ответе есть только `GuiltyId`, а `Guilty` — пустой, и
// в форме вместо виновных — пустота (читать-то задачу уже нельзя: read-only).
//
// Правило: если User-поле пришло пустым, но Id есть — достаём людей по Id
// с того же сайта (`getuserbyid` → `sitegroups/getbyid`). Тип (человек/группа)
// берём из PrincipalType, поэтому группа не превращается в человека.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const LIST_GUID = "21b5b544-bd98-4b06-891f-c5a137331394";
const DOB_BASE = "/dob-api/sites/dob/doblogistic/_api";

const LIST_FIELDS = [
  { InternalName: "Title", Title: "Заголовок", TypeAsString: "Text" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["Не начата", "В работе", "Завершена"] } },
  // Многозначное «Пользователь или группа» — как «Виновные» в заявке ООБ.
  { InternalName: "Guilty", Title: "Виновные", TypeAsString: "User", AllowMultipleValues: true },
  { InternalName: "Comment", Title: "Комментарий", TypeAsString: "Note" },
];

// Выполненная задача: SharePoint раскрыл НЕ все поля — Guilty пуст, есть только Id.
const COMPLETED_ITEM_NO_EXPAND = {
  Id: 906,
  Title: "Заявка ООБ (выполнена)",
  ContentTypeId: "0x0108003365C4474CAE8C42BCE396314E88E51F0064B41D430E2B5D4AB18CF8F3FE9605CF",
  Status: "Завершена",
  PercentComplete: 1,
  Comment: "Готово",
  GuiltyId: { results: [12, 33] },
};

// Тот же элемент, но поле раскрыто нормально — фолбэк не должен его затирать.
const COMPLETED_ITEM_EXPANDED = {
  ...COMPLETED_ITEM_NO_EXPAND,
  Guilty: { results: [{ Id: 12, Title: "Иванов Иван" }, { Id: 33, Title: "ООБ (группа)" }] },
};

const state = vi.hoisted(() => ({ item: null, calls: [] }));

vi.mock("../api/dobApi", () => ({
  getDobFields: vi.fn(async () => LIST_FIELDS),
  getDobContentTypeFields: vi.fn(async () => LIST_FIELDS),
  getDobItem: vi.fn(async () => state.item),
  updateDobItem: vi.fn(async () => ({ ok: true })),
  uploadDobAttachment: vi.fn(async () => ({})),
  getDobAttachments: vi.fn(async () => []),
  deleteDobAttachment: vi.fn(async () => ({})),
  getDobEntityType: vi.fn(async () => "SP.Data.DoblogisticListItem"),
  getDobItems: vi.fn(async () => ({ results: [], next: null })),
  getDobItemsPaged: vi.fn(async () => []),
}));

// Сайт ДОБ: 12 — человек, 33 — ГРУППА (PrincipalType = 8).
vi.mock("../api/dobClient", () => {
  const get = async (url) => {
    state.calls.push(String(url));
    const u = String(url);
    if (u.includes("/web/currentuser")) return { data: { d: { Id: 207 } } };
    if (u.includes("/web/getuserbyid(12)")) {
      return { data: { d: { Id: 12, Title: "Иванов Иван", LoginName: "i:0#.f|membership|ivanov@lenta.com", Email: "ivanov@lenta.com", PrincipalType: 1 } } };
    }
    if (u.includes("/web/getuserbyid(33)")) {
      return { data: { d: { Id: 33, Title: "ООБ", LoginName: "ООБ", Email: "", PrincipalType: 8 } } };
    }
    if (u.includes("/web/getuserbyid(51)")) {
      return { data: { d: { Id: 51, Title: "Петров Пётр", LoginName: "i:0#.f|membership|petrov@lenta.com", PrincipalType: 1 } } };
    }
    if (u.includes("/web/getuserbyid(52)")) {
      return { data: { d: { Id: 52, Title: "Смена А", LoginName: "Смена А", PrincipalType: 8 } } };
    }
    const err = new Error("not found");
    err.response = { status: 404, data: {} };
    throw err;
  };
  return {
    DOB_SITE_RELATIVE: "/sites/dob/doblogistic",
    DOB_LIST_GUID: LIST_GUID,
    dobApiBase: () => DOB_BASE,
    dobListApi: () => `${DOB_BASE}/web/lists(guid'${LIST_GUID}')`,
    getDobDigest: async () => "digest",
    dobAxios: { get, post: async () => ({ data: { d: {} }, status: 204 }), interceptors: { request: { use() {} }, response: { use() {} } } },
  };
});

vi.mock("../components/RichEditor", () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// Нас интересует значение, которое форма отдала в поле людей.
vi.mock("../../tasks/components/PersonFieldAutocomplete", () => ({
  default: ({ label, value }) => (
    <div data-testid="person-field" data-label={label}>
      <span data-testid="person-value">{(Array.isArray(value) ? value : []).map((u) => u.Title).join(", ")}</span>
    </div>
  ),
}));

const { default: DobTaskEditView } = await import("../DobTaskEditView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const settle = async (ms = 120) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

async function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={createTheme()}>
          <NotificationsProvider>
            <DobTaskEditView id={906} listGuid={LIST_GUID} onBackHash="#dob_tasks" />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await settle(250);
  return { host, root };
}

const guiltyValue = (host) => [...host.querySelectorAll('[data-testid="person-field"]')]
  .find((el) => (el.getAttribute("data-label") || "").includes("Виновн"))
  ?.querySelector('[data-testid="person-value"]')?.textContent || null;

describe("DobTaskEditView — виновные в выполненной заявке", () => {
  beforeEach(() => {
    window.location.hash = `#dob_tasks/906?list=${LIST_GUID}`;
    document.body.innerHTML = "";
    state.calls.length = 0;
  });

  it("выполненная задача — только просмотр (форма закрыта для правки)", async () => {
    state.item = COMPLETED_ITEM_NO_EXPAND;
    const { host } = await renderForm();
    expect(host.querySelector('[data-testid="dob-readonly-chip"]')).toBeTruthy();
  });

  it("если SharePoint не раскрыл поле — виновные подтягиваются по Id", async () => {
    state.item = COMPLETED_ITEM_NO_EXPAND;
    const { host } = await renderForm();
    await settle(250);
    expect(guiltyValue(host)).toBe("Иванов Иван, ООБ");
  });

  it("Id уточняются запросами к сайту ДОБ (и кэшируются)", async () => {
    // Id 51/52 — «свежие»: кэш принципалов модульный и уже знает 12/33
    // из предыдущих тестов, поэтому проверяем на новых.
    state.item = { ...COMPLETED_ITEM_NO_EXPAND, GuiltyId: { results: [51, 52] } };
    const { host } = await renderForm();
    await settle(250);
    expect(guiltyValue(host)).toBe("Петров Пётр, Смена А");
    expect(state.calls.some((u) => u.includes("/web/getuserbyid(51)"))).toBe(true);
    expect(state.calls.some((u) => u.includes("/web/getuserbyid(52)"))).toBe(true);

    // второй рендер того же элемента — из кэша, без новых запросов
    const before = state.calls.filter((u) => u.includes("getuserbyid")).length;
    await renderForm();
    await settle(250);
    expect(state.calls.filter((u) => u.includes("getuserbyid")).length).toBe(before);
  });

  it("раскрытое поле не перетираем", async () => {
    state.item = COMPLETED_ITEM_EXPANDED;
    const { host } = await renderForm();
    await settle(250);
    expect(guiltyValue(host)).toBe("Иванов Иван, ООБ (группа)");
  });

  it("поле раскрыто, но БЕЗ имён (только Id) — имена всё равно подтягиваются", async () => {
    // Частый случай: $expand отработал, а $select не содержал <Поле>/Title —
    // в форме были бы пустые чипы.
    state.item = { ...COMPLETED_ITEM_NO_EXPAND, Guilty: { results: [{ Id: 12 }, { Id: 33 }] } };
    const { host } = await renderForm();
    await settle(250);
    expect(guiltyValue(host)).toBe("Иванов Иван, ООБ");
  });

  it("заполненное имя не затираем, тянем только отсутствующие", async () => {
    state.item = { ...COMPLETED_ITEM_NO_EXPAND, Guilty: { results: [{ Id: 12, Title: "Иванов Иван" }, { Id: 51 }] } };
    const { host } = await renderForm();
    await settle(250);
    // своё имя осталось, второе дотянулось по Id
    expect(guiltyValue(host)).toBe("Иванов Иван, Петров Пётр");
  });

  it("одиночное User-поле раскрыто без имени — имя подтягивается", async () => {
    state.item = { ...COMPLETED_ITEM_NO_EXPAND, Guilty: { Id: 12 } };
    const { host } = await renderForm();
    await settle(250);
    expect(guiltyValue(host)).toBe("Иванов Иван");
  });

  it("одиночный Id (не коллекция) тоже подтягивается", async () => {
    state.item = { ...COMPLETED_ITEM_NO_EXPAND, GuiltyId: 12 };
    const { host } = await renderForm();
    await settle(250);
    expect(guiltyValue(host)).toBe("Иванов Иван");
  });
});
