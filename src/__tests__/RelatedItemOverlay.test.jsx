// @vitest-environment jsdom
// src/__tests__/RelatedItemOverlay.test.jsx
//
// Связанный элемент (?ID=<Id> из RelatedItems) открывается ПОВЕРХ приложения,
// а не вместо него: список задач не размонтируется и при возврате не грузится
// заново.
//
// Раньше в main.tsx стояло `hasIdParam() ? <ItemViewer/> : <App/>` — адрес ?ID=
// выключал приложение целиком. Поэтому проверяем именно боевую композицию
// AppWithOverlay (с заглушкой вместо тяжёлого App), а не самодельное дерево.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const unmounts = vi.hoisted(() => ({ n: 0 }));

// App ходит в SharePoint и тянет весь интерфейс — подменяем заглушкой,
// которая считает размонтирования.
vi.mock("../App.jsx", () => ({
  default: function AppStub() {
    React.useEffect(() => () => { unmounts.n += 1; }, []);
    return <div data-testid="app-stub">приложение</div>;
  },
}));

// ItemViewer тоже ходит в сеть — проверяем сам оверлей, а не загрузку элемента.
vi.mock("../ItemViewer", () => ({
  default: () => <div data-testid="item-viewer-stub">просмотрщик</div>,
}));

const AppWithOverlay = (await import("../AppWithOverlay")).default;
const { openRelatedItem, clearRelatedId } = await import("../tasks/relatedAttachments");

describe("связанный элемент поверх приложения (AppWithOverlay)", () => {
  let host;
  let root;

  beforeEach(() => {
    unmounts.n = 0;
    window.history.replaceState(null, "", "/sites/x/SitePages/app.aspx#tasks");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(<AppWithOverlay />);
      await new Promise((r) => setTimeout(r, 10));
    });
  };

  it("без ?ID= оверлея нет, приложение на месте", async () => {
    await render();
    expect(host.querySelector('[data-testid="related-item-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="app-stub"]')).toBeTruthy();
  });

  it("скрепка (?ID=) рисует просмотрщик поверх, НЕ размонтируя приложение", async () => {
    await render();

    // Так делает клик по скрепке на карточке задачи.
    await act(async () => {
      openRelatedItem(25202);
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(window.location.search).toBe("?ID=25202");
    expect(host.querySelector('[data-testid="related-item-overlay"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="item-viewer-stub"]')).toBeTruthy();
    // Главное: приложение осталось смонтированным — списку нечего перегружать.
    expect(host.querySelector('[data-testid="app-stub"]')).toBeTruthy();
    expect(unmounts.n).toBe(0);
  });

  it("это окно поверх списка, а не сплошной экран: затемнение + панель с шапкой", async () => {
    await render();
    await act(async () => { openRelatedItem(25324); await new Promise((r) => setTimeout(r, 10)); });

    const overlay = host.querySelector('[data-testid="related-item-overlay"]');
    expect(overlay).toBeTruthy();
    // Затемнение отдельным слоем — за ним остаётся виден список задач.
    const backdrop = host.querySelector('[data-testid="related-item-backdrop"]');
    expect(backdrop).toBeTruthy();
    // Панель — сосед затемнения, а не сам оверлей на весь экран.
    const panel = backdrop.nextElementSibling;
    expect(panel).toBeTruthy();
    expect(panel.contains(host.querySelector('[data-testid="item-viewer-stub"]'))).toBe(true);
    // Шапка панели с номером элемента — по ней видно, что это окно внутри страницы.
    expect(panel.textContent).toContain("Связанный элемент № 25324");
    // Клик по затемнению закрывает окно.
    await act(async () => {
      backdrop.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(host.querySelector('[data-testid="related-item-overlay"]')).toBeNull();
    expect(unmounts.n).toBe(0);
  });

  it("Esc закрывает окно, приложение остаётся смонтированным", async () => {
    await render();
    await act(async () => { openRelatedItem(25202); await new Promise((r) => setTimeout(r, 10)); });
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(host.querySelector('[data-testid="related-item-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="app-stub"]')).toBeTruthy();
  });

  it("возврат убирает оверлей, приложение так и не размонтировалось", async () => {
    await render();
    await act(async () => { openRelatedItem(25202); await new Promise((r) => setTimeout(r, 10)); });

    const back = host.querySelector('[data-testid="related-view-back"]');
    expect(back).toBeTruthy();
    await act(async () => {
      back.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(host.querySelector('[data-testid="related-item-overlay"]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get("ID")).toBeNull();
    expect(window.location.hash).toBe("#tasks"); // hash списка задач сохранён
    expect(host.querySelector('[data-testid="app-stub"]')).toBeTruthy();
    expect(unmounts.n).toBe(0);
  });

  it("прямая ссылка ?ID= открывает элемент сразу, вместе с приложением", async () => {
    window.history.replaceState(null, "", "/sites/x/SitePages/app.aspx?ID=25324#tasks");
    await render();
    expect(host.querySelector('[data-testid="item-viewer-stub"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="app-stub"]')).toBeTruthy();
  });

  it("clearRelatedId не трогает остальные query-параметры", async () => {
    window.history.replaceState(null, "", "/sites/x/SitePages/app.aspx?dbg=1&ID=5#tasks");
    clearRelatedId();
    const usp = new URLSearchParams(window.location.search);
    expect(usp.get("ID")).toBeNull();
    expect(usp.get("dbg")).toBe("1");
  });
});
