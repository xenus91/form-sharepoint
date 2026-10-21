// @vitest-environment jsdom
// src/features/tasks/hooks/__tests__/useHashElement.test.jsx
// Поведение роута #tasks/<id>: задача открывается по своему Id, элемент
// ProblemsPallet дёргается только когда задачи с таким Id нет.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable react/prop-types -- Probe ниже — тестовая заглушка, не компонент приложения. */

const state = vi.hoisted(() => ({
  palletCalls: [],
  searchCalls: [],
  palletItem: null,
  fullTask: null,
  fullTaskCalls: [],
  palletGate: null,
  searchGate: null,
}));

// useHashElement импортирует через "../../../tasks/..." из hooks/
vi.mock("../../../../tasks/hashSearch", () => ({
  searchTaskByRelatedItem: async (id) => {
    state.searchCalls.push(String(id));
    if (state.searchGate) await state.searchGate;
    return null;
  },
  fetchFullTask: async (id) => {
    state.fullTaskCalls.push(String(id));
    return state.fullTask;
  },
}));

vi.mock("../../../../tasks/problemsPallet", () => ({
  fetchProblemsPalletItem: async (id) => {
    state.palletCalls.push(String(id));
    if (state.palletGate) await state.palletGate;
    if (!state.palletItem) {
      const e = new Error("not found");
      e.response = { status: 404, data: {} };
      throw e;
    }
    return state.palletItem;
  },
}));

vi.mock("../../../../tasks/distribution", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getGroupIdsFromDistribution: () => [] };
});

const { useHashElement } = await import("../useHashElement");

const TASK_688 = { Id: 688, Title: "Задача ООБ", Status: "Не начата", PercentComplete: 0, DueDate: null };

function Probe({ elementId, kind = "auto", tasks = [], distribution = null, currentUserId = 207 }) {
  const st = useHashElement({
    initialElementId: elementId,
    initialElementAction: null,
    initialElementKind: kind,
    tasks,
    distribution,
    currentUserId,
    tab: 0,
    setTab: () => {},
    isTabPending: false,
    startTabTransition: (fn) => fn(),
  });
  return (
    <div
      data-testid="probe"
      data-match={st.elementTaskMatch ? st.elementTaskMatch.Id : ""}
      data-mode={st.matchMode || ""}
      data-error={st.elementError || ""}
      data-searching={String(st.elementTaskSearching)}
      data-loading={String(st.elementLoading)}
      data-notfound={String(st.elementNotFound)}
    />
  );
}

/** Монтирует стенд с возможностью перерисовки — чтобы менять props на лету. */
function mountProbe(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<Probe {...props} />); });
  const read = () => {
    const el = host.querySelector('[data-testid="probe"]');
    return {
      match: el.getAttribute("data-match"),
      mode: el.getAttribute("data-mode"),
      error: el.getAttribute("data-error"),
      loading: el.getAttribute("data-loading"),
      searching: el.getAttribute("data-searching"),
      notfound: el.getAttribute("data-notfound"),
    };
  };
  const tick = async (n = 5) => {
    for (let i = 0; i < n; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
  };
  return {
    read,
    tick,
    rerender: (next) => { act(() => { root.render(<Probe {...next} />); }); },
    close: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

async function renderProbe(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<Probe {...props} />); });
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
  const el = host.querySelector('[data-testid="probe"]');
  return {
    match: el.getAttribute("data-match"),
    mode: el.getAttribute("data-mode"),
    error: el.getAttribute("data-error"),
  };
}

describe("useHashElement — роут #tasks/<id>", () => {
  it("отменённый прогон не оставляет вечный лоадер, если следующий нашёл задачу локально", async () => {
    // Регрессия: #tasks/25393 периодически залипал на «Загружаю элемент #25393…».
    // Прогон отменялся (приходил distribution) посреди searchTaskByRelatedItem и
    // оставлял elementTaskSearching=true. Следующий прогон находил задачу локально
    // и сбрасывал только elementLoading, а ворота лоадера в TasksHashContent
    // смотрят на searching через || — лоадер не гас никогда.
    state.palletItem = { Id: 25393, Title: "Элемент 25393" };
    let releaseSearch;
    state.searchGate = new Promise((r) => { releaseSearch = r; });

    const p = mountProbe({ elementId: "25393", tasks: [], distribution: null });
    await p.tick(4);
    expect(p.read().searching).toBe("true"); // идёт поиск связанной задачи

    // Пришёл distribution и загрузился список → эффект перезапускается,
    // предыдущий прогон отменён прямо посреди поиска.
    const task = {
      Id: 777,
      Title: "Задача 777",
      Status: "Не начата",
      PercentComplete: 0,
      RelatedItems: JSON.stringify([{ ListId: "{21b5b544-bd98-4b06-891f-c5a137331394}", ItemId: 25393 }]),
    };
    p.rerender({ elementId: "25393", tasks: [task], distribution: { Id: 5 } });
    releaseSearch();
    await p.tick(10);

    const r = p.read();
    expect(r.match).toBe("777");
    expect(r.searching).toBe("false"); // до правки здесь было "true"
    expect(r.loading).toBe("false");
    await p.close();
  });

  beforeEach(() => {
    state.palletCalls = [];
    state.searchCalls = [];
    state.fullTaskCalls = [];
    state.searchGate = null;
    state.palletItem = { Id: 1, THU: "808117004013738272", Title: "Паллет" };
    state.fullTask = null;
    state.palletGate = null;
  });

  it("Id задачи есть в списке → открывается карточка задачи, элемент не запрашивается", async () => {
    const r = await renderProbe({ elementId: "688", tasks: [TASK_688] });
    expect(r.match).toBe("688");
    expect(r.mode).toBe("task");
    expect(state.palletCalls).toEqual([]);
    expect(state.searchCalls).toEqual([]);
  });

  it("id из #tasks/<n> никогда не догружается как задача из списка задач", async () => {
    // #tasks/<n> — это Id элемента ProblemsPallet: задача ищется CAML GetItems
    // по RelatedItems, поля карточки берутся из ProblemsPallet. Догрузки
    // items(<n>) из списка задач быть не должно — на элементной ссылке она
    // всегда отдавала 404.
    state.fullTask = { ...TASK_688, Id: 700, Title: "Задача вне фильтра" };
    const r = await renderProbe({ elementId: "700", tasks: [] });
    expect(state.fullTaskCalls).toEqual([]);
    expect(r.mode).toBe("element");
    expect(state.palletCalls).toEqual(["700"]);
    expect(state.searchCalls).toEqual(["700"]);
  });

  it("задачи с таким Id нет → элементный путь (ProblemsPallet + RelatedItems)", async () => {
    const r = await renderProbe({ elementId: "688", tasks: [] });
    expect(r.mode).toBe("element");
    expect(state.palletCalls).toEqual(["688"]);
    expect(state.searchCalls).toEqual(["688"]);
    expect(r.error).toContain("Связанная задача для элемента #688 не найдена");
  });

  it("если ничего не найдено, лоадер останавливается даже при смене distribution во время запроса", async () => {
    // Ничего не найдено: задачи нет ни локально, ни на сервере, элемент — 404.
    state.palletItem = null;
    state.fullTask = null;
    let release;
    state.palletGate = new Promise((res) => { release = res; });

    const p = mountProbe({ elementId: "688", tasks: [] });
    await p.tick(2);
    // Запрос элемента ещё в полёте — меняем distribution (это зависимость эффекта).
    p.rerender({ elementId: "688", tasks: [], distribution: { changed: true } });
    await p.tick(2);
    release();
    await p.tick(20);

    const r = p.read();
    // Иначе TasksHashContent навсегда остаётся на «Загружаю…»: searchFinished
    // требует match ИЛИ notFound ИЛИ error, и ни того, ни другого нет.
    expect(r.loading).toBe("false");
    expect(r.searching).toBe("false");
    expect(r.notfound === "true" || !!r.error).toBe(true);
    await p.close();
  }, 30000);

  it("явная ссылка на элемент (#tasks/id=688) не ищет задачу по Id", async () => {
    const r = await renderProbe({ elementId: "688", kind: "element", tasks: [TASK_688] });
    expect(r.mode).toBe("element");
    expect(r.match).toBe("");
    expect(state.palletCalls).toEqual(["688"]);
  });
});
