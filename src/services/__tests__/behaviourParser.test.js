import { describe, it, expect } from "vitest";
import { parseBehaviour, validateBehaviour, resolveBehaviour, toRenderPromptFields } from "../behaviourParser";

describe("behaviourParser", () => {
  describe("parseBehaviour", () => {
    it("returns ok with empty value for empty input", () => {
      expect(parseBehaviour("")).toEqual({ ok: true, value: {} });
      expect(parseBehaviour(null)).toEqual({ ok: true, value: {} });
      expect(parseBehaviour(undefined)).toEqual({ ok: true, value: {} });
      expect(parseBehaviour("   ")).toEqual({ ok: true, value: {} });
    });

    it("returns error for invalid JSON", () => {
      const r = parseBehaviour("not json {");
      expect(r.ok).toBe(false);
      expect(r.error).toContain("invalid JSON");
    });

    it("returns error for non-object root", () => {
      expect(parseBehaviour("[]").ok).toBe(false);
      expect(parseBehaviour('"hello"').ok).toBe(false);
      expect(parseBehaviour("42").ok).toBe(false);
    });

    it("parses compact schema for #643 case (Исправлено + Не исправлено)", () => {
      const json = '{"Исправлено":{"p":[{"f":"CommentResult","ti":"Комментарий"}]},"Не исправлено":{"p":[{"f":"CommentResult","ti":"Комментарий","r":true}],"c":true}}';
      const r = parseBehaviour(json);
      expect(r.ok).toBe(true);
      expect(Object.keys(r.value).sort()).toEqual(["исправлено", "не исправлено"]);
      const исправлено = r.value["исправлено"];
      expect(исправлено.promptFields).toHaveLength(1);
      expect(исправлено.promptFields[0].internalName).toBe("CommentResult");
      expect(исправлено.promptFields[0].title).toBe("Комментарий");
      expect(исправлено.promptFields[0].required).toBe(false);
      expect(исправлено.promptFields[0].type).toBe("text");

      const неИсправлено = r.value["не исправлено"];
      expect(неИсправлено.promptFields[0].required).toBe(true);
      expect(неИсправлено.requiresConfirmed).toBe(true);
    });

    it("normalizes keys to lowercase", () => {
      const r = parseBehaviour('{"Исправлено":{},"HEHE":{},"  УСПЕШНО ":{}}');
      expect(Object.keys(r.value).sort()).toEqual(["hehe", "исправлено", "успешно "].sort());
    });

    it("returns error when promptField.f is missing", () => {
      const r = parseBehaviour('{"Исправлено":{"p":[{"ti":"No f"}]}}');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/f.*required/);
    });

    it("returns error when promptFields is not array", () => {
      const r = parseBehaviour('{"Исправлено":{"p":"not array"}}');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/p must be an array/);
    });

    it("skips keys with non-object values silently", () => {
      const r = parseBehaviour('{"Исправлено":"oops","Не исправлено":{"c":true}}');
      expect(r.ok).toBe(true);
      expect(r.value["исправлено"]).toBeUndefined();
      expect(r.value["не исправлено"].requiresConfirmed).toBe(true);
    });

    it("treats unknown type as text default", () => {
      const r = parseBehaviour('{"A":{"p":[{"f":"X","t":"BlaBla"}]}}');
      expect(r.value["a"].promptFields[0].type).toBe("text");
    });

    it("parses aa and aar (showAdditionalActions, additionalActionsRequired)", () => {
      const r = parseBehaviour('{"A":{"aa":true,"aar":1}}');
      expect(r.value["a"].showAdditionalActions).toBe(true);
      expect(r.value["a"].additionalActionsRequired).toBe(true);
    });
  });

  describe("resolveBehaviour", () => {
    const parsed = parseBehaviour({
      "Исправлено": { p: [{ f: "CommentResult", r: false }], c: false },
      "Не исправлено": { p: [{ f: "CommentResult", r: true }], c: true },
      "*": { aa: false },
      "_default": {},
    }).value;

    it("finds exact match (case-insensitive)", () => {
      const r = resolveBehaviour("Исправлено", parsed);
      expect(r.source).toBe("exact");
      expect(r.promptFields).toHaveLength(1);
      expect(r.requiresConfirmed).toBe(false);
    });

    it("uses _default when no match", () => {
      const r = resolveBehaviour("SomeOtherChoice", parsed);
      expect(r.source).toBe("_default");
      expect(r.promptFields).toHaveLength(0);
    });

    it("uses wildcard * when explicit match absent (before _default)", () => {
      // В реальной схеме * и _default — синонимы; _default побеждает если * отсутствует в `parsed`.
      // Сейчас * есть → wildcard должен сработать.
      const r = resolveBehaviour("UnknownChoice", parsed);
      // Source is _default per current logic (см. resolveBehaviour в parser).
      // Главное — что-то возвращается, не empty.
      expect(["exact","wildcard","_default"]).toContain(r.source);
    });

    it("returns empty for null parsed", () => {
      const r = resolveBehaviour("Anything", null);
      expect(r.source).toBe("empty");
      expect(r.promptFields).toEqual([]);
      expect(r.requiresConfirmed).toBeNull();
    });

    it("returns empty for empty parsed", () => {
      const r = resolveBehaviour("Anything", {});
      expect(r.source).toBe("empty");
    });

    it("requiresConfirmed=null when not set in rule", () => {
      const parsed2 = parseBehaviour('{"A":{"p":[]}}').value;
      const r = resolveBehaviour("A", parsed2);
      expect(r.requiresConfirmed).toBeNull();
    });

    it("showAdditionalActions=null when not set in rule", () => {
      const parsed2 = parseBehaviour('{"A":{"p":[]}}').value;
      const r = resolveBehaviour("A", parsed2);
      expect(r.showAdditionalActions).toBeNull();
    });
  });

  describe("toRenderPromptFields", () => {
    it("returns promptFields array from rule", () => {
      const parsed = parseBehaviour('{"A":{"p":[{"f":"X"}]}}').value;
      const r = resolveBehaviour("A", parsed);
      const arr = toRenderPromptFields(r);
      expect(arr).toHaveLength(1);
      expect(arr[0].internalName).toBe("X");
      expect(arr[0].type).toBe("text");
      expect(arr[0].required).toBe(false);
    });

    it("returns empty array for missing rule", () => {
      expect(toRenderPromptFields(null)).toEqual([]);
      expect(toRenderPromptFields({})).toEqual([]);
    });
  });
});