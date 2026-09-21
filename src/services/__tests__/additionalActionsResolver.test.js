import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAdditionalActionsConfig, clearAdditionalActionsResolverCache } from "../additionalActionsResolver";

describe("additionalActionsResolver", () => {
  beforeEach(() => clearAdditionalActionsResolverCache());

  it("resolves common field when no CT config", async () => {
    const task = { contentTypeId: "0x0108AAA", AdditionalActionsRequired: "Да" };
    const cfg = await resolveAdditionalActionsConfig(task, {
      additionalFieldMeta: {
        internalName: "AdditionalActions",
        title: "Дополнительные действия",
        typeAsString: "MultiChoice",
        choices: ["Отправить ЕО в OTM", "Перебрать"],
        allowFillIn: true,
      },
    });
    expect(cfg.fieldInternalName).toBe("AdditionalActions");
    expect(cfg.required).toBe(true);
    expect(cfg.choices).toHaveLength(2);
    expect(cfg.allowFillIn).toBe(true);
  });

  it("returns missing-field error when metadata null", async () => {
    const task = { contentTypeId: "0x0108BBB" };
    const cfg = await resolveAdditionalActionsConfig(task, { additionalFieldMeta: null, apiClient: null });
    // без apiClient и без meta → missing-field (enabled false)
    expect(cfg.source).toBe("missing-field");
    expect(cfg.enabled).toBe(false);
  });

  it("sync cache O(1) lookup", async () => {
    const { resolveAdditionalActionsConfigSync } = await import("../additionalActionsResolver");
    const map = new Map([["0x0108AAA", { internalName: "AdditionalActions", title: "T", typeAsString: "MultiChoice", choices: ["A"], allowFillIn: true }]]);
    const cfg = resolveAdditionalActionsConfigSync({ contentTypeId: "0x0108AAA", AdditionalActionsRequired: "Нет" }, map);
    expect(cfg.required).toBe(false);
    expect(cfg.fieldInternalName).toBe("AdditionalActions");
  });
});
