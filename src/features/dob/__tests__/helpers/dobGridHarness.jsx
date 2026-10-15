// src/features/dob/__tests__/helpers/dobGridHarness.jsx
//
// Общий стенд для тестов таблицы #dob_requests: полифилы, которые AG Grid
// требует в jsdom (ResizeObserver, IntersectionObserver, matchMedia), рендер
// грида внутри DobListStateProvider и пара помощников для проверок.

import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import DobGrid from "../../components/DobGrid";
import { DobListStateProvider } from "../../state/DobListStateContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }

/** Полифилы jsdom для AG Grid. */
export function installGridPolyfills() {
  globalThis.ResizeObserver = ResizeObserverStub;
  window.ResizeObserver = ResizeObserverStub;
  globalThis.IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  };
  window.IntersectionObserver = globalThis.IntersectionObserver;
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false,
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  globalThis.matchMedia = window.matchMedia;
}

/** Поля тестового списка: ID, Название, Статус, Люди, Тип. */
export const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "Title", Title: "Название", TypeAsString: "Text" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice", Choices: { results: ["Открыт", "Завершена"] } },
  { InternalName: "Initiator", Title: "Инициатор", TypeAsString: "User" },
  { InternalName: "Members", Title: "Участники", TypeAsString: "UserMulti" },
];

export const ROWS = [
  {
    ID: 1,
    Title: "Первая",
    Status: "Открыт",
    ContentTypeId: "0x0100AA10",
    Initiator: { Id: 7, Title: "Иванов Иван Иванович" },
    Members: { results: [{ Id: 7, Title: "Иванов Иван Иванович" }, { Id: 9, Title: "Петрова Анна" }] },
  },
  {
    ID: 2,
    Title: "Вторая",
    Status: "Открыт",
    ContentTypeId: "0x0100AA10",
    Initiator: { __deferred: { uri: "http://sp/FieldValuesAsText" } },
    InitiatorId: 12,
    Members: { results: [{ Id: 9, Title: "Петрова Анна" }] },
  },
  {
    ID: 3,
    Title: "Третья",
    Status: "Завершена",
    ContentTypeId: "0x0100BB20",
    Initiator: { Id: 5, Title: "Сидоров Пётр" },
    Members: null,
  },
];

export const CONTENT_TYPES = [
  { Id: "0x0100AA", StringId: "0x0100AA", Name: "Request", Description: "Заявка на проверку" },
  { Id: "0x0100BB", StringId: "0x0100BB", Name: "Claim", Description: "Претензия" },
];

/**
 * Рендер грида.
 * @param {object} [props] — пропы DobGrid (rows/fields/stateScope и т.д.)
 * @returns {Promise<{host:HTMLElement, root:object}>}
 */
export async function renderDobGrid(props = {}) {
  installGridPolyfills();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const {
    fields = FIELDS,
    rows = ROWS,
    contentTypes = CONTENT_TYPES,
    ...rest
  } = props;
  await act(async () => {
    root.render(
      <DobListStateProvider fields={fields} rows={rows}>
        <DobGrid
          fields={fields}
          rows={rows}
          contentTypes={contentTypes}
          initialStatusFilter={null}
          {...rest}
        />
      </DobListStateProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  return { host, root };
}

/** Клик с ожиданием перерисовки грида. */
export async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));
  });
}

/** Плоский текст контейнера. */
export function textOf(host) {
  return (host.textContent || "").replace(/\s+/g, " ");
}

/** Кнопка правой панели по подписи (слушатель висит на внутренней <button>). */
export function sideButton(host, label) {
  const wrapper = [...host.querySelectorAll(".ag-side-button")]
    .find((b) => (b.textContent || "").includes(label));
  return wrapper?.querySelector("button") || wrapper || null;
}
