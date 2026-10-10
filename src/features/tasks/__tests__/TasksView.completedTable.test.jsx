// @vitest-environment jsdom
// src/features/tasks/__tests__/TasksView.completedTable.test.jsx
//
// Вкладка «Завершенные» в ТАБЛИЧНОМ режиме.
//
// Регрессия: TasksGrid всегда получал tableData.rows (только активные задачи из
// multi-source), а завершённые живут в отдельном ленивом источнике
// (RenderListDataAsStream). Поэтому в таблице переключение вкладки НИЧЕГО не
// меняло — завершённые задачи были видны только карточками.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIN_LIST = "/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')";
const MAIN_FIELDS = ["Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified", "PercentComplete", "Editor", "ContentTypeId"];

// Активная задача (видна на вкладке «Активные»).
const ACTIVE_TASK = {
  Id: 10,
  Title: "Активная задача паллет",
  Body: "Проверить паллет",
  Status: "Не начата",
  PercentComplete: 0,
  Modified: "2026-10-03T09:00:00Z",
  Created: "2026-10-02T10:00:00Z",
  AssignedTo: { Id: 207, Title: "Поршаков Сергей" },
  Editor: { Id: 207, Title: "Поршаков Сергей" },
};

// Завершённая задача — приходит ТОЛЬКО из RenderListDataAsStream.
const COMPLETED_ROW = {
  ID: 906,
  Title: "Выполненная задача ООБ",
  Status: "Завершена",
  PercentComplete: 1,
  AssignedTo: [{ id: "207", title: "Поршаков Сергей" }],
  Modified: "2026-09-16T10:00:00Z",
};

const state = vi.hoisted(() => ({ posts: [] }));

vi.mock("../../../api", () => {
  const get = async (url) => {
    const u = String(url);
    const d = decodeURIComponent(u);
    if (u.includes("/web/currentuser")) return { data: { d: { Id: 207, Title: "Поршаков Сергей" } } };
    if (u.includes("GetMyProperties")) {
      return { data: { d: { UserProfileProperties: { results: [{ Key: "Office", Value: "РЦ-8117" }] } } } };
    }
    if (u.includes("getbytitle('DcEmail')")) return { data: { d: { results: [] } } };
    if (d.includes(`${MAIN_LIST}/fields`)) {
      return { data: { d: { results: MAIN_FIELDS.map((InternalName) => ({ InternalName, Title: InternalName, TypeAsString: "Text" })) } } };
    }
    if (d.includes(`${MAIN_LIST}/items`)) {
      // Активные задачи: завершённые сюда НЕ попадают (их отдаёт только CAML).
      return { data: { d: { results: [ACTIVE_TASK] } } };
    }
    return { data: { d: { results: [] } } };
  };
  const post = async (url, body) => {
    state.posts.push({ url: String(url), body });
    if (String(url).includes("RenderListDataAsStream")) {
      const viewXml = String(body?.parameters?.ViewXml || "");
      const limit = Number(viewXml.match(/RowLimit Paged="TRUE">(\d+)</)?.[1] || 20);
      return {
        data: {
          d: {
            RenderListDataAsStream: {
              Row: [COMPLETED_ROW].slice(0, limit),
              RowCount: 1,
              NextHref: null,
            },
          },
        },
      };
    }
    return { data: { d: {} } };
  };
  return {
    default: { get, post, defaults: { headers: {} }, interceptors: { request: { use() {} }, response: { use() {} } } },
    invalidate: () => {},
    cachedGet: (client, url, opts) => client.get(url, opts),
    getCacheStats: () => ({}),
    normalizeNextUrl: (u) => u,
  };
});

const { default: TasksView } = await import("../../../TasksView");
const NotificationsProvider = (await import("../../../NotificationsProvider")).default;

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

const settle = async (ms = 600) => {
  for (let i = 0; i < Math.ceil(ms / 50); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
};

function renderTasksView() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={createTheme()}>
          <NotificationsProvider>
            <TasksView />
          </NotificationsProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
  });
  return { host, root };
}

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
  });
};

// Заголовки строк AG Grid (в jsdom рендерятся закреплённые и часть обычных колонок).
const gridTitles = (host) => [...host.querySelectorAll(".ag-row")]
  .map((r) => (r.textContent || "").trim())
  .filter(Boolean);

const tabByText = (host, re) => [...host.querySelectorAll('[role="tab"]')]
  .find((el) => re.test(el.textContent || ""));

describe("TasksView — вкладка «Завершённые» в табличном режиме", () => {
  beforeEach(() => {
    state.posts.length = 0;
    // Табличный режим по умолчанию (как выбрал бы пользователь переключателем).
    try { localStorage.setItem("tasks.viewMode", "table"); } catch { /* ignore */ }
  });

  it("в таблице видны активные задачи", async () => {
    const { host } = renderTasksView();
    await settle(900);
    const text = gridTitles(host).join(" | ");
    expect(text).toContain("Активная задача паллет");
    expect(text).not.toContain("Выполненная задача ООБ");
    expect(host.querySelector('[data-testid="table-mode-caption"]')?.textContent || "").toContain("активные");
  });

  it("переключение на «Завершённые» меняет строки таблицы", async () => {
    const { host } = renderTasksView();
    await settle(900);
    const tab = tabByText(host, /Завершен/);
    expect(tab).toBeTruthy();
    await click(tab);
    await settle(1200);
    // завершённые задачи реально запрошены
    expect(state.posts.some((p) => p.url.includes("RenderListDataAsStream"))).toBe(true);
    const text = gridTitles(host).join(" | ");
    expect(text).toContain("Выполненная задача ООБ");
    expect(text).not.toContain("Активная задача паллет");
    const caption = host.querySelector('[data-testid="table-mode-caption"]')?.textContent || "";
    expect(caption).toContain("завершённые");
  });

  it("обратно на «Активные» — снова активные задачи", async () => {
    const { host } = renderTasksView();
    await settle(900);
    await click(tabByText(host, /Завершен/));
    await settle(1000);
    await click(tabByText(host, /Активные/));
    await settle(900);
    const text = gridTitles(host).join(" | ");
    expect(text).toContain("Активная задача паллет");
    expect(text).not.toContain("Выполненная задача ООБ");
  });
});
