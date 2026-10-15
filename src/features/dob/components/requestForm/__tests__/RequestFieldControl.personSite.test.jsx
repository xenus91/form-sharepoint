// @vitest-environment jsdom
// src/features/dob/components/requestForm/__tests__/RequestFieldControl.personSite.test.jsx
//
// Заявка создаётся на сайте ДОБ (#dob_requests/new), поэтому поле «Пользователь
// или группа» (Виновный и т.п.) должно искать людей НА САЙТЕ ДОБ. Раньше
// RequestFieldControl не передавал search, и PersonFieldAutocomplete уходил
// дефолтным поиском на основной сайт (obrazceo).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

const DOB_BASE = "/dob-api/sites/dob/doblogistic/_api";

vi.mock("../../../api/dobClient", () => ({
  dobApiBase: () => DOB_BASE,
  dobAxios: { get: vi.fn(async () => ({ data: {} })), post: vi.fn() },
}));

vi.mock("../../../../../tasks/userSearch", () => ({
  searchSiteUsers: vi.fn(async () => []),
  getUserPositions: vi.fn(async () => ({})),
}));

const captured = [];
vi.mock("../../../../tasks/components/PersonFieldAutocomplete", () => ({
  default: (props) => {
    captured.push(props);
    return <div data-testid="person-field-mock" />;
  },
}));

import { dobAxios } from "../../../api/dobClient";
import { searchSiteUsers, getUserPositions } from "../../../../../tasks/userSearch";

const { default: RequestFieldControl } = await import("../RequestFieldControl");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const personControl = {
  internalName: "Guilty", title: "Виновный", kind: "person", required: true, multiple: false,
};

let root = null;
function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<RequestFieldControl control={personControl} value={null} onChange={() => {}} />);
  });
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  document.body.innerHTML = "";
});

describe("RequestFieldControl — поле «Пользователь или группа»", () => {
  it("ищет людей на сайте ДОБ, а не на основном сайте", async () => {
    mount();
    const props = captured[captured.length - 1];
    expect(props.search).toBeTypeOf("function");

    await props.search("иванов", { limit: 20 });

    expect(searchSiteUsers).toHaveBeenCalledTimes(1);
    const [, opts] = searchSiteUsers.mock.calls[0];
    expect(opts.base).toBe(DOB_BASE);
    await opts.get("/web/siteusers?$filter=x");
    expect(String(dobAxios.get.mock.calls[0][0])).toBe(`${DOB_BASE}/web/siteusers?$filter=x`);
  });

  it("сведения о выбранном человеке подтягивает тоже с сайта ДОБ", async () => {
    mount();
    const props = captured[captured.length - 1];
    expect(props.getPositions).toBeTypeOf("function");

    await props.getPositions([{ Id: 5, LoginName: "i:0#.f|membership|ivanov.ii@lenta.com" }]);

    expect(getUserPositions).toHaveBeenCalledTimes(1);
    await getUserPositions.mock.calls[0][1].get("/web/siteusers");
    expect(String(dobAxios.get.mock.calls[0][0])).toBe(`${DOB_BASE}/web/siteusers`);
  });
});
