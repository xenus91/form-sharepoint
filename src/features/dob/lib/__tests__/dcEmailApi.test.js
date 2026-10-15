// src/features/dob/lib/__tests__/dcEmailApi.test.js
// Связка «офис + департамент → рассылка» (DcEmail на САЙТЕ ДОБ) для создания заявки.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/dobClient", () => ({
  dobApiBase: () => "/dob-api/sites/dob/doblogistic/_api",
  dobAxios: { get: vi.fn(), post: vi.fn() },
}));

import { dobAxios } from "../../api/dobClient";
import { clearUserSearchCache } from "../../../../tasks/userSearch";
import {
  buildOffDepKey, ensureGroupPrincipal, ensureGroupPrincipals, createDcEmailItem,
  ensureDcEmailLink, dcEmailListApi, searchDobGroups, clearDcEmailGroupCache,
} from "../dcEmailApi";

const verbose = (d) => ({ data: { d } });

beforeEach(() => {
  // resetAllMocks, а не clearAllMocks: очищает и очереди mockResolvedValueOnce,
  // чтобы упавший тест не «докармливал» своими ответами следующий.
  vi.resetAllMocks();
  clearUserSearchCache();
  clearDcEmailGroupCache();
});

describe("buildOffDepKey", () => {
  it("Office + Department слитно; без обоих частей — пусто", () => {
    expect(buildOffDepKey("РЦ-8114", "Группа отгрузки")).toBe("РЦ-8114Группа отгрузки");
    expect(buildOffDepKey("РЦ-8114", "")).toBe("");
    expect(buildOffDepKey("", "Группа")).toBe("");
  });
});

describe("адресация — сайт ДОБ", () => {
  it("список DcEmail адресуется на сайте ДОБ (dobApiBase)", () => {
    expect(dcEmailListApi()).toBe("/dob-api/sites/dob/doblogistic/_api/web/lists/getbytitle('DcEmail')");
  });
});

describe("ensureGroupPrincipal", () => {
  it("берёт Id из автокомплита (поиск siteusers), подтвердив его группой — без ensureuser", async () => {
    dobAxios.get.mockResolvedValue(verbose({ Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }));
    const id = await ensureGroupPrincipal({ Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" });
    expect(id).toBe(33);
    expect(dobAxios.get.mock.calls[0][0]).toContain("/web/siteusers/getbyid(33)");
    // Id уже есть — ensureuser не вызываем (нет видимого 404 на AD/security-группах)
    expect(dobAxios.post).not.toHaveBeenCalled();
  });

  it("без Id из поиска и без группы на сайте — резолвит через _api/web/ensureuser по logonName", async () => {
    dobAxios.post.mockResolvedValue(verbose({ Id: 44 }));
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("/web/siteusers/getbyid(")) {
        return Promise.resolve(verbose({ Id: 44, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }));
      }
      return Promise.reject({ response: { status: 404 } }); // группы с таким названием на сайте нет
    });
    const id = await ensureGroupPrincipal({ Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" });
    expect(id).toBe(44);
    const [url, body] = dobAxios.post.mock.calls[0];
    // метод ВЕБА, а не коллекции siteusers
    expect(url).toBe("/dob-api/sites/dob/doblogistic/_api/web/ensureuser");
    expect(body).toEqual({ logonName: "c:0-.f|rolemanager|oob" });
  });

  it("ensureuser вернул ПОЛЬЗОВАТЕЛЯ (нет в sitegroups) и группы по Title нет → null", async () => {
    dobAxios.post.mockResolvedValue(verbose({ Id: 5 }));
    dobAxios.get.mockRejectedValue({ response: { status: 404 } });
    expect(await ensureGroupPrincipal({ LoginName: "i:0#.f|membership|ivanov@lenta.com", Title: "Иванов" })).toBeNull();
  });

  it("ensureuser 404 (AD/security-группа) → резолв по названию через sitegroups/getbyname", async () => {
    dobAxios.post.mockRejectedValue({ response: { status: 404 } });
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("/sitegroups/getbyname(")) return Promise.resolve(verbose({ Id: 77, Title: "Группа отгрузки", LoginName: "c:0+.w|s-1-5-21-1" }));
      return Promise.reject({ response: { status: 404 } });
    });
    const id = await ensureGroupPrincipal({ Title: "Группа отгрузки", LoginName: "c:0+.w|s-1-5-21-3594104448-116792928-3034854717-188109" });
    expect(id).toBe(77);
    expect(dobAxios.get.mock.calls.some(([u]) => u.includes("sitegroups/getbyname"))).toBe(true);
  });

  it("группа рассылки из AD (PrincipalType 4, нет в sitegroups) резолвится по Id из поиска", async () => {
    // Ровно случай из жизни: «_РЦ 8117 Отгрузка» — группа безопасности/рассылки.
    // sitegroups её не знает (500 «Невозможно найти группу»), поэтому типу из
    // выдачи поиска доверяем и лишних запросов не делаем.
    const id = await ensureGroupPrincipal({
      Id: 6773,
      Title: "_РЦ 8117 Отгрузка",
      LoginName: "c:0t.c|tenant|_РЦ 8117 Отгрузка",
      PrincipalType: 4,
    });
    expect(id).toBe(6773);
    expect(dobAxios.get).not.toHaveBeenCalled();
    expect(dobAxios.post).not.toHaveBeenCalled();
  });

  it("Id без PrincipalType проверяется через siteusers, а не sitegroups", async () => {
    dobAxios.get.mockResolvedValue(verbose({ Id: 88, Title: "Группа", PrincipalType: 2 }));
    expect(await ensureGroupPrincipal({ Id: 88, Title: "Группа" })).toBe(88);
    expect(dobAxios.get.mock.calls[0][0]).toContain("/web/siteusers/getbyid(88)");
  });

  it("пользователя (PrincipalType 1) группой не считаем", async () => {
    dobAxios.get.mockRejectedValue({ response: { status: 500 } });
    expect(await ensureGroupPrincipal({ Id: 5, Title: "Иванов", LoginName: "i:0#.f|membership|ivanov", PrincipalType: 1 })).toBeNull();
  });

  it("находит группу по названию в ДРУГОМ регистре — без ensureuser", async () => {
    // ensureuser принимает только точную учётную запись: «_РЦ 8117 ОТГРУЗКА» он
    // не резолвит. Сверяем название со списком групп сайта в нижнем регистре.
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("/web/sitegroups?")) {
        return Promise.resolve(verbose({ results: [
          { Id: 6773, Title: "_РЦ 8117 Отгрузка", LoginName: "c:0+.w|s-1-5-21-3594104448-188109" },
        ] }));
      }
      return Promise.reject({ response: { status: 500 } });
    });
    const id = await ensureGroupPrincipal({ Title: "_РЦ 8117 ОТГРУЗКА", LoginName: "c:0t.c|tenant|_РЦ 8117 Отгрузка" });
    expect(id).toBe(6773);
    expect(dobAxios.post).not.toHaveBeenCalled();
    // регистрозависимого фильтра по Title больше нет
    expect(dobAxios.get.mock.calls.some(([u]) => /Title(%20| )eq/.test(u))).toBe(false);
  });

  it("пустая группа — null, без запроса", async () => {
    expect(await ensureGroupPrincipal(null)).toBeNull();
    expect(dobAxios.post).not.toHaveBeenCalled();
    expect(dobAxios.get).not.toHaveBeenCalled();
  });

  it("ensureGroupPrincipals собирает резолвнутые группы", async () => {
    dobAxios.get.mockResolvedValue(verbose({ Id: 1, Title: "Гр" }));
    const out = await ensureGroupPrincipals([{ Id: 1, Title: "A", LoginName: "a" }, { Id: 2, Title: "B", LoginName: "b" }]);
    expect(out.map((g) => g.Id)).toEqual([1, 2]);
    expect(dobAxios.post).not.toHaveBeenCalled();
  });
});

describe("createDcEmailItem", () => {
  it("создаёт элемент DcEmail на сайте ДОБ с OffDepKey и EmailId-коллекцией групп", async () => {
    dobAxios.get.mockResolvedValue(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
    dobAxios.post.mockResolvedValue(verbose({ Id: 501 }));
    const item = await createDcEmailItem({ offDepKey: "РЦ-8114Группа", groupIds: [33, 44] });
    expect(item.Id).toBe(501);
    const [url, body] = dobAxios.post.mock.calls[0];
    expect(url).toBe("/dob-api/sites/dob/doblogistic/_api/web/lists/getbytitle('DcEmail')/items");
    expect(body.OffDepKey).toBe("РЦ-8114Группа");
    expect(body.EmailId).toEqual({ __metadata: { type: "Collection(Edm.Int32)" }, results: [33, 44] });
  });

  it("в ОДИНОЧНОЕ поле Email пишет просто Id, а не Collection(Edm.Int32)", async () => {
    // «Обнаружены несовместимые типы. Тип "Collection(Edm.Int32)" относится к
    // виду "Collection" вместо ожидаемого "Primitive"» — поле без AllowMultipleValues.
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("/fields?")) {
        return Promise.resolve(verbose({ results: [
          { InternalName: "Email", FieldTypeKind: 20, AllowMultipleValues: false },
        ] }));
      }
      return Promise.resolve(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
    });
    dobAxios.post.mockResolvedValue(verbose({ Id: 502 }));
    const item = await createDcEmailItem({ offDepKey: "РЦ-8117Группа отгрузки", groupIds: [6773] });
    expect(item.Id).toBe(502);
    const [url, body] = dobAxios.post.mock.calls[0];
    expect(url).toBe("/dob-api/sites/dob/doblogistic/_api/web/lists/getbytitle('DcEmail')/items");
    expect(body.EmailId).toBe(6773);
  });

  it("поле рассылки с другим именем (единственное «Пользователь или группа») — тоже одиночно", async () => {
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("/fields?")) {
        return Promise.resolve(verbose({ results: [
          { InternalName: "Title", FieldTypeKind: 2 },
          { InternalName: "OffDepKey", FieldTypeKind: 2 },
          { InternalName: "MailGroup", FieldTypeKind: 20, AllowMultipleValues: false },
        ] }));
      }
      return Promise.resolve(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
    });
    dobAxios.post.mockResolvedValue(verbose({ Id: 504 }));
    await createDcEmailItem({ offDepKey: "РЦ-8117Группа отгрузки", groupIds: [6773] });
    expect(dobAxios.post.mock.calls[0][1].MailGroupId).toBe(6773);
  });

  it("если SharePoint ждёт Primitive — повторяет POST без Collection", async () => {
    dobAxios.get.mockResolvedValue(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
    dobAxios.post
      .mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: { message: { value: "Обнаружены несовместимые типы. Тип \"Collection(Edm.Int32)\" относится к виду \"Collection\" вместо ожидаемого \"Primitive\"." } } },
        },
      })
      .mockResolvedValueOnce(verbose({ Id: 503 }));
    const item = await createDcEmailItem({ offDepKey: "РЦ-8117Группа отгрузки", groupIds: [6773] });
    expect(item.Id).toBe(503);
    expect(dobAxios.post.mock.calls[0][1].EmailId.__metadata.type).toBe("Collection(Edm.Int32)");
    expect(dobAxios.post.mock.calls[1][1].EmailId).toBe(6773);
  });

  it("обычная ошибка сервера не приводит ко второму POST", async () => {
    dobAxios.get.mockResolvedValue(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
    dobAxios.post.mockRejectedValue({ response: { status: 403, data: {} } });
    await expect(createDcEmailItem({ offDepKey: "X", groupIds: [1] })).rejects.toBeTruthy();
    expect(dobAxios.post).toHaveBeenCalledTimes(1);
  });

  it("без групп — ошибка, ничего не создаём", async () => {
    await expect(createDcEmailItem({ offDepKey: "X", groupIds: [] })).rejects.toThrow(/групп/i);
    expect(dobAxios.post).not.toHaveBeenCalled();
  });
});

describe("ensureDcEmailLink", () => {
  it("если элемент уже есть — ничего не создаём", async () => {
    dobAxios.get.mockResolvedValue(verbose({ results: [{ Id: 7, OffDepKey: "РЦ-8114Группа" }] }));
    const res = await ensureDcEmailLink({ office: "РЦ-8114", department: "Группа", groups: [] });
    expect(res.created).toBe(false);
    expect(res.item.Id).toBe(7);
    expect(dobAxios.post).not.toHaveBeenCalled();
  });

  it("если элемента нет — резолвит группы (ensureuser+sitegroups) и создаёт элемент", async () => {
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("/siteusers/getbyid(")) return Promise.resolve(verbose({ Id: 33, Title: "ООБ", PrincipalType: 8 }));
      if (url.includes("ListItemEntityTypeFullName")) return Promise.resolve(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
      return Promise.resolve(verbose({ results: [] })); // resolveDistribution — пусто
    });
    dobAxios.post
      .mockResolvedValueOnce(verbose({ Id: 33 }))  // ensureuser
      .mockResolvedValueOnce(verbose({ Id: 900 })); // создание элемента
    const res = await ensureDcEmailLink({
      office: "РЦ-8114", department: "Группа",
      groups: [{ Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }],
    });
    expect(res.created).toBe(true);
    expect(res.item.Id).toBe(900);
    // сначала ensureuser, затем создание элемента — именно в этом порядке
    expect(dobAxios.post.mock.calls[0][0]).toContain("/web/ensureuser");
    expect(dobAxios.post.mock.calls[1][0]).toContain("/web/lists/getbytitle('DcEmail')/items");
    expect(dobAxios.post.mock.calls[1][1].EmailId.results).toEqual([33]);
  });
});

describe("searchDobGroups", () => {
  it("ищет ГРУППЫ на сайте ДОБ через siteusers с фильтром PrincipalType ne 1", async () => {
    dobAxios.get.mockResolvedValue(verbose({ results: [{ Id: 33, Title: "ООБ", LoginName: "oob", PrincipalType: 8 }] }));
    const found = await searchDobGroups("ООБ");
    expect(found.map((g) => g.Id)).toEqual([33]);
    const url = dobAxios.get.mock.calls[0][0];
    expect(url.startsWith("/dob-api/sites/dob/doblogistic/_api/web/siteusers")).toBe(true);
    expect(url).toContain("PrincipalType ne 1");
  });

  it("поиск группы не зависит от регистра (локальный фолбэк по siteusers)", async () => {
    dobAxios.get.mockImplementation((url) => {
      if (url.includes("$top=1000")) {
        return Promise.resolve(verbose({ results: [
          { Id: 6773, Title: "_РЦ 8117 Отгрузка", LoginName: "c:0t.c|tenant|rc8117", PrincipalType: 4 },
        ] }));
      }
      return Promise.resolve(verbose({ results: [] })); // серверный substringof регистр не пережил
    });
    const found = await searchDobGroups("_рц 8117 отгрузка");
    expect(found.map((g) => g.Id)).toEqual([6773]);
  });

  it("отбрасывает пользователей (PrincipalType = 1), даже если сервер вернул", async () => {
    dobAxios.get.mockResolvedValue(verbose({ results: [
      { Id: 1, Title: "Иванов", LoginName: "i:0#.f|membership|ivanov@lenta.com", PrincipalType: 1 },
      { Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob", PrincipalType: 8 },
    ] }));
    const found = await searchDobGroups("о");
    expect(found.map((g) => g.Id)).toEqual([33]);
  });
});
