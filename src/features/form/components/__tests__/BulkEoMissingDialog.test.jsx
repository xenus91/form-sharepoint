// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const mocks = vi.hoisted(() => ({
  fetchBulkRecipientOptions: vi.fn(),
  createBulkProblemsPalletItems: vi.fn(),
}));

vi.mock("../../lib/bulkRecipientLookup", () => ({
  fetchBulkRecipientOptions: mocks.fetchBulkRecipientOptions,
  recipientOptionLabel: (recipient) => {
    const number = recipient?.scNumberText || recipient?.scNumber || "";
    return `${number} — ${recipient?.title || ""}`.trim();
  },
}));
vi.mock("../../lib/bulkSubmit", () => ({
  createBulkProblemsPalletItems: mocks.createBulkProblemsPalletItems,
}));

const { default: BulkEoMissingDialog } = await import("../BulkEoMissingDialog");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = globalThis.ResizeObserver;
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false,
  media: query,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
}));

const recipients = [
  { id: 1, scNumberText: "0294", scNumber: "294", title: "Магазин 0294" },
  { id: 2, scNumberText: "0295", scNumber: "295", title: "Магазин 0295" },
];
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function findButton(text) {
  return [...document.body.querySelectorAll("button")].find((button) => button.textContent.includes(text));
}

async function clickButton(text) {
  const button = findButton(text);
  if (!button) throw new Error(`Кнопка «${text}» не найдена`);
  await act(async () => {
    button.click();
    await wait(5);
  });
}

async function pasteSource(source, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  await act(async () => {
    source.dispatchEvent(new window.Event("paste", { bubbles: true }));
    setter.call(source, text);
    source.dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(320);
  });
}

describe("BulkEoMissingDialog", () => {
  let host;
  let root;
  let onCreated;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onCreated = vi.fn();
    mocks.fetchBulkRecipientOptions.mockResolvedValue(recipients);
    mocks.createBulkProblemsPalletItems.mockImplementation(async ({ rows, onRowResult }) => {
      const results = rows.map((row, index) => ({
        rowId: row.id,
        status: "success",
        itemId: index + 100,
        retryable: false,
        message: "",
      }));
      results.forEach((result) => onRowResult?.(result));
      return results;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function render({ onCheckEoConflict } = {}) {
    await act(async () => {
      root.render(
        <ThemeProvider theme={createTheme()}>
          <BulkEoMissingDialog
            open
            onClose={() => {}}
            choices={["Не найдена", "Повреждение"]}
            initialProblems={[]}
            initialLocation=""
            dcThu="8117"
            operationDateIso="2026-10-10T00:00:00.000Z"
            onCheckEoConflict={onCheckEoConflict}
            onCreated={onCreated}
          />
        </ThemeProvider>,
      );
      await wait(5);
    });
  }

  it("показывает результат распознавания, затем отправляет по одному элементу на каждую ЕО", async () => {
    await render();
    await act(async () => { await wait(5); });

    const source = document.body.querySelector('[data-testid="bulk-eo-source"]');
    expect(source).not.toBeNull();
    expect(document.body.textContent).toContain("Вставьте данные");
    const sharedSettingsRow = document.body.querySelector('[data-testid="bulk-eo-problem-location"]');
    expect(sharedSettingsRow.querySelector('[data-testid="bulk-eo-problems"]')).not.toBeNull();
    expect(sharedSettingsRow.querySelector('[data-testid="bulk-eo-location"]')).not.toBeNull();
    await pasteSource(source, "0294\n808117004022047365\n\n0295\n808117004022002852");

    expect(document.body.querySelector('[data-testid="bulk-eo-rows"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Автоматически распознано ЕО:");
    expect(document.body.querySelector('[data-testid="bulk-eo-number-1"]').textContent).toBe("808117004022047365");
    expect(document.body.querySelector('[data-testid="bulk-eo-number-2"]').textContent).toBe("808117004022002852");
    expect(document.body.querySelector('[aria-label="Получатель, строка 1"]').value).toContain("0294");
    expect(document.body.querySelector('[aria-label="Получатель, строка 2"]').value).toContain("0295");
    expect(document.body.querySelector('[aria-label="Получатель, строка 1"]').title).toBe("Сопоставлен автоматически");
    expect(document.body.querySelector('[data-testid="bulk-eo-delete-1"]')).not.toBeNull();
    expect(findButton("Распознать")).toBeUndefined();
    expect(findButton("ОК, выбрать проблемы")).toBeUndefined();
    expect(document.body.textContent).toContain("Проблемы для всех заявок");
    expect(document.body.textContent).toContain("Не найдена");
    expect(document.body.querySelector('[data-testid="bulk-eo-location"]').value).toBe("Не найдена в зоне отгрузки");
    expect(document.body.querySelector('[data-testid="bulk-eo-collapsed-preview"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="bulk-eo-source"]')).toBeNull();
    expect(source.tagName).toBe("TEXTAREA");
    expect(source.getAttribute("wrap")).toBe("soft");
    expect(source.style.fontSize).toBe("12px");
    expect(source.style.overflowX).toBe("hidden");

    await clickButton("Отправить 2 заявки");
    expect(mocks.createBulkProblemsPalletItems).toHaveBeenCalledTimes(1);
    const options = mocks.createBulkProblemsPalletItems.mock.calls[0][0];
    expect(options.rows).toHaveLength(2);
    expect(options.rows.map((row) => row.eoNumber)).toEqual([
      "808117004022047365",
      "808117004022002852",
    ]);
    expect(options.rows.map((row) => row.recipientId)).toEqual([1, 2]);
    expect(options.problems).toContain("Не найдена");
    expect(options.location).toBe("Не найдена в зоне отгрузки");
    expect(onCreated).toHaveBeenCalledWith(2);
    expect(document.body.textContent).toContain("Все заявки созданы");
  });

  it("позволяет исправить номер нажатием на чип и удалить пару красной кнопкой", async () => {
    await render();
    const source = document.body.querySelector('[data-testid="bulk-eo-source"]');
    await pasteSource(source, "0294\n808117004022047365\n\n0295\n808117004022002852");

    const expandSourceButton = document.body.querySelector('[aria-label="Изменить вставленные данные"]');
    expect(expandSourceButton).not.toBeNull();
    await act(async () => {
      expandSourceButton.click();
      await wait(5);
    });
    expect(document.body.querySelector('[data-testid="bulk-eo-source"]').value).toContain("808117004022047365");
    await act(async () => {
      document.body.querySelector('[aria-label="Свернуть данные"]').click();
      await wait(5);
    });
    expect(document.body.querySelector('[data-testid="bulk-eo-collapsed-preview"]')).not.toBeNull();

    const eoChip = document.body.querySelector('[data-testid="bulk-eo-number-1"]');
    await act(async () => {
      eoChip.click();
      await wait(5);
    });
    const eoInput = document.body.querySelector('[aria-label="Номер ЕО, строка 1"]');
    expect(eoInput.value).toBe("808117004022047365");

    const setInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setInputValue.call(eoInput, "808117004022047366");
      eoInput.dispatchEvent(new window.Event("input", { bubbles: true }));
      await wait(5);
    });
    await act(async () => {
      eoInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await wait(5);
    });
    expect(document.body.querySelector('[data-testid="bulk-eo-number-1"]').textContent).toBe("808117004022047366");

    const deleteButton = document.body.querySelector('[data-testid="bulk-eo-delete-1"]');
    expect(deleteButton).not.toBeNull();
    await act(async () => {
      deleteButton.click();
      await wait(5);
    });
    expect(document.body.querySelectorAll('[data-testid^="bulk-eo-row-"]')).toHaveLength(1);
    expect(document.body.querySelector('[data-testid="bulk-eo-number-1"]').textContent).toBe("808117004022002852");
  });

  it("отключает отправку и показывает серую кнопку, пока есть ошибки валидации", async () => {
    await render();
    const source = document.body.querySelector('[data-testid="bulk-eo-source"]');
    await pasteSource(source, "02941\n808117004022047365");

    const sendButton = document.body.querySelector('[data-testid="bulk-eo-send"]');
    expect(sendButton.disabled).toBe(true);
    expect(sendButton.className).toContain("Mui-disabled");
    expect(document.body.textContent).toContain("Не сопоставлен получатель 02941.");
  });

  it("перед отправкой предупреждает о конфликтующей заявке и требует явного подтверждения", async () => {
    const onCheckEoConflict = vi.fn().mockResolvedValue({
      THU: "808117004022047365",
      Problems: { results: ["Повреждение"] },
      Location1: "Зона отгрузки",
    });
    await render({ onCheckEoConflict });
    await act(async () => { await wait(5); });

    const source = document.body.querySelector('[data-testid="bulk-eo-source"]');
    await pasteSource(source, "0294\n808117004022047365");
    await clickButton("Отправить 1 заявка");

    expect(onCheckEoConflict).toHaveBeenCalledWith("808117004022047365");
    expect(mocks.createBulkProblemsPalletItems).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("По некоторым ЕО уже есть заявки с другими проблемами");

    await clickButton("Подтвердить и отправить 1 заявка");
    expect(mocks.createBulkProblemsPalletItems).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(1);
  });
});
