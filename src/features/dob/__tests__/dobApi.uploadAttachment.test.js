// @vitest-environment jsdom
// src/features/dob/__tests__/dobApi.uploadAttachment.test.js
//
// Загрузка картинок-вложений. Реальная ситуация из лога: из буфера вставлены ДВЕ
// картинки, CKEditor грузит их ПАРАЛЛЕЛЬНО, и второе `AttachmentFiles/add`
// получает от SharePoint 409 «Конфликт сохранения» — картинка оставалась base64,
// в rich-тексте появлялось 2 картинки, а вложений создавалось одно.
//
// Контракт:
//   • загрузки вложений идут СТРОГО по одной (очередь);
//   • конфликт сохранения повторяется (до 3 раз) и не «залипает» очередь;
//   • в ответе — ServerRelativeUrl (хранение) и рабочий адрес редактора (REST $value).

import { describe, it, expect, vi, beforeEach } from "vitest";

const MAIN_GUID = "463b634e-a71a-4fef-9a1f-b803431d8639";

const state = { posts: [], inFlight: 0, maxInFlight: 0, conflictOnce: 0 };

const apiClient = {
  get: vi.fn(async () => ({ data: { d: {} } })),
  post: vi.fn(async (url, body, cfg) => apiClient.postImpl(url, body, cfg)),
  postImpl: async (url, body, cfg) => {
    state.posts.push({ url, body, cfg });
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise((r) => setTimeout(r, 25)); // имитация сетевой задержки
    state.inFlight -= 1;
    if (state.conflictOnce > 0) {
      state.conflictOnce -= 1;
      const err = new Error("Конфликт сохранения.");
      err.response = { status: 409, data: { error: { message: { value: "Конфликт сохранения. Внесенные изменения противоречат изменениям, внесённым другим пользователем." } } } };
      throw err;
    }
    const name = decodeURIComponent(String(url).match(/FileName='([^']+)'/)?.[1] || "file.png");
    return {
      data: {
        d: {
          FileName: name,
          ServerRelativeUrl: `/sites/obrazceo/Lists/List/Attachments/737/${name}`,
        },
      },
    };
  },
};

vi.mock("../../../api", () => ({ default: apiClient }));
vi.mock("../api/dobClient", () => ({
  DOB_LIST_GUID: "21B5B544-BD98-4B06-891F-C5A137331394",
  dobApiBase: () => "/dob-api/sites/dob/doblogistic/_api",
  dobListApi: (guid) => `/dob-api/sites/dob/doblogistic/_api/web/lists(guid'${guid}')`,
  dobAxios: {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    interceptors: { request: { use: () => {} }, response: { use: () => {} } },
  },
}));

const { uploadDobAttachment } = await import("../api/dobApi");

// В jsdom у File нет arrayBuffer() — даём минимальный «файл» с тем же контрактом,
// который использует загрузчик (name + arrayBuffer()).
const fileOf = (name) => ({
  name,
  type: "image/png",
  size: 3,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
});

describe("uploadDobAttachment — параллельные вставки и конфликты", () => {
  beforeEach(() => {
    state.posts = [];
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.conflictOnce = 0;
    apiClient.postImpl.mockClear?.();
  });

  it("две вставленные картинки грузятся ПОСЛЕДОВАТЕЛЬНО (никаких одновременных add)", async () => {
    const [a, b] = await Promise.all([
      uploadDobAttachment(737, fileOf("image.png"), MAIN_GUID),
      uploadDobAttachment(737, fileOf("image.png"), MAIN_GUID),
    ]);

    expect(state.posts).toHaveLength(2);
    expect(state.maxInFlight).toBe(1); // второй запрос начался только после первого
    expect(a.ServerRelativeUrl).toMatch(/\/sites\/obrazceo\/Lists\/List\/Attachments\/737\/image_/);
    expect(b.ServerRelativeUrl).toMatch(/\/sites\/obrazceo\/Lists\/List\/Attachments\/737\/image_/);
    expect(a.ServerRelativeUrl).not.toBe(b.ServerRelativeUrl); // имена уникальны
  });

  it("409 «Конфликт сохранения» повторяется и заканчивается успехом", async () => {
    state.conflictOnce = 1;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await uploadDobAttachment(737, fileOf("image.png"), MAIN_GUID);
    warn.mockRestore();

    expect(state.posts).toHaveLength(2); // первая попытка + повтор
    expect(res.ServerRelativeUrl).toContain("/Attachments/737/");
  });

  it("конфликт не «залипает» очередь: следующие загрузки проходят", async () => {
    state.conflictOnce = 4; // больше, чем повторов у первой загрузки
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = uploadDobAttachment(737, fileOf("image.png"), MAIN_GUID).catch((e) => e);
    const failedErr = await failed;
    expect(failedErr?.response?.status).toBe(409);

    state.conflictOnce = 0;
    const ok = await uploadDobAttachment(737, fileOf("image.png"), MAIN_GUID);
    warn.mockRestore();
    expect(ok.ServerRelativeUrl).toContain("/Attachments/737/");
  });

  it("рабочий адрес картинки — REST $value, а ServerRelativeUrl — серверный путь", async () => {
    const res = await uploadDobAttachment(737, fileOf("image.png"), MAIN_GUID);
    expect(res.ServerRelativeUrl).toMatch(/^\/sites\/obrazceo\/Lists\/List\/Attachments\/737\//);
    expect(res.src).toContain("/_api/web/getfilebyserverrelativeurl(");
    expect(res.src).toContain(")/$value");
    expect(res.url).toBe(res.src);
    expect(res.src).not.toContain("/dob-api/sites/obrazceo/Lists/"); // прямого пути нет
  });
});
