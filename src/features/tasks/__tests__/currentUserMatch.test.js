// src/features/tasks/__tests__/currentUserMatch.test.js
// «Моя ли это задача»: ложное «Задача уже взята другим пользователем» для самого
// исполнителя недопустимо («я и есть Поршаков Сергей!»).

import { describe, it, expect } from "vitest";
import {
  accountLocalPart,
  isTaskTakenByCurrentUser,
  loginsMatch,
  normalizePersonName,
  personNamesMatch,
  takerIdOf,
  takerTitleOf,
} from "../lib/currentUserMatch";

describe("currentUserMatch — ФИО", () => {
  it("нормализация: регистр, ё→е, пунктуация", () => {
    expect(normalizePersonName("  Поршаков  Сергей, ")).toBe("поршаков сергей");
    expect(normalizePersonName("Пётр")).toBe("петр");
  });

  it("порядок слов и отчество не мешают: «Поршаков Сергей» = «Сергей Поршаков Александрович»", () => {
    expect(personNamesMatch("Поршаков Сергей", "Поршаков Сергей")).toBe(true);
    expect(personNamesMatch("Сергей Поршаков", "Поршаков Сергей")).toBe(true);
    expect(personNamesMatch("Поршаков Сергей", "Поршаков Сергей Александрович")).toBe(true);
    expect(personNamesMatch("Поршаков Сергей Александрович", "Поршаков Сергей")).toBe(true);
  });

  it("разные люди не совпадают", () => {
    expect(personNamesMatch("Иванов Пётр", "Поршаков Сергей")).toBe(false);
    expect(personNamesMatch("Иванов Пётр", "")).toBe(false);
    expect(personNamesMatch("", "Иванов Пётр")).toBe(false);
    // однофамильцы с разными именами
    expect(personNamesMatch("Иванов Пётр", "Иванов Сергей")).toBe(false);
  });

  it("учётная запись: локальная часть и домен", () => {
    expect(accountLocalPart("i:0#.f|membership|porshakov_sa@lenta.com")).toBe("porshakov_sa");
    expect(loginsMatch("i:0#.f|membership|ivanov_ii@lenta.com", "ivanov_ii")).toBe(true);
    expect(loginsMatch("lenta\\ivanov.ii", "ivanov.ii@lenta.com")).toBe(true);
    expect(loginsMatch("ivanov.ii", "petrov.pp")).toBe(false);
  });
});

describe("currentUserMatch — взял ли задачу текущий пользователь", () => {
  const me = { currentUserId: 207, currentUserTitle: "Поршаков Сергей Александрович" };

  it("Id взявшего совпал — задача моя", () => {
    expect(isTaskTakenByCurrentUser({ EditorId: 207, EditorTitle: "Кто-то" }, me)).toBe(true);
  });

  it("Id на сайте источника (id≠main) — тоже моя", () => {
    const task = { sourceId: "dob", EditorId: 555, EditorTitle: "" };
    expect(isTaskTakenByCurrentUser(task, { ...me, currentUserIdBySource: { dob: 555, main: 207 } })).toBe(true);
  });

  it("«Поршаков Сергей» при текущем «Сергей Поршаков Александрович» — моя (главный кейс)", () => {
    expect(isTaskTakenByCurrentUser({ EditorTitle: "Поршаков Сергей" }, me)).toBe(true);
    expect(isTaskTakenByCurrentUser({ Editor: "Поршаков Сергей" }, me)).toBe(true);
    expect(isTaskTakenByCurrentUser({ raw: { Editor: { Id: 999, Title: "Поршаков Сергей" } } }, me)).toBe(true);
  });

  it("Id с чужого сайта не считается моим (разные сайты — разные Id)", () => {
    const task = { sourceId: "dob", EditorId: 207, EditorTitle: "" };
    expect(isTaskTakenByCurrentUser(task, { ...me, currentUserIdBySource: { dob: 555, main: 207 } })).toBe(false);
  });

  it("взял другой пользователь — не моя", () => {
    expect(isTaskTakenByCurrentUser({ EditorId: 12, EditorTitle: "Иванов Пётр" }, me)).toBe(false);
  });

  it("пустые признаки → не моя (нет данных — нет ложного «моя»)", () => {
    expect(isTaskTakenByCurrentUser({}, me)).toBe(false);
    expect(isTaskTakenByCurrentUser({ EditorTitle: "Поршаков Сергей" }, {})).toBe(false);
  });

  it("чтение Id/ФИО из разных форм задачи", () => {
    expect(takerIdOf({ raw: { Editor: { Id: 5 } } })).toBe(5);
    expect(takerIdOf({ EditorId: "7" })).toBe(7);
    expect(takerTitleOf({ Editor: { Title: "Поршаков Сергей" } })).toBe("Поршаков Сергей");
    expect(takerTitleOf({ raw: { Editor: { results: [{ Title: "Поршаков Сергей" }] } } })).toBe("Поршаков Сергей");
  });

  it("логин текущего пользователя тоже учитывается", () => {
    const task = { raw: { Editor: { LoginName: "i:0#.f|membership|porshakov_sa@lenta.com" } } };
    expect(isTaskTakenByCurrentUser(task, {
      currentUserId: null,
      currentUserTitle: "",
      currentUserLogins: ["porshakov_sa@lenta.com"],
    })).toBe(true);
  });
});
