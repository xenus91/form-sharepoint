// src/features/tasks/hooks/__tests__/useCurrentUser.name.test.js
//
// Какое имя текущего пользователя считать ФИО.
// Профиль приходит из SP.UserProfiles.PeopleManager/GetMyProperties:
// userDisplayName — это PreferredName (отображаемое имя), а userTitle — d.Title
// того же ответа, где бывает учётная запись. Раньше приоритет был обратный, и
// учётная запись уезжала в «Исполнитель».
import { describe, it, expect } from "vitest";
import { pickCurrentUserName } from "../useCurrentUser";

const NAME = "Поршаков Сергей";
const ACCOUNT = "i:0#.w|retail\\sergey.porshakov";

describe("pickCurrentUserName", () => {
  it("PreferredName важнее Title из профиля", () => {
    expect(pickCurrentUserName({ userDisplayName: NAME, userTitle: ACCOUNT })).toBe(NAME);
  });

  it("нет PreferredName — берём Title (лучше так, чем пустое имя)", () => {
    expect(pickCurrentUserName({ userDisplayName: "", userTitle: NAME })).toBe(NAME);
  });

  it("заглушку «Не указано» именем не считаем", () => {
    expect(pickCurrentUserName({ userDisplayName: "Не указано", userTitle: NAME })).toBe(NAME);
    expect(pickCurrentUserName({ userDisplayName: "не указано", userTitle: NAME })).toBe(NAME);
  });

  it("обе заглушки — пустая строка, а не «Не указано» в интерфейсе", () => {
    expect(pickCurrentUserName({ userDisplayName: "Не указано", userTitle: "Не указано" })).toBe("");
  });

  it("профиля нет вовсе — пустая строка, не падает", () => {
    expect(pickCurrentUserName(null)).toBe("");
    expect(pickCurrentUserName(undefined)).toBe("");
    expect(pickCurrentUserName({})).toBe("");
  });

  it("пробелы по краям срезаются", () => {
    expect(pickCurrentUserName({ userDisplayName: `  ${NAME}  ` })).toBe(NAME);
  });
});
