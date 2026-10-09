// @vitest-environment jsdom
// src/features/tasks/components/__tests__/TasksHashContent.completed.test.jsx
//
// Режим #tasks/<ID>: карточка обязана ПРИНИМАТЬ состояние завершённой задачи
// сразу после выполнения действия (регрессия 2026-10-04: задача оставалась
// «в работе», потому что completeTask обновлял только список, а карточка живёт
// в elementTaskMatch и до обновлялась лишь по опросу — до 60 с).

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

function mount(task) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const theme = createTheme();
  const draw = (current) => act(() => {
    root.render(
      <ThemeProvider theme={theme}>
        <TasksHashContent
          matchMode="task"
          elementLoading={false}
          elementTaskSearching={false}
          elementTaskMatch={current}
          elementData={null}
          elementError=""
          elementIdParam={String(current?.Id ?? "")}
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
        />
      </ThemeProvider>
    );
  });
  draw(task);
  return { host, draw };
}

describe("TasksHashContent — карточка #tasks/<ID>", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("задача «в работе»: завершённой НЕ считается", () => {
    const { host } = mount(IN_WORK);
    expect(host.textContent).not.toContain("Задача выполнена");
    expect(host.textContent).toContain("Устранить проблемы");
  });

  it("после выполнения действия карточка показывает «Задача выполнена»", () => {
    const { host, draw } = mount(IN_WORK);
    expect(host.textContent).not.toContain("Задача выполнена");

    // completeTask применяет к elementTaskMatch Status/PercentComplete — карточка
    // обязана переключиться в состояние завершённой задачи без перезагрузки
    draw(COMPLETED);

    expect(host.textContent).toContain("Задача выполнена");
    expect(host.textContent).toContain("Результат: Найдена");
    // кнопок результата/взятия в работе у завершённой задачи нет
    const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent || "");
    expect(buttons.some((t) => /Взять в работу/.test(t))).toBe(false);
    expect(buttons.some((t) => /^Найдена$/.test(t.trim()))).toBe(false);
  });
});
