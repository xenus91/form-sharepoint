// @vitest-environment jsdom
// src/features/tasks/hooks/__tests__/useHashElement.test.jsx
// Поведение роута #tasks/<id>: задача открывается по своему Id, элемент
// ProblemsPallet дёргается только когда задачи с таким Id нет.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  palletCalls: [],
  searchCalls: [],
  palletItem: null,
  fullTask: null,
  fullTaskCalls: [],
}));

// useHashElement импортирует через "../../../tasks/..." из hooks/
vi.mock("../../../../tasks/hashSearch", () => ({
  searchTaskByRelatedItem: async (id) => {
    state.searchCalls.push(String(id));
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

function Probe({ elementId, kind = "auto", tasks = [] }) {
  const st = useHashElement({
    initialElementId: elementId,
    initialElementAction: null,
    initialElementKind: kind,
    tasks,
    distribution: null,
    currentUserId: 207,
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
    />
  );
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
  beforeEach(() => {
    state.palletCalls = [];
    state.searchCalls = [];
    state.fullTaskCalls = [];
    state.palletItem = { Id: 1, THU: "808117004013738272", Title: "Паллет" };
    state.fullTask = null;
  });

  it("Id задачи есть в списке → открывается карточка задачи, элемент не запрашивается", async () => {
    const r = await renderProbe({ elementId: "688", tasks: [TASK_688] });
    expect(r.match).toBe("688");
    expect(r.mode).toBe("task");
    expect(state.palletCalls).toEqual([]);
    expect(state.searchCalls).toEqual([]);
  });

  it("Id задачи не в списке, но есть на сервере → догружаем задачу, элемент не запрашивается", async () => {
    state.fullTask = { ...TASK_688, Id: 700, Title: "Задача вне фильтра" };
    const r = await renderProbe({ elementId: "700", tasks: [] });
    expect(r.match).toBe("700");
    expect(r.mode).toBe("task");
    expect(state.fullTaskCalls).toEqual(["700"]);
    expect(state.palletCalls).toEqual([]);
  });

  it("задачи с таким Id нет → элементный путь (ProblemsPallet + RelatedItems)", async () => {
    const r = await renderProbe({ elementId: "688", tasks: [] });
    expect(r.mode).toBe("element");
    expect(state.palletCalls).toEqual(["688"]);
    expect(state.searchCalls).toEqual(["688"]);
    expect(r.error).toContain("Связанная задача для элемента #688 не найдена");
  });

  it("явная ссылка на элемент (#tasks/id=688) не ищет задачу по Id", async () => {
    const r = await renderProbe({ elementId: "688", kind: "element", tasks: [TASK_688] });
    expect(r.mode).toBe("element");
    expect(r.match).toBe("");
    expect(state.palletCalls).toEqual(["688"]);
  });
});
