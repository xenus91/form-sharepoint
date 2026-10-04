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
    getUserPositions: vi.fn(async () => ({ [IVANOV.LoginName.toLowerCase()]: "Главный специалист" })),
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

function renderField(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
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

  it("у выбранного пользователя в чипе видно имя и должность", async () => {
    renderField({ value: [IVANOV] });
    await settle(80);
    const chip = document.body.querySelector(".MuiChip-root");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("Иванов Иван Иванович");
    expect(chip.textContent).toContain("Главный специалист");
  });

  it("короткий запрос не ходит на сервер", async () => {
    const { host } = renderField();
    const input = host.querySelector("input");
    await act(async () => { typeInto(input, "и"); await settle(400); });
    expect(searchSiteUsers).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Введите минимум 2 символа");
  });
});
