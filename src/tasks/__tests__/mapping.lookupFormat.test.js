// src/tasks/__tests__/mapping.lookupFormat.test.js
// Регрессия 2026-10-03: «Исполнитель» и «Кому назначено» оставались пустыми
// у задач внешних списков — они отдают lookup-поля как { results: [{Id, Title}] },
// а mapRawTask читал только { Id, Title } (формат основного сайта).

import { describe, it, expect } from "vitest";
import { mapRawTask } from "../mapping";

describe("mapRawTask — форматы lookup-полей", () => {
  it("внешний список: AssignedTo/Editor в verbose-формате { results: [...] }", () => {
    const t = mapRawTask({
      Id: 1,
      Title: "Заявка ООБ",
      AssignedTo: { results: [{ Id: 207, Title: "Поршаков Сергей" }] },
      Editor: { results: [{ Id: 33, Title: "ООБ" }] },
    });
    expect(t.AssignedTo).toBe("Поршаков Сергей");
    expect(t.AssignedToId).toBe(207);
    expect(t.EditorTitle).toBe("ООБ");
    expect(t.EditorId).toBe(33);
  });

  it("основной сайт: { Id, Title } не сломан", () => {
    const t = mapRawTask({
      Id: 10,
      AssignedTo: { Id: 207, Title: "Поршаков Сергей" },
      Editor: { Id: 207, Title: "Поршаков Сергей" },
    });
    expect(t.AssignedTo).toBe("Поршаков Сергей");
    expect(t.AssignedToId).toBe(207);
    expect(t.EditorTitle).toBe("Поршаков Сергей");
  });

  it("пустой Editor не затирает AssignedTo, строковый вариант поддерживается", () => {
    const t = mapRawTask({ Id: 2, AssignedTo: "ООБ", Editor: null });
    expect(t.AssignedTo).toBe("ООБ");
    expect(t.EditorTitle).toBe("");
  });
});
