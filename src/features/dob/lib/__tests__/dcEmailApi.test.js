// src/features/dob/lib/__tests__/dcEmailApi.test.js
// Связка «офис + департамент → рассылка» (DcEmail) для создания заявки.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import apiClient from "../../../../api";
import {
  buildOffDepKey, ensureGroupPrincipal, ensureGroupPrincipals, createDcEmailItem, ensureDcEmailLink,
} from "../dcEmailApi";

const verbose = (d) => ({ data: { d } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildOffDepKey", () => {
  it("Office + Department слитно; без обоих частей — пусто", () => {
    expect(buildOffDepKey("РЦ-8114", "Группа отгрузки")).toBe("РЦ-8114Группа отгрузки");
    expect(buildOffDepKey("РЦ-8114", "")).toBe("");
    expect(buildOffDepKey("", "Группа")).toBe("");
  });
});

describe("ensureGroupPrincipal", () => {
  it("резолвит группу через siteusers/ensureuser по LoginName", async () => {
    apiClient.post.mockResolvedValue(verbose({ Id: 33 }));
    const id = await ensureGroupPrincipal({ Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" });
    expect(id).toBe(33);
    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toBe("/web/siteusers/ensureuser");
    expect(body).toEqual({ loginName: "c:0-.f|rolemanager|oob" });
  });

  it("если у группы нет LoginName — резолвит по Title", async () => {
    apiClient.post.mockResolvedValue(verbose({ Id: 44 }));
    const id = await ensureGroupPrincipal({ Title: "Группа отгрузки" });
    expect(id).toBe(44);
    expect(apiClient.post.mock.calls[0][1]).toEqual({ loginName: "Группа отгрузки" });
  });

  it("пустая группа — null, без запроса", async () => {
    expect(await ensureGroupPrincipal(null)).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("ensureGroupPrincipals собирает резолвнутые группы", async () => {
    apiClient.post
      .mockResolvedValueOnce(verbose({ Id: 1 }))
      .mockResolvedValueOnce(verbose({ Id: 2 }));
    const out = await ensureGroupPrincipals([{ Title: "A", LoginName: "a" }, { Title: "B", LoginName: "b" }]);
    expect(out.map((g) => g.Id)).toEqual([1, 2]);
  });
});

describe("createDcEmailItem", () => {
  it("создаёт элемент DcEmail с OffDepKey и EmailId-коллекцией групп", async () => {
    apiClient.get.mockResolvedValue(verbose({ ListItemEntityTypeFullName: "SP.Data.DcEmailListItem" }));
    apiClient.post.mockResolvedValue(verbose({ Id: 501 }));
    const item = await createDcEmailItem({ offDepKey: "РЦ-8114Группа", groupIds: [33, 44] });
    expect(item.Id).toBe(501);
    const [url, body] = apiClient.post.mock.calls[0];
    expect(url).toBe("/web/lists/getbytitle('DcEmail')/items");
    expect(body.OffDepKey).toBe("РЦ-8114Группа");
    expect(body.EmailId).toEqual({ __metadata: { type: "Collection(Edm.Int32)" }, results: [33, 44] });
  });

  it("без групп — ошибка, ничего не создаём", async () => {
    await expect(createDcEmailItem({ offDepKey: "X", groupIds: [] })).rejects.toThrow(/групп/i);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe("ensureDcEmailLink", () => {
  it("если элемент уже есть — ничего не создаём", async () => {
    // resolveDistributionViaDcEmail нашёл существующий элемент
    apiClient.get.mockResolvedValue(verbose({ results: [{ Id: 7, OffDepKey: "РЦ-8114Группа" }] }));
    const res = await ensureDcEmailLink({ office: "РЦ-8114", department: "Группа", groups: [] });
    expect(res.created).toBe(false);
    expect(res.item.Id).toBe(7);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("если элемента нет — резолвит группы (ensureuser) и создаёт элемент", async () => {
    // 1) resolveDistributionViaDcEmail: серверный фильтр пуст, фолбэк пуст, без-expand пуст
    apiClient.get.mockResolvedValue(verbose({ results: [] }));
    // ensureuser → 33; затем создание элемента
    apiClient.post
      .mockResolvedValueOnce(verbose({ Id: 33 }))
      .mockResolvedValueOnce(verbose({ Id: 900 }));
    const res = await ensureDcEmailLink({
      office: "РЦ-8114", department: "Группа",
      groups: [{ Title: "ООБ", LoginName: "c:0-.f|rolemanager|oob" }],
    });
    expect(res.created).toBe(true);
    expect(res.item.Id).toBe(900);
    // сначала ensureuser, затем создание элемента — именно в этом порядке
    expect(apiClient.post.mock.calls[0][0]).toBe("/web/siteusers/ensureuser");
    expect(apiClient.post.mock.calls[1][0]).toBe("/web/lists/getbytitle('DcEmail')/items");
    expect(apiClient.post.mock.calls[1][1].EmailId.results).toEqual([33]);
  });
});
