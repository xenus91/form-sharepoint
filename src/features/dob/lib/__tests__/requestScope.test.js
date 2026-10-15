// src/features/dob/lib/__tests__/requestScope.test.js
// Правило «кто какие заявки видит» в #dob_requests.

import { describe, it, expect } from "vitest";
import {
  buildRequestScope,
  applyRequestScope,
  scopeFieldInternals,
  isScopeExempt,
  isOobDepartment,
  officeVariants,
} from "../requestScope";

const FIELDS = [
  { InternalName: "ID", Title: "ID", TypeAsString: "Counter" },
  { InternalName: "DC", Title: "РЦ", TypeAsString: "Choice" },
  { InternalName: "InitiatingDepartment", Title: "Департамент", TypeAsString: "Text" },
  { InternalName: "Status", Title: "Статус", TypeAsString: "Choice" },
];

const ROWS = [
  { ID: 1, DC: "8114", InitiatingDepartment: "Департамент логистики", Status: "Открыт" },
  { ID: 2, DC: "8114", InitiatingDepartment: "Департамент продаж", Status: "Открыт" },
  { ID: 3, DC: "8200", InitiatingDepartment: "Департамент логистики", Status: "Открыт" },
];

describe("правило видимости заявок", () => {
  it("обычный сотрудник: DC = Office И InitiatingDepartment = Department", () => {
    const scope = buildRequestScope({
      office: "РЦ-8114",
      department: "Департамент логистики",
      displayName: "Иванов Иван",
    });
    expect(scope.mode).toBe("office+department");

    const { rows, warning } = applyRequestScope(ROWS, { fields: FIELDS, scope });
    expect(warning).toBe("");
    expect(rows.map((r) => r.ID)).toEqual([1]);
  });

  it("«Отдел по обеспечению бизнеса»: достаточно DC = Office", () => {
    const scope = buildRequestScope({
      office: "РЦ-8114",
      department: "Отдел по обеспечению бизнеса",
      displayName: "Петрова Анна",
    });
    expect(scope.mode).toBe("office");

    const { rows } = applyRequestScope(ROWS, { fields: FIELDS, scope });
    expect(rows.map((r) => r.ID)).toEqual([1, 2]);
  });

  it("Поршаков Сергей — исключение: видит все заявки", () => {
    const scope = buildRequestScope({
      office: "РЦ-8114",
      department: "Департамент логистики",
      displayName: "Поршаков Сергей Иванович",
    });
    expect(scope.mode).toBe("all");
    expect(scope.warning).toBe("");

    const { rows } = applyRequestScope(ROWS, { fields: FIELDS, scope });
    expect(rows.map((r) => r.ID)).toEqual([1, 2, 3]);
  });

  it("исключение не срабатывает на чужом ФИО", () => {
    expect(isScopeExempt("Иванов Сергей")).toBe(false);
    expect(isScopeExempt("Поршаков Сергей")).toBe(true);
    expect(isScopeExempt("ПОРШАКОВ  сергей иванович")).toBe(true);
  });

  it("нет Office/Department в профиле — фильтр не применяется, но предупреждаем", () => {
    const noOffice = buildRequestScope({ office: "", department: "Департамент логистики" });
    expect(noOffice.mode).toBe("all");
    expect(noOffice.warning).toContain("не указан Office");

    const noDept = buildRequestScope({ office: "РЦ-8114", department: "Не указано" });
    expect(noDept.mode).toBe("all");
    expect(noDept.warning).toContain("не указан Department");
  });

  it("нет колонки DC в списке — не фильтруем молча, а предупреждаем", () => {
    const scope = buildRequestScope({ office: "РЦ-8114", department: "Департамент логистики" });
    const { rows, warning } = applyRequestScope(ROWS, {
      fields: [{ InternalName: "Status", Title: "Статус" }],
      scope,
    });
    expect(rows).toHaveLength(3);
    expect(warning).toContain("DC");
  });

  it("значение Choice объектом и OData__-префикс понимаются", () => {
    const scope = buildRequestScope({ office: "8114", department: "Департамент логистики" });
    const rows = [
      { ID: 7, DC: { Value: "8114" }, InitiatingDepartment: "Департамент логистики" },
      { ID: 8, OData__DC: "РЦ-8114", InitiatingDepartment: "Департамент логистики" },
      { ID: 9, DC: { results: [{ Value: "8200" }] }, InitiatingDepartment: "Департамент логистики" },
    ];
    const filtered = applyRequestScope(rows, { fields: FIELDS, scope });
    expect(filtered.rows.map((r) => r.ID)).toEqual([7, 8]);
  });

  it("колонки ищутся и по InternalName, и по Title; офис — с учётом «РЦ-»", () => {
    expect(scopeFieldInternals(FIELDS)).toEqual({ dc: "DC", department: "InitiatingDepartment" });
    expect(scopeFieldInternals([{ InternalName: "x1", Title: "DC" }]).dc).toBe("x1");
    expect(officeVariants("РЦ-8114")).toEqual(["рц-8114", "8114"]);
    expect(isOobDepartment("Отдел по обеспечению бизнеса (ООБ)")).toBe(true);
  });
});
