// src/features/dob/components/requestForm/__tests__/toCreatePayload.test.js
// Значения формы создания заявки → payload SharePoint.

import { describe, it, expect } from "vitest";
import { toCreatePayload, asUserList } from "../toCreatePayload";

const c = (internalName, kind, extra = {}) => ({ internalName, kind, title: internalName, ...extra });

describe("toCreatePayload", () => {
  it("текст, выбор, дата, число, флаг", () => {
    const controls = [
      c("Title", "text"),
      c("Status", "choice"),
      c("DueDate", "date"),
      c("Count", "number"),
      c("Urgent", "boolean"),
    ];
    expect(toCreatePayload(controls, {
      Title: "Заявка ООБ", Status: "Открыт", DueDate: "2026-10-20", Count: "12,5", Urgent: true,
    })).toEqual({ Title: "Заявка ООБ", Status: "Открыт", DueDate: "2026-10-20", Count: 12.5, Urgent: true });
  });

  it("пустые необязательные поля в payload не попадают", () => {
    const payload = toCreatePayload([c("Title", "text"), c("Note", "multiline")], { Title: "x", Note: "  " });
    expect(Object.keys(payload)).toEqual(["Title"]);
  });

  it("люди → <Поле>Id: число или Collection(Edm.Int32)", () => {
    const single = toCreatePayload([c("AssignedTo", "person", { multiple: false })], {
      AssignedTo: [{ Id: 207, Title: "Поршаков Сергей" }],
    });
    expect(single).toEqual({ AssignedToId: 207 });

    const multi = toCreatePayload([c("AssignedTo", "person", { multiple: true })], {
      AssignedTo: [{ Id: 207 }, { Id: 33 }],
    });
    expect(multi.AssignedToId).toEqual({ __metadata: { type: "Collection(Edm.Int32)" }, results: [207, 33] });
  });

  it("MultiChoice → строка «a;#b»", () => {
    expect(toCreatePayload([c("Problems", "multichoice")], { Problems: ["Паллета", "ТКН"] }))
      .toEqual({ Problems: "Паллета;#ТКН" });
  });

  it("поле результата добавляется, если выбрано", () => {
    expect(toCreatePayload([c("Title", "text")], { Title: "x" }, { internalName: "DobSearchResult" }, "Найдена"))
      .toEqual({ Title: "x", DobSearchResult: "Найдена" });
    expect(toCreatePayload([], {}, { internalName: "DobSearchResult" }, "")).toEqual({});
  });

  it("asUserList терпит строки и объекты", () => {
    expect(asUserList([{ Id: 1 }, "2", null]).map((u) => u.Id)).toEqual([1, 2]);
    expect(asUserList(null)).toEqual([]);
  });
});
