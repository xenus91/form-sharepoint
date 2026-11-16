// @vitest-environment jsdom
// src/features/tasks/components/__tests__/TasksHashContent.completed.test.jsx
//
// Два контракта карточки в режиме #tasks/<ID>:
//   1) после выполнения действия она ПРИНИМАЕТ состояние завершённой задачи
//      (регрессия: задача оставалась «в работе» до следующего опроса — до 60 с);
//   2) пока задача догружается (первый переход догружает её с сервера) показывается
//      ЛОАДЕР, а не плашка «Элемент #… не найден» (ложное «не найдено» на кадр).

import { describe, it, expect, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";
import TasksHashContent from "../TasksHashContent";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const IN_WORK = {
  Id: 652,
  Title: "Устранить проблемы",
  Body: "Проверить паллет",
  Status: "В процессе",
  PercentComplete: 0,
  AssignedTo: "Поршаков Сергей",
  EditorTitle: "Поршаков Сергей",
  Modified: "2026-10-04T09:00:00Z",
};
// ровно тот патч, который completeTask применяет к elementTaskMatch после записи
const COMPLETED = { ...IN_WORK, Status: "Завершена", PercentComplete: 1, ResultSearchTHU: "Найдена" };

function mount(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const theme = createTheme();
  const draw = (next) => act(() => {
    root.render(
      <ThemeProvider theme={theme}>
        <TasksHashContent
          matchMode="task"
          elementLoading={false}
          elementTaskSearching={false}
          elementTaskMatch={null}
          elementData={null}
          elementError=""
          elementNotFound={false}
          elementIdParam="652"
          elementActionParam={null}
          isHashTaskRefreshing={false}
          taskConfiguration={{ data: null }}
          fieldDefaultActions={[]}
          choices={["Найдена", "Не найдена"]}
          resultFieldsMeta={new Map()}
          ctResultMap={new Map()}
          updatingId={null}
          updatingAction={null}
          onResultClick={() => {}}
          onTakeInWork={() => {}}
          onComplete={() => {}}
          currentUserId={1}
          currentUserTitle="Поршаков Сергей"
          onClearElementHash={() => {}}
          {...props}
          {...next}
        />
      </ThemeProvider>
    );
  });
  draw({});
  return { host, draw };
}

describe("TasksHashContent — карточка #tasks/<ID>", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("задача «в работе»: завершённой НЕ считается", () => {
    const { host } = mount({ elementTaskMatch: IN_WORK });
    expect(host.textContent).not.toContain("Задача выполнена");
    expect(host.textContent).toContain("Устранить проблемы");
  });

  it("после выполнения действия карточка показывает «Задача выполнена»", () => {
    const { host, draw } = mount({ elementTaskMatch: IN_WORK });
    expect(host.textContent).not.toContain("Задача выполнена");

    // completeTask применяет к elementTaskMatch Status/PercentComplete — карточка
    // обязана переключиться в состояние завершённой задачи без перезагрузки
    draw({ elementTaskMatch: COMPLETED });

    expect(host.textContent).toContain("Задача выполнена");
    expect(host.textContent).toContain("Результат: Найдена");
    // кнопок результата/взятия в работе у завершённой задачи нет
    const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent || "");
    expect(buttons.some((t) => /Взять в работу/.test(t))).toBe(false);
    expect(buttons.some((t) => /^Найдена$/.test(t.trim()))).toBe(false);
  });
});

describe("TasksHashContent — первый переход по #tasks/<ID>", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("пока задача догружается — лоадер, но НЕ «не найдено»", () => {
    // Состояние первого кадра: match ещё не разрешён, флаги загрузки не выставлены
    // (задача догружается с сервера — resolveHashTarget → fetchFullTask).
    const { host } = mount({ elementIdParam: "25195", elementTaskMatch: null, elementError: "", elementNotFound: false });

    expect(host.querySelector('[data-testid="hash-loading"]')).toBeTruthy();
    expect(host.textContent).not.toContain("не найден");
    expect(host.textContent).not.toContain("Завершённые");
  });

  it("догрузили задачу — вместо лоадера карточка, без «не найдено»", () => {
    const { host, draw } = mount({ elementIdParam: "25195", elementTaskMatch: null });
    expect(host.querySelector('[data-testid="hash-loading"]')).toBeTruthy();

    draw({ elementTaskMatch: { ...IN_WORK, Id: 25195 }, matchMode: "task" });

    expect(host.querySelector('[data-testid="hash-loading"]')).toBeNull();
    expect(host.textContent).toContain("Устранить проблемы");
    expect(host.textContent).not.toContain("не найден");
  });

  it("поиск завершён без результата — плашка «не найдено» показывается", () => {
    const { host } = mount({
      elementIdParam: "25195",
      elementTaskMatch: null,
      elementNotFound: true,
      elementError: "Элемент #25195 не найден",
    });

    expect(host.querySelector('[data-testid="hash-loading"]')).toBeNull();
    expect(host.textContent).toContain("Элемент #25195 не найден");
  });
});
