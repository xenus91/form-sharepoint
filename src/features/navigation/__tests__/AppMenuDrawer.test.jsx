// @vitest-environment jsdom
// src/features/navigation/__tests__/AppMenuDrawer.test.jsx
//
// Меню должно быть одинаковым во всех интерфейсах. Раньше разметка была
// скопирована в App.jsx несколько раз, и одна копия разъехалась: пункт
// «Просмотр менеджерами» уехал в конец, а у «Задач» пропал бейдж с количеством
// активных задач.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import AppMenuDrawer from "../AppMenuDrawer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.matchMedia = window.matchMedia;

let root = null;
async function renderMenu(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <AppMenuDrawer
          open
          onClose={() => {}}
          onOpenForm={() => {}}
          onOpenTasks={() => {}}
          onOpenManagerPreview={() => {}}
          userName="Иванов Иван"
          userTitle="Начальник смены"
          {...props}
        />
      </ThemeProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return host;
}

// Drawer — это портал: содержимое лежит в document.body, не в host-контейнере.
const scope = () => document.body;
const itemTexts = () => Array.from(scope().querySelectorAll(".MuiListItemButton-root"))
  .map((n) => String(n.textContent || "").trim());

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("AppMenuDrawer", () => {
  it("порядок пунктов один и тот же: Главная → Просмотр менеджерами → Задачи", async () => {
    const host = await renderMenu({ canOpenManagerPreview: true });
    expect(itemTexts()).toEqual(["Главная", "Просмотр менеджерами", "Задачи"]);
  });

  it("пункта «Заявки ДОБ» в меню нет — раздел вынесен в отдельное приложение", async () => {
    await renderMenu({ canOpenManagerPreview: true });
    expect(scope().querySelector('[data-testid="menu-item-dob"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Заявки ДОБ");
  });

  it("без права на просмотр менеджерами пункт не показывается, порядок остальных тот же", async () => {
    const host = await renderMenu({ canOpenManagerPreview: false });
    expect(itemTexts(host)).toEqual(["Главная", "Задачи"]);
    expect(scope().querySelector('[data-testid="menu-item-manager"]')).toBeFalsy();
  });

  it("у «Задач» виден бейдж с количеством активных задач", async () => {
    const host = await renderMenu({ tasksCount: 7 });
    const tasks = scope().querySelector('[data-testid="menu-item-tasks"]');
    expect(tasks).toBeTruthy();
    expect(tasks.querySelector(".MuiBadge-badge")).toBeTruthy();
    expect(tasks.textContent).toContain("7");
  });

  it("ноль активных задач — бейджа нет", async () => {
    const host = await renderMenu({ tasksCount: 0 });
    const badge = scope().querySelector('[data-testid="menu-item-tasks"] .MuiBadge-badge');
    expect(badge === null || badge.textContent === "").toBe(true);
  });

  it("активный интерфейс подсвечен (задачи)", async () => {
    const host = await renderMenu({ active: "tasks" });
    expect(scope().querySelector('[data-testid="menu-item-tasks"]').className).toContain("Mui-selected");
    expect(scope().querySelector('[data-testid="menu-item-form"]').className).not.toContain("Mui-selected");
  });

  it("кнопка РЦ показывается только если передана подпись и обработчик", async () => {
    const withRc = await renderMenu({ rcLabel: "РЦ-8114", onOpenRcModal: vi.fn() });
    expect(document.body.textContent).toContain("РЦ: РЦ-8114");
    await act(async () => root.unmount());
    root = null;
    document.body.innerHTML = "";
    const withoutRc = await renderMenu({});
    expect(document.body.textContent).not.toContain("РЦ:");
  });
});
