// @vitest-environment jsdom
/* eslint-disable react/prop-types */
// src/tasks/__tests__/useTasksQuery.refetchOnMount.test.jsx
//
// Регрессия: «при переходе в /#tasks через меню как будто не выполняется поиск
// задач. Я увидел badge с имеющейся задачей, перешёл в него — в списке задача не
// появилась! Только после регулярного пулинга».
//
// Причина: бейдж «Задачи» — отдельный опросчик с интервалом 60 с
// (features/tasks/hooks/useActiveTasksCount.js, DEFAULT_INTERVAL_MS), а список
// задач живёт на useTasksQuery со staleTime/refetchInterval 5 минут и без
// refetchOnMount. Свежий (< 5 мин) кэш отдавался как есть, поэтому на входе в
// #tasks запрос не уходил вовсе, и новая задача появлялась только на тике
// refetchInterval.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchTasksMock = vi.hoisted(() => vi.fn());

vi.mock("../fetchTasks", () => ({
  fetchTasks: (...args) => fetchTasksMock(...args),
}));

vi.mock("../enrich", () => ({
  enrichTasksWithRelated: vi.fn(async () => ({
    recipientMap: new Map(),
    scNumberMap: new Map(),
    thuMap: new Map(),
  })),
  getGlobalEnrichCacheByTaskId: () => null,
  getGlobalEnrichCache: () => null,
  setGlobalEnrichCacheByTaskId: vi.fn(),
  setGlobalEnrichCache: vi.fn(),
}));

const { useTasksQuery } = await import("../useTasksQuery");

const PARAMS = {
  currentUserId: 42,
  distribution: null,
  taskFieldNames: [],
  recipientField: null,
  scNumberField: null,
  resultFieldInternalNames: [],
  enabled: true,
};

// Ключ собирается внутри хука — повторяем его, чтобы подложить «свежий» кэш.
const QUERY_KEY = ["tasks", 42, null, "", null, null, ""];

/** Компонент-проба: прокидывает данные хука наружу. */
function Probe({ params, onData }) {
  const q = useTasksQuery(params);
  React.useEffect(() => {
    onData(q.data, q.isFetching);
  });
  return null;
}

describe("useTasksQuery — вход в #tasks", () => {
  let client;
  let root;
  let container;
  let seen;

  beforeEach(() => {
    fetchTasksMock.mockReset();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    seen = [];
  });

  afterEach(() => {
    // Размонтирование чистит и 300-мс таймер фонового обогащения.
    act(() => root.unmount());
    container.remove();
  });

  function mount(params = PARAMS) {
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe params={params} onData={(data, isFetching) => seen.push({ data, isFetching })} />
        </QueryClientProvider>
      );
    });
  }

  /** Прогоняем микро- и макротаски, чтобы запрос завершился. */
  async function settle() {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }

  const lastData = () => seen[seen.length - 1]?.data;

  it("вход в #tasks делает запрос даже при свежем непустом кэше", async () => {
    // Кэш «с прошлого захода»: dataUpdatedAt = сейчас → данные свежие.
    client.setQueryData(QUERY_KEY, [{ Id: 1, Title: "старая задача" }]);
    fetchTasksMock.mockResolvedValue([
      { Id: 1, Title: "старая задача" },
      { Id: 2, Title: "новая задача" },
    ]);

    mount();
    await settle();

    expect(fetchTasksMock).toHaveBeenCalledTimes(1);
  });

  it("новая задача из ответа попадает в список, а не остаётся только в бейдже", async () => {
    client.setQueryData(QUERY_KEY, [{ Id: 1, Title: "старая задача" }]);
    fetchTasksMock.mockResolvedValue([
      { Id: 1, Title: "старая задача" },
      { Id: 2, Title: "новая задача" },
    ]);

    mount();
    await settle();

    expect(lastData()?.map((t) => t.Id)).toEqual([1, 2]);
    expect(lastData()?.find((t) => t.Id === 2).Title).toBe("новая задача");
  });

  it("прежние строки остаются на экране на время запроса (placeholderData)", async () => {
    client.setQueryData(QUERY_KEY, [{ Id: 1, Title: "старая задача" }]);
    let resolveFetch;
    fetchTasksMock.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      })
    );

    mount();
    await settle();

    expect(fetchTasksMock).toHaveBeenCalledTimes(1);
    // Запрос в полёте — список не пустой
    expect(lastData()?.map((t) => t.Id)).toEqual([1]);

    await act(async () => {
      resolveFetch([{ Id: 1 }, { Id: 2 }]);
      await new Promise((r) => setTimeout(r, 10));
    });
    await settle();
    expect(lastData()?.map((t) => t.Id)).toEqual([1, 2]);
  });

  it("без кэша тоже делает ровно один запрос", async () => {
    fetchTasksMock.mockResolvedValue([]);
    mount();
    await settle();
    expect(fetchTasksMock).toHaveBeenCalledTimes(1);
  });

  it("без currentUserId запрос не уходит", async () => {
    fetchTasksMock.mockResolvedValue([]);
    mount({ ...PARAMS, currentUserId: null });
    await settle();
    expect(fetchTasksMock).not.toHaveBeenCalled();
  });
});
