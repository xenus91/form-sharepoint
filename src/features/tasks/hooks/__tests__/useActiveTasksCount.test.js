/* eslint-disable react/prop-types */
// @vitest-environment jsdom
// src/features/tasks/hooks/__tests__/useActiveTasksCount.test.js
//
// Бейдж «активные задачи» в бургер-меню. Регрессия: счёт «слетал» при
// переключении между интерфейсами — его писали двое (опросчик App и TasksView
// со своим числом по загруженной выборке), а ответы приходили вразнобой.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const apiState = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../../../api", () => ({
  default: { get: (...args) => apiState.get(...args), defaults: { headers: {} } },
}));

const { default: useActiveTasksCount, buildActiveTasksFilter } = await import("../useActiveTasksCount");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ACTIVE = [{ Id: 1, Status: "Не начата", PercentComplete: 0 }, { Id: 2, Status: "В работе", PercentComplete: 0 }];
const rows = (n) => Array.from({ length: n }, (_, i) => ({ Id: i + 1, Status: "В работе", PercentComplete: 0 }));
const MIXED = [...ACTIVE, { Id: 3, Status: "Завершена", PercentComplete: 1 }];

let probe = null;

function Probe({ userId = 77, distribution = null, intervalMs = 60000, get = null }) {
  const hook = useActiveTasksCount({ currentUserId: userId, distribution, intervalMs, get });
  probe = hook;
  return React.createElement("span", { "data-testid": "count" }, String(hook.count));
}

async function render(ui) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(ui); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return { host, root };
}

/** Отложенный ответ: резолвим руками, чтобы управлять порядком. */
function deferredGet() {
  const pending = [];
  const get = vi.fn((url) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    pending.push({ url, resolve, reject, promise });
    return promise;
  });
  return { get, pending };
}

describe("useActiveTasksCount — бейдж активных задач", () => {
  beforeEach(() => {
    apiState.get.mockReset();
    probe = null;
    document.body.innerHTML = "";
  });

  it("считает только незавершённые и по фильтру «я + группы рассылки»", async () => {
    apiState.get.mockResolvedValue({ data: { d: { results: MIXED } } });
    await render(React.createElement(Probe, { userId: 77, distribution: { Email: { results: [{ Id: 33 }] } } }));

    expect(probe.count).toBe(2);
    const url = apiState.get.mock.calls[0][0];
    expect(url).toContain("AssignedToId eq 77");
    expect(url).toContain("AssignedToId eq 33");
  });

  it("поздний ответ старого фильтра не затирает свежий счёт (главная регрессия)", async () => {
    const { get, pending } = deferredGet();
    const { root } = await render(React.createElement(Probe, { userId: 77, distribution: null, get }));
    // первый запрос — только «личный» фильтр (рассылка ещё не загрузилась)
    expect(pending).toHaveLength(1);
    const first = pending[0];

    // рассылка (группы) подгрузилась — фильтр изменился, ушёл второй запрос
    await act(async () => {
      root.render(React.createElement(Probe, { userId: 77, distribution: { Email: { results: [{ Id: 33 }] } }, get }));
      await new Promise((r) => setTimeout(r, 20));
    });
    const p2 = pending[1];
    expect(p2).toBeTruthy();
    expect(p2.url).toContain("AssignedToId eq 33");
    expect(p2.url).not.toBe(first.url);

    // отвечает СНАЧАЛА свежий (7), а потом — устаревший (1)
    await act(async () => {
      p2.resolve({ data: { d: { results: rows(7) } } });
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      first.resolve({ data: { d: { results: rows(1) } } });
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(probe.count).toBe(7);
  });

  it("ошибка сети не обнуляет счётчик (бейдж не пропадает)", async () => {
    apiState.get.mockResolvedValueOnce({ data: { d: { results: MIXED } } });
    await render(React.createElement(Probe, { userId: 77 }));
    expect(probe.count).toBe(2);

    apiState.get.mockRejectedValueOnce(new Error("network"));
    await act(async () => { await probe.refresh(); await new Promise((r) => setTimeout(r, 10)); });
    expect(probe.count).toBe(2);
  });

  it("одинаковый фильтр не шлёт второй запрос, пока первый в полёте", async () => {
    const { get, pending } = deferredGet();
    await render(React.createElement(Probe, { userId: 77, get }));
    await act(async () => {
      const a = probe.refresh();
      const b = probe.refresh();
      pending[0].resolve({ data: { d: { results: rows(3) } } });
      await Promise.all([a, b]);
    });
    expect(pending).toHaveLength(1);
    expect(probe.count).toBe(3);
  });

  it("если AssignedToId не фильтруется — считает по AssignedTo/Id", async () => {
    apiState.get.mockRejectedValueOnce(new Error("column does not exist"));
    apiState.get.mockResolvedValueOnce({ data: { d: { results: ACTIVE } } });
    await render(React.createElement(Probe, { userId: 77 }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(probe.count).toBe(2);
    expect(apiState.get.mock.calls[1][0]).toContain("AssignedTo/Id eq 77");
  });

  it("без пользователя запросов нет", async () => {
    await render(React.createElement(Probe, { userId: null }));
    expect(apiState.get).not.toHaveBeenCalled();
    expect(probe.count).toBe(0);
  });

  it("фильтр: один id — без скобок, несколько — через or", () => {
    expect(buildActiveTasksFilter(77, null)).toBe("AssignedToId eq 77");
    expect(buildActiveTasksFilter(77, { Email: { results: [{ Id: 33 }, { Id: 34 }] } }))
      .toBe("(AssignedToId eq 77 or AssignedToId eq 33 or AssignedToId eq 34)");
    expect(buildActiveTasksFilter(null, null)).toBe("");
  });
});
