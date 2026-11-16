// @vitest-environment jsdom
/* eslint-disable react/prop-types */
// src/features/tasks/hooks/__tests__/useRelatedAttachments.test.jsx
//
// Счётчики вложений связанных элементов: один батч на страницу, а не запрос на
// карточку; карточка без RelatedItems скрепки не получает.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../tasks/relatedAttachments", async () => {
  const actual = await vi.importActual("../../../../tasks/relatedAttachments");
  return { ...actual, fetchRelatedAttachmentCounts: (...a) => fetchMock(...a) };
});

const { useRelatedAttachments } = await import("../useRelatedAttachments");

const related = (itemId) => JSON.stringify([{ ListId: "{aaaa}", ItemId: itemId }]);

function Probe({ tasks, onData }) {
  const r = useRelatedAttachments(tasks);
  React.useEffect(() => {
    onData(r);
  });
  return null;
}

describe("useRelatedAttachments", () => {
  let host;
  let root;
  let seen;

  beforeEach(() => {
    fetchMock.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    seen = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function mount(tasks) {
    act(() => {
      root.render(<Probe tasks={tasks} onData={(r) => seen.push(r)} />);
    });
  }

  const settle = async () => {
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
  };

  const last = () => seen[seen.length - 1];

  it("все связанные Id страницы уходят одним вызовом", async () => {
    fetchMock.mockResolvedValue(new Map([[11, 2], [12, 0]]));
    mount([
      { Id: 1, RelatedItems: related(11) },
      { Id: 2, RelatedItems: related(12) },
      { Id: 3 }, // без RelatedItems
    ]);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].sort()).toEqual([11, 12]);
  });

  it("countOf отдаёт число вложений задачи", async () => {
    fetchMock.mockResolvedValue(new Map([[11, 3]]));
    const task = { Id: 1, RelatedItems: related(11) };
    mount([task]);
    await settle();

    expect(last().countOf(task)).toBe(3);
    expect(last().hasAttachments(task)).toBe(true);
  });

  it("без RelatedItems или без вложений — 0, скрепки не будет", async () => {
    fetchMock.mockResolvedValue(new Map([[11, 0]]));
    const plain = { Id: 9 };
    const noFiles = { Id: 1, RelatedItems: related(11) };
    mount([plain, noFiles]);
    await settle();

    expect(last().countOf(plain)).toBe(0);
    expect(last().countOf(noFiles)).toBe(0);
    expect(last().hasAttachments(noFiles)).toBe(false);
  });

  it("без связанных элементов запроса нет вовсе", async () => {
    mount([{ Id: 1 }, { Id: 2 }]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("один и тот же набор не запрашивается повторно", async () => {
    fetchMock.mockResolvedValue(new Map([[11, 1]]));
    const tasks = [{ Id: 1, RelatedItems: related(11) }];
    mount(tasks);
    await settle();
    // ре-рендер с тем же набором Id
    act(() => {
      root.render(<Probe tasks={[{ Id: 1, RelatedItems: related(11) }]} onData={(r) => seen.push(r)} />);
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
