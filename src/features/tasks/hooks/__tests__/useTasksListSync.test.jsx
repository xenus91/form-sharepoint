// @vitest-environment jsdom
// src/features/tasks/hooks/__tests__/useTasksListSync.test.jsx
/* eslint-disable react/prop-types */
//
// Бейдж «Задачи» опрашивает сервер раз в 60 с, список задач живёт в react-query
// со staleTime/refetchInterval 5 минут. Без связки бейдж показывал 4, а список —
// 3. Проверяем, что новое число бейджа перечитывает список.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

const { default: useTasksListSyncOnBadgeChange } = await import("../useTasksListSync");

const calls = vi.hoisted(() => ({ n: 0 }));

/** Стоящий рядом «список задач»: тот же префикс ключа, что у useTasksQuery. */
function TasksListStub() {
  useQuery({
    queryKey: ["tasks", 7, "fields"],
    queryFn: async () => {
      calls.n += 1;
      return [{ Id: 1 }, { Id: 2 }, { Id: 3 }];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
  return null;
}

function Probe({ badge }) {
  useTasksListSyncOnBadgeChange(badge);
  return null;
}

describe("useTasksListSyncOnBadgeChange — бейдж тянет за собой список", () => {
  let host;
  let root;
  let client;

  beforeEach(() => {
    calls.n = 0;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    client.clear();
  });

  const render = async (badge) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <TasksListStub />
          <Probe badge={badge} />
        </QueryClientProvider>
      );
      await new Promise((r) => setTimeout(r, 30));
    });
  };

  const settle = async () => {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
  };

  it("бейдж 3 → 4: список перечитывается сразу, не дожидаясь 5 минут", async () => {
    await render(3);
    const before = calls.n;
    expect(before).toBe(1); // список загрузился один раз

    await render(4);
    await settle();
    expect(calls.n).toBeGreaterThan(before);
  });

  it("то же число бейджа запрос не повторяет", async () => {
    await render(3);
    const before = calls.n;
    await render(3);
    await settle();
    expect(calls.n).toBe(before);
  });

  it("первое значение бейджа запрос не дублирует (список и так грузится)", async () => {
    await render(0);
    const before = calls.n;
    await settle();
    expect(calls.n).toBe(before);
  });

  it("бейдж убывает (4 → 3) — список тоже перечитывается", async () => {
    await render(4);
    const before = calls.n;
    await render(3);
    await settle();
    expect(calls.n).toBeGreaterThan(before);
  });

  it("пустой список не перечитывается: на старте дубля запроса нет", async () => {
    const empty = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let n = 0;
    function EmptyList() {
      useQuery({
        queryKey: ["tasks", 9],
        queryFn: async () => { n += 1; return []; },
        staleTime: 5 * 60_000,
      });
      return null;
    }
    const render2 = async (badge) => {
      await act(async () => {
        root.render(
          <QueryClientProvider client={empty}>
            <EmptyList />
            <Probe badge={badge} />
          </QueryClientProvider>
        );
        await new Promise((r) => setTimeout(r, 30));
      });
    };
    await render2(0);
    const before = n;
    await render2(5);
    await settle();
    expect(n).toBe(before);
    empty.clear();
  });
});
