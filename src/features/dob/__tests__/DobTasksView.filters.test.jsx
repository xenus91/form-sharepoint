// @vitest-environment jsdom
// src/features/dob/__tests__/DobTasksView.filters.test.jsx
//
// Проводка страницы #dob_requests: какие строки REALLY уходят в таблицу.
// Проверяем правило видимости по подразделению. Фильтра статусов и
// переключателя группировки у страницы больше нет (2026-10-15) — фильтрацию,
// группировку и закрепление колонок пользователь делает интерфейсом AG Grid.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "DC", Title: "РЦ", TypeAsString: "Choice" },
  { InternalName: "InitiatingDepartment", Title: "Департамент", TypeAsString: "Text" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice" },
];

const ROWS = [
  { ID: 1, DC: "8114", InitiatingDepartment: "Департамент логистики", Status: "Открыт" },
  { ID: 2, DC: "8114", InitiatingDepartment: "Департамент продаж", Status: "Открыт" },
  { ID: 3, DC: "8114", InitiatingDepartment: "Департамент логистики", Status: "Завершена" },
  { ID: 4, DC: "8200", InitiatingDepartment: "Департамент логистики", Status: "Открыт" },
];

vi.mock("../hooks/useDobFields", () => ({
  useDobFields: () => ({ data: FIELDS, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("../hooks/useDobContentTypes", () => ({
  useDobContentTypes: () => ({
    contentTypes: [{ Id: "0x0100AA", Name: "Заявка", Description: "Заявка на проверку" }],
    ctFieldNames: new Set(["DC"]),
  }),
}));
vi.mock("../hooks/useDobItems", () => ({
  useDobItemsPaged: () => ({ data: ROWS, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Таблицу и шапку подменяем — ловим, что им передала страница.
const gridProps = {};
vi.mock("../components/DobGrid", () => ({
  default: (props) => {
    Object.assign(gridProps, props);
    return <div data-testid="dob-grid" data-rows={JSON.stringify((props.rows || []).map((r) => r.ID))} />;
  },
}));
vi.mock("../components/DobListAppBar", () => ({ default: () => null }));

const { default: DobTasksView } = await import("../DobTasksView");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function render(userProfile) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<DobTasksView userProfile={userProfile} />);
    await new Promise((r) => setTimeout(r, 30));
  });
  return { host, root };
}

const shownIds = () => JSON.parse(document.querySelector('[data-testid="dob-grid"]').getAttribute("data-rows"));

describe("DobTasksView — что попадает в таблицу", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("обычный сотрудник: свой офис И свой департамент, все статусы", async () => {
    await render({
      userOffice: "РЦ-8114",
      userDepartment: "Департамент логистики",
      userDisplayName: "Иванов Иван",
    });
    // DC=8114 + департамент логистики → 1 и 3; статуса больше не фильтруем
    expect(shownIds()).toEqual([1, 3]);
    expect(gridProps.readOnly).toBe(true);
  });

  it("«Отдел по обеспечению бизнеса»: только офис, департамент не важен", async () => {
    await render({
      userOffice: "РЦ-8114",
      userDepartment: "Отдел по обеспечению бизнеса",
      userDisplayName: "Петрова Анна",
    });
    // DC=8114 → 1, 2, 3
    expect(shownIds()).toEqual([1, 2, 3]);
  });

  it("Поршаков Сергей видит все заявки (исключение)", async () => {
    await render({
      userOffice: "РЦ-8114",
      userDepartment: "Департамент логистики",
      userDisplayName: "Поршаков Сергей",
    });
    // все офисы и департаменты, все статусы
    expect(shownIds()).toEqual([1, 2, 3, 4]);
  });

  it("таблица только для чтения, своих фильтров и группировки у страницы нет", async () => {
    await render({ userOffice: "РЦ-8114", userDepartment: "Департамент логистики" });
    expect(gridProps.readOnly).toBe(true);
    // фильтрацию, группировку и закрепление настраивает пользователь в AG Grid
    expect(gridProps.groupByStatus).toBe(undefined);
    expect(gridProps.statusOptions).toBe(undefined);
    expect(gridProps.onStatusFilterChange).toBe(undefined);
  });
});
