// @vitest-environment jsdom
// src/features/tasks/__tests__/PersonFieldAutocomplete.test.jsx
//
// Поле «Пользователь или группа»: поиск по учётной записи через API, многократный
// выбор и подпись «Имя + Должность» у выбранного.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const IVANOV = {
  Id: 7,
  Title: "Иванов Иван Иванович",
  LoginName: "i:0#.f|membership|ivanov.ii@lenta.com",
  Email: "ivanov.ii@lenta.com",
};

vi.mock("../../../tasks/userSearch", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchSiteUsers: vi.fn(async (query) => (String(query).toLowerCase().includes("ivanov") ? [IVANOV] : [])),
    getUserPositions: vi.fn(async () => ({
      [IVANOV.LoginName.toLowerCase()]: {
        position: "Главный специалист",
        department: "Департамент ИТ",
        office: "СПб, Ленинский 1",
        label: "Главный специалист · Департамент ИТ · СПб, Ленинский 1",
      },
    })),
    getUserPosition: vi.fn(async () => "Главный специалист"),
  };
});

const { default: PersonFieldAutocomplete } = await import("../components/PersonFieldAutocomplete");
const { searchSiteUsers } = await import("../../../tasks/userSearch");

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

const settle = async (ms = 60) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};

const mountedRoots = [];

function renderField(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <PersonFieldAutocomplete
          label="Виновный"
          value={[]}
          onChange={vi.fn()}
          multiple
          {...props}
        />
      </ThemeProvider>
    );
  });
  return { host, root };
}

const typeInto = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

describe("PersonFieldAutocomplete — «Пользователь или группа»", () => {
  beforeEach(() => {
    // Размонтируем прошлые деревья (в них порталы Popover), потом чистим body.
    for (const root of mountedRoots.splice(0)) {
      act(() => { root.unmount(); });
    }
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("ищет людей по учётной записи и отдаёт выбранного в onChange", async () => {
    const onChange = vi.fn();
    const { host } = renderField({ onChange });
    const input = host.querySelector("input");
    expect(input).toBeTruthy();

    await act(async () => { typeInto(input, "ivanov_ii"); await settle(400); });
    // запрос ушёл с тем, что ввёл пользователь (нормализацию `_`→`.` делает userSearch)
    expect(searchSiteUsers).toHaveBeenCalled();
    expect(String(searchSiteUsers.mock.calls[0][0])).toContain("ivanov");

    const option = [...document.body.querySelectorAll('[role="option"]')]
      .find((el) => /Иванов Иван/.test(el.textContent || ""));
    expect(option).toBeTruthy();
    // в подсказке видно и должность
    expect(option.textContent).toContain("Главный специалист");

    await act(async () => {
      option.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await settle(50);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([IVANOV]);
  });

  it("чип содержит ТОЛЬКО имя, а должность/департамент/офис — в карточке по клику", async () => {
    renderField({ value: [IVANOV] });
    await settle(80);
    const chip = document.body.querySelector(".MuiChip-root");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("Иванов Иван Иванович");
    // Полные сведения не «раздувают» чип и не выезжают за края формы.
    expect(chip.textContent).not.toContain("Главный специалист");
    expect(chip.textContent).not.toContain("Департамент ИТ");
    expect(chip.textContent).not.toContain("СПб, Ленинский 1");
    const chipLabel = chip.querySelector("[title]");
    expect(chipLabel?.getAttribute("title")).toContain("Главный специалист");

    await act(async () => {
      chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await settle(80);
    });
    const text = document.querySelector('[data-testid="person-details-body"]')?.textContent || "";
    expect(text).toContain("Главный специалист");
    expect(text).toContain("Департамент ИТ");
    expect(text).toContain("СПб, Ленинский 1");
  });

  it("клик по выбранному чипу раскрывает свойства: должность, департамент, офис, учётная запись", async () => {
    renderField({ value: [IVANOV] });
    await settle(80);
    const chip = document.querySelector('[data-testid="person-chip-7"]');
    expect(chip).toBeTruthy();
    expect(document.querySelector('[data-testid="person-details-body"]')).toBeNull();

    await act(async () => {
      chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await settle(80);
    });
    const body = document.querySelector('[data-testid="person-details-body"]');
    expect(body).toBeTruthy();
    const text = body.textContent || "";
    expect(text).toContain("Должность");
    expect(text).toContain("Главный специалист");
    expect(text).toContain("Департамент");
    expect(text).toContain("Департамент ИТ");
    expect(text).toContain("Офис");
    expect(text).toContain("СПб, Ленинский 1");
    expect(text).toContain("Учётная запись");
    expect(text).toContain(IVANOV.LoginName);

    // повторный клик по тому же чипу закрывает свойства
    await act(async () => {
      chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await settle(200);
    });
    // jsdom не шлёт transitionend, поэтому узел выходящей анимации остаётся —
    // закрытость проверяем по атрибуту модального корня Popover.
    const details = document.querySelector('[data-testid="person-details-body"]');
    const modalRoot = details?.closest(".MuiModal-root");
    expect(modalRoot ? modalRoot.getAttribute("aria-hidden") : "true").toBe("true");
  });

  it("если профиль пуст — свойства честно сообщают об этом, без «undefined»", async () => {
    const userSearch = await import("../../../tasks/userSearch");
    userSearch.getUserPositions.mockResolvedValueOnce({});
    renderField({ value: [IVANOV] });
    await settle(80);
    const chip = document.querySelector('[data-testid="person-chip-7"]');
    await act(async () => {
      chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await settle(80);
    });
    const body = document.querySelector('[data-testid="person-details-body"]');
    // учётная запись подтянется из самого значения, остального нет
    expect(body.textContent).toContain(IVANOV.LoginName);
    expect(body.textContent).not.toContain("undefined");
    expect(body.textContent).not.toContain("[object Object]");
  });

  it("короткий запрос не ходит на сервер", async () => {
    const { host } = renderField();
    const input = host.querySelector("input");
    await act(async () => { typeInto(input, "и"); await settle(400); });
    expect(searchSiteUsers).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Введите минимум 2 символа");
  });
});
