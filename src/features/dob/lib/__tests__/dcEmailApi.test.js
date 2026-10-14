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
  ensureDcEmailLink, dcEmailListApi, searchDobGroups,
} from "../dcEmailApi";

const verbose = (d) => ({ data: { d } });

beforeEach(() => {
  vi.clearAllMocks();
  clearUserSearchCache();
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
  it("резолвит группу через siteusers/ensureuser на сайте ДОБ по LoginName и подтверждает группой", async () => {
    dobAxios.post.mockResolvedValue(verbose({ Id: 33 }));
    dobAxios.get.mockResolvedValue(verbose({ Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }));
    const id = await ensureGroupPrincipal({ Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" });
    expect(id).toBe(33);
    const [url, body] = dobAxios.post.mock.calls[0];
    expect(url).toBe("/dob-api/sites/dob/doblogistic/_api/web/siteusers/ensureuser");
    expect(body).toEqual({ loginName: "c:0-.f|rolemanager|oob" });
    // обязательная проверка: принципал есть в sitegroups (значит это группа)
    expect(dobAxios.get.mock.calls[0][0]).toBe("/dob-api/sites/dob/doblogistic/_api/web/sitegroups/getbyid(33)");
  });

  it("ensureuser вернул ПОЛЬЗОВАТЕЛЯ (нет в sitegroups) → null (не группу не берём)", async () => {
    dobAxios.post.mockResolvedValue(verbose({ Id: 5 }));
    dobAxios.get.mockRejectedValue({ response: { status: 404 } });
    expect(await ensureGroupPrincipal({ LoginName: "i:0#.f|membership|ivanov@lenta.com" })).toBeNull();
  });

  it("если у группы нет LoginName — резолвит по Title", async () => {
    dobAxios.post.mockResolvedValue(verbose({ Id: 44 }));
    dobAxios.get.mockResolvedValue(verbose({ Id: 44, Title: "Группа отгрузки" }));
    const id = await ensureGroupPrincipal({ Title: "Группа отгрузки" });
    expect(id).toBe(44);
    expect(dobAxios.post.mock.calls[0][1]).toEqual({ loginName: "Группа отгрузки" });
  });

  it("пустая группа — null, без запроса", async () => {
    expect(await ensureGroupPrincipal(null)).toBeNull();
    expect(dobAxios.post).not.toHaveBeenCalled();
  });

  it("ensureGroupPrincipals собирает резолвнутые группы", async () => {
    dobAxios.post
      .mockResolvedValueOnce(verbose({ Id: 1 }))
      .mockResolvedValueOnce(verbose({ Id: 2 }));
    dobAxios.get.mockResolvedValue(verbose({ Id: 1, Title: "Гр" }));
    const out = await ensureGroupPrincipals([{ Title: "A", LoginName: "a" }, { Title: "B", LoginName: "b" }]);
    expect(out.map((g) => g.Id)).toEqual([1, 2]);
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
      if (url.includes("/sitegroups/getbyid(")) return Promise.resolve(verbose({ Id: 33, Title: "ООБ" }));
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
    expect(dobAxios.post.mock.calls[0][0]).toContain("/web/siteusers/ensureuser");
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

  it("отбрасывает пользователей (PrincipalType = 1), даже если сервер вернул", async () => {
    dobAxios.get.mockResolvedValue(verbose({ results: [
      { Id: 1, Title: "Иванов", LoginName: "i:0#.f|membership|ivanov@lenta.com", PrincipalType: 1 },
      { Id: 33, Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob", PrincipalType: 8 },
    ] }));
    const found = await searchDobGroups("о");
    expect(found.map((g) => g.Id)).toEqual([33]);
  });
});
