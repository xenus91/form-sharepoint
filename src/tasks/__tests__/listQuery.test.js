// src/tasks/__tests__/listQuery.test.js
// Регрессия multi-source: select для внешнего источника (dob) не должен
// запрашивать поля, которых там нет (ResultSearchTHU, Location1, OffDepKey,
// AdditionalActions) — иначе SharePoint 400 «Столбец … не существует» и в
// таблице #tasks не было ни одной задачи.

import { describe, it, expect } from "vitest";
import { buildTaskListQuery, readSelectFields } from "../listQuery";

const DOB_API = "/web/lists(guid'03fc1b92-baff-44dc-b8a3-d04acbe329d3')";

// Реальный набор полей списка RequestsTask (по ответу пользователя):
// Title, Body, AssignedTo, Status, Created, Modified, PercentComplete, DueDate,
// Editor, ContentTypeId, RelatedItems.
const DOB_FIELDS = [
  "Id", "Title", "Body", "AssignedTo", "Status", "Created", "Modified",
  "PercentComplete", "DueDate", "Editor", "ContentTypeId", "RelatedItems",
];

function parse(url) {
  const q = url.slice(url.indexOf("?") + 1);
  const out = {};
  for (const part of q.split("&")) {
    const [k, v] = part.split("=");
    out[k] = decodeURIComponent(v || "");
  }
  return out;
}

describe("buildTaskListQuery — профиль external (внешний источник)", () => {
  const url = buildTaskListQuery({
    listApi: DOB_API,
    taskFieldNames: DOB_FIELDS,
    selectProfile: "external",
    assignedIds: [207],
    currentUserId: 207,
    excludeCompleted: true,
  });
  const params = parse(url);
  const select = params.$select.split(",");

  it("не запрашивает поля результата и main-only поля", () => {
    expect(select).not.toContain("ResultSearchTHU");
    expect(select).not.toContain("Location1");
    expect(select).not.toContain("OffDepKey");
    expect(select).not.toContain("AdditionalsActionsRequired");
    expect(select).not.toContain("AdditionalActions");
  });

  it("берёт ядро и RelatedItems", () => {
    expect(select).toContain("Id");
    expect(select).toContain("Title");
    expect(select).toContain("Body");
    expect(select).toContain("AssignedTo/Id");
    expect(select).toContain("AssignedTo/Title");
    expect(select).toContain("Status");
    expect(select).toContain("DueDate");
    expect(select).toContain("ContentTypeId");
    expect(select).toContain("RelatedItems");
  });

  it("фильтр — AssignedToId + исключение завершённых", () => {
    expect(params.$filter).toBe("AssignedToId eq 207 and (PercentComplete eq null or PercentComplete ne 1)");
    expect(params.$expand).toBe("AssignedTo,Editor");
  });
});

describe("buildTaskListQuery — фильтр по пользователю и группе из DcEmail", () => {
  it("assignedIds объединяются в OR-фильтр", () => {
    const url = buildTaskListQuery({
      listApi: "/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')",
      taskFieldNames: [],
      assignedIds: [207, 33, 34, 33],
    });
    expect(parse(url).$filter).toBe("(AssignedToId eq 207 or AssignedToId eq 33 or AssignedToId eq 34)");
  });

  it("нет валидных Id → заведомо пустой фильтр", () => {
    const url = buildTaskListQuery({ listApi: "/web/lists(guid'X')", assignedIds: [null, NaN] });
    // assignedIds непустой массив, но без валидных значений
    expect(parse(url).$filter).toBe("AssignedToId eq -1");
  });
});

describe("buildTaskListQuery — профиль main (не меняем поведение)", () => {
  it("оставляет ResultSearchTHU/Location1/доп.действия", () => {
    const url = buildTaskListQuery({
      listApi: "/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')",
      taskFieldNames: [],
      selectProfile: "main",
      resultFieldInternalNames: ["ResultSearchTHU"],
      currentUserId: 1,
      assignedIds: [1],
    });
    const select = parse(url).$select.split(",");
    expect(select).toContain("ResultSearchTHU");
    expect(select).toContain("Location1");
    expect(select).toContain("AdditionalActions");
  });
});

describe("buildTaskListQuery — omittedFields (после 400-ретрая)", () => {
  it("исключает названное SharePoint поле из select", () => {
    const url = buildTaskListQuery({
      listApi: "/web/lists(guid'X')",
      taskFieldNames: DOB_FIELDS,
      selectProfile: "external",
      omittedFields: ["Body", "DUEdate"],
      assignedIds: [1],
    });
    const select = parse(url).$select.split(",");
    expect(select).not.toContain("Body");
    expect(select).not.toContain("DueDate");
    expect(select).toContain("Title");
  });
});

describe("readSelectFields", () => {
  it("достаёт поля из $select", () => {
    const url = buildTaskListQuery({ listApi: "/web/lists(guid'X')", taskFieldNames: DOB_FIELDS, selectProfile: "external", assignedIds: [1] });
    expect(readSelectFields(url)).toContain("AssignedTo/Id");
  });
});
