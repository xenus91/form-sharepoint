// src/features/dob/components/requestForm/__tests__/requestDefaults.test.js
// Значения по умолчанию: DC ← Office, InitiatingDepartment ← Department.

import { describe, it, expect } from "vitest";
import { buildPrefillValues, fitPrefillValue, officeSuffix } from "../requestDefaults";

const c = (internalName, kind, extra = {}) => ({ internalName, kind, title: internalName, choices: [], ...extra });
const profile = { userOffice: "РЦ-8114", userDepartment: "Группа отгрузки РЦ" };

describe("buildPrefillValues", () => {
  it("DC ← Office, InitiatingDepartment ← Department (текстовые поля)", () => {
    expect(buildPrefillValues([
      c("DC", "text"),
      c("InitiatingDepartment", "text"),
      c("Title", "text"),
    ], profile)).toEqual({ DC: "РЦ-8114", InitiatingDepartment: "Группа отгрузки РЦ" });
  });

  it("имена полей сопоставляются без учёта регистра", () => {
    expect(buildPrefillValues([c("dc", "text"), c("initiatingDepartment", "text")], profile))
      .toEqual({ dc: "РЦ-8114", initiatingDepartment: "Группа отгрузки РЦ" });
  });

  it("«Не указано» из профиля не подставляем", () => {
    expect(buildPrefillValues([c("DC", "text")], { userOffice: "Не указано" })).toEqual({});
    expect(buildPrefillValues([c("DC", "text")], {})).toEqual({});
    expect(buildPrefillValues([c("DC", "text")], null)).toEqual({});
  });

  it("в Choice пишем только существующий вариант", () => {
    // есть вариант «РЦ-8114» — берём его
    expect(buildPrefillValues([c("DC", "select", { choices: ["РЦ-8114", "РЦ-8117"] })], profile))
      .toEqual({ DC: "РЦ-8114" });
    // в списке только номер РЦ — подставляем суффикс офиса
    expect(buildPrefillValues([c("DC", "select", { choices: ["8114", "8117"] })], profile))
      .toEqual({ DC: "8114" });
    // подходящего варианта нет — поле остаётся пустым (иначе SharePoint откажет)
    expect(buildPrefillValues([c("DC", "select", { choices: ["Москва"] })], profile)).toEqual({});
  });

  it("MultiChoice и число — только если значение подходит", () => {
    expect(buildPrefillValues([c("DC", "multichoice", { choices: ["РЦ-8114"] })], profile))
      .toEqual({ DC: ["РЦ-8114"] });
    expect(buildPrefillValues([c("DC", "multichoice", { choices: ["Москва"] })], profile)).toEqual({});
    expect(buildPrefillValues([c("DC", "number")], { userOffice: "8114" })).toEqual({ DC: "8114" });
    expect(buildPrefillValues([c("DC", "number")], profile)).toEqual({});
  });

  it("людей и флаги из профиля не выдумываем", () => {
    expect(fitPrefillValue(c("DC", "person"), "РЦ-8114")).toBeUndefined();
    expect(fitPrefillValue(c("DC", "boolean"), "РЦ-8114")).toBeUndefined();
  });

  it("officeSuffix: «РЦ-8114» → «8114»", () => {
    expect(officeSuffix("РЦ-8114")).toBe("8114");
    expect(officeSuffix("8114")).toBe("8114");
    expect(officeSuffix("Не указано")).toBe("");
  });
});
