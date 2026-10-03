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

const state = vi.hoisted(() => ({ requests: [] }));

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
    if (d.includes(`${MAIN_LIST}/fields`)) return { data: { d: { results: fieldDefs(MAIN_FIELDS) } } };
    if (d.includes(`${MAIN_LIST}/items`)) return { data: { d: { results: [MAIN_TASK] } } };
    if (d.includes(`${MAIN_LIST}?`)) return { data: { d: { ListItemEntityTypeFullName: "SP.Data.TasksListItem" } } };
    // TaskBehaviour / прочие списки — пусто
    return { data: { d: { results: [] } } };
  };
  const post = async () => ({ data: { d: {} } });
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
      const rows = [DOB_TASK];
      if (/AssignedToId eq 33/.test(filter)) rows.push(DOB_GROUP_TASK);
      return { data: { d: { results: rows.filter((r) => filter.includes(`eq ${r.AssignedTo.results[0].Id}`)) } } };
    }
    return { data: { d: { results: [] } } };
  };
  const post = async (url, body) => {
    state.requests.push({ source: "dob", url: String(url), method: "MERGE", body });
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

const { default: TasksView } = await import("../../../TasksView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;

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

async function clickByText(host, re) {
  const el = [...host.querySelectorAll("button,[role=tab]")].find((b) => re.test(b.textContent || ""));
  if (!el) return false;
  await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  return true;
}

describe("TasksView — multi-source (#tasks)", () => {
  beforeEach(() => {
    state.requests = [];
    localStorage.clear();
    sessionStorage.clear();
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
    expect([...dobCard.querySelectorAll("button")].some((b) => /Изменить/.test(b.textContent || ""))).toBe(true);

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
    expect(countRows()).toBe(3);

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
    expect(titlesInitial.length).toBe(3);

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

  it("клик по строке только выделяет, а кнопка «Изменить» открывает форму задачи источника", async () => {
    const host = renderTasksView();
    await settle(3000);
    await clickByText(host, /Таблица/);
    await settle(3000);

    // кнопка в тулбаре есть, но без выделения недоступна
    const editBtn = [...host.querySelectorAll("button")].find((b) => /Изменить/.test(b.textContent || ""));
    expect(editBtn).toBeTruthy();
    expect(editBtn.disabled).toBe(true);

    // одиночный клик по строке dob-задачи = выделение (без перехода)
    const hashBefore = window.location.hash;
    const row = [...host.querySelectorAll(".ag-row")].find((r) => r.getAttribute("row-id") === "dob:1" || /Заявка ООБ/.test(r.textContent || ""));
    expect(row).toBeTruthy();
    await act(async () => {
      row.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(window.location.hash).toBe(hashBefore);

    // для выделенной dob-строки доступно и взятие в работу (как в «Заявки ДОБ»)
    const takeBtn = [...host.querySelectorAll("button")].find((b) => /Взять в работу/.test(b.textContent || ""));
    expect(takeBtn).toBeTruthy();
    await act(async () => {
      takeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    });
    const merge = state.requests.find((r) => r.source === "dob" && r.method === "MERGE");
    expect(merge).toBeTruthy();
    expect(merge.body).toEqual({ Status: "В работе" });

    const editBtn2 = [...host.querySelectorAll("button")].find((b) => /Изменить/.test(b.textContent || ""));
    expect(editBtn2.disabled).toBe(false);
    await act(async () => {
      editBtn2.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
    });

    // форма — та же, что dob_tasks/[id], но по списку задачи источника
    expect(window.location.hash.toLowerCase()).toBe(`#dob_tasks/1?list=03fc1b92-baff-44dc-b8a3-d04acbe329d3`);
  }, 30000);
});
