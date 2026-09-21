import { describe, it, expect } from "vitest";
import { toDomainTask } from "../taskModel";

const rawSearch = {
  Id: 531,
  Title: "Поиск ЕО",
  Body: "<div>Тест</div>",
  AssignedTo: { Id: 7, Title: "User" },
  AssignedToId: 7,
  Status: "В процессе выполнения",
  ResultSearchTHU: "Найдена",
  Location1: "A-1",
  AdditionalActionsRequired: "Да",
  AdditionalActions: { results: ["Отправить ЕО в OTM"] },
  Created: "2026-09-18T10:00:00Z",
  Modified: "2026-09-18T10:05:00Z",
  PercentComplete: 0.5,
  RelatedItems: JSON.stringify([{ ListId: "{guid}", ItemId: 24785 }]),
  ContentTypeId: { StringValue: "0x01080100ABCDEF01" },
  ContentType: { Name: "Поиск ЕО" },
};

const rawComplete = {
  Id: 532,
  Title: "Завершение поиска ЕО",
  Status: "Завершена",
  ResultSearchComplete: "Выполнено", // другое поле — mapping должен подхватить через fallback
  RelatedItems: [{ ListId: "{guid}", ItemId: 24785 }],
  ContentTypeId: "0x01080100ABCDEF02",
  PercentComplete: 1,
};

describe("toDomainTask", () => {
  it("maps search task with RelatedItems string", () => {
    const d = toDomainTask(rawSearch);
    expect(d.id).toBe(531);
    expect(d.title).toBe("Поиск ЕО");
    expect(d.assignedTo).toEqual({ id: 7, title: "User" });
    expect(d.contentTypeId).toBe("0x01080100ABCDEF01");
    expect(d.contentTypeName).toBe("Поиск ЕО");
    expect(d.relatedProblem).toEqual(expect.objectContaining({ listId: "guid", itemId: 24785 }));
    expect(d.result.value).toBe("Найдена");
    expect(d.additionalActions.value).toEqual(["Отправить ЕО в OTM"]);
    expect(d.additionalActions.required).toBe("Да");
  });

  it("maps completion task with different Result field via fallback", () => {
    const d = toDomainTask(rawComplete);
    expect(d.id).toBe(532);
    // mapping ищет любой *result* ключ, поэтому ResultSearchComplete попадёт в ResultValue
    expect(d.result.value).toBe("Выполнено");
    expect(d.relatedProblem.itemId).toBe(24785);
  });

  it("keeps raw for resolver", () => {
    const d = toDomainTask(rawSearch);
    expect(d.raw).toBe(rawSearch);
    expect(d.Recipient).toBeDefined();
  });
});
