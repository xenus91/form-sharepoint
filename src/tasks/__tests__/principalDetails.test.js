// src/tasks/__tests__/principalDetails.test.js
// DcEmail.Email приходит без Title/EMail (только Id). Без уточнения принципал
// классифицировался как "unknown" и выпадал из AssignedToId-фильтра — задачи групп
// из DcEmail не попадали в #tasks.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyPrincipal, flattenEmailPrincipals, listDistributionPrincipals } from "../distribution";
import { enrichDistribution, resolvePrincipalDetail, clearPrincipalDetailsCache } from "../principalDetails";

vi.mock("../../api", () => ({
  default: {
    get: vi.fn(async () => ({ data: { d: {} } })),
    post: vi.fn(),
    defaults: { headers: {} },
  },
  invalidate: vi.fn(),
}));

function makeGet(handlers) {
  return vi.fn(async (url) => {
    for (const [pattern, response] of handlers) {
      if (url.includes(pattern)) {
        if (response === "404") {
          const err = new Error("Not found");
          err.response = { status: 404, data: {} };
          throw err;
        }
        return { data: { d: response } };
      }
    }
    const err = new Error("Not found");
    err.response = { status: 404, data: {} };
    throw err;
  });
}

describe("principalDetails.enrichDistribution", () => {
  beforeEach(() => {
    clearPrincipalDetailsCache();
    if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  });

  it("пользователь: getuserbyid → kind=user + email", async () => {
    const get = makeGet([
      ["/web/getuserbyid(207)", { Id: 207, Title: "Поршаков Сергей", LoginName: "i:0#.f|membership|s@lenta.com", Email: "s@lenta.com" }],
    ]);
    const dist = { Id: 5, OffDepKey: "РЦ-8117ООБ", Email: { results: [{ Id: 207 }] } };
    const enriched = await enrichDistribution(dist, { get });
    const item = enriched.Email.results[0];
    expect(item.Title).toBe("Поршаков Сергей");
    expect(item.EMail).toBe("s@lenta.com");
    expect(item.kindHint).toBe("user");
    // исходный объект не мутируем
    expect(dist.Email.results[0].Title).toBeUndefined();
  });

  it("группа: getuserbyid 404 → sitegroups/getbyid", async () => {
    const get = makeGet([
      ["/web/sitegroups/getbyid(33)", { Id: 33, Title: "ООБ", LoginName: "ООБ" }],
    ]);
    const dist = { Id: 5, Email: { results: [{ Id: 33 }] } };
    const enriched = await enrichDistribution(dist, { get });
    expect(enriched.Email.results[0].Title).toBe("ООБ");
    expect(enriched.Email.results[0].kindHint).toBe("group");
  });

  it("сохраняет структуру Email (одиночный объект / массив)", async () => {
    const get = makeGet([["/web/sitegroups/getbyid(33)", { Id: 33, Title: "ООБ" }]]);
    const single = await enrichDistribution({ Id: 1, Email: { Id: 33 } }, { get });
    expect(single.Email.kindHint).toBe("group");
    const arr = await enrichDistribution({ Id: 1, Email: [{ Id: 33 }] }, { get });
    expect(Array.isArray(arr.Email)).toBe(true);
    expect(arr.Email[0].kindHint).toBe("group");
  });

  it("если детали не нашлись — возвращает исходный объект", async () => {
    const get = makeGet([]);
    const dist = { Id: 5, Email: { results: [{ Id: 999 }] } };
    const enriched = await enrichDistribution(dist, { get });
    expect(enriched).toBe(dist);
  });

  it("не делает запросов, если Title/EMail уже есть", async () => {
    const get = vi.fn(async () => ({ data: { d: {} } }));
    const dist = { Id: 5, Email: { results: [{ Id: 33, Title: "ООБ", EMail: "oob@lenta.com" }] } };
    const enriched = await enrichDistribution(dist, { get });
    expect(get).not.toHaveBeenCalled();
    expect(enriched).toBe(dist);
  });

  it("resolvePrincipalDetail кэширует результат (повторный вызов не ходит в сеть)", async () => {
    const get = makeGet([["/web/sitegroups/getbyid(33)", { Id: 33, Title: "ООБ" }]]);
    await resolvePrincipalDetail(33, { get });
    const callsAfterFirst = get.mock.calls.length;
    expect(callsAfterFirst).toBe(2); // getuserbyid → 404, затем sitegroups/getbyid
    await resolvePrincipalDetail(33, { get });
    expect(get.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("distribution.listDistributionPrincipals с kindHint", () => {
  it("kindHint=group → kind=group, isUser=false", () => {
    const principals = listDistributionPrincipals({ Email: { results: [{ Id: 33, kindHint: "group" }] } });
    expect(principals[0].kind).toBe("group");
    expect(principals[0].isUser).toBe(false);
    expect(principals[0].kindHint).toBe("group");
  });

  it("kindHint=user → kind=user", () => {
    const principals = listDistributionPrincipals({ Email: { results: [{ Id: 207, kindHint: "user" }] } });
    expect(principals[0].kind).toBe("user");
    expect(principals[0].isUser).toBe(true);
  });

  it("Email без деталей → kind=unknown (не теряется из списка)", () => {
    const principals = listDistributionPrincipals({ Email: { results: [{ Id: 42 }] } });
    expect(principals).toHaveLength(1);
    expect(principals[0].kind).toBe("unknown");
  });

  it("классификация по EMail/LoginName", () => {
    expect(classifyPrincipal({ email: "a@b.com" })).toBe("user");
    expect(classifyPrincipal({ loginName: "i:0#.f|membership|x" })).toBe("user");
    expect(classifyPrincipal({ title: "ООБ" })).toBe("group");
    expect(classifyPrincipal({})).toBe("unknown");
  });

  it("flattenEmailPrincipals читает EMail и Email", () => {
    expect(flattenEmailPrincipals([{ Id: 1, EMail: "a@b.c" }])[0].email).toBe("a@b.c");
    expect(flattenEmailPrincipals({ results: [{ Id: 2, Email: "d@e.f" }] })[0].email).toBe("d@e.f");
  });
});
