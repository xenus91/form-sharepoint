// src/utils/__tests__/htmlEntities.test.js
// «&#58;» (и doubly-экранированный «&amp;#58;») → настоящий символ «:».

import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "../htmlEntities";

describe("decodeHtmlEntities", () => {
  it("числовая сущность → символ", () => {
    expect(decodeHtmlEntities("ЕО&#58; 808003")).toBe("ЕО: 808003");
    expect(decodeHtmlEntities("&#x3A;")).toBe(":");
    expect(decodeHtmlEntities("a&#32;b")).toBe("a b");
  });

  it("двойное экранирование раскрывается до конца", () => {
    expect(decodeHtmlEntities("ЕО&amp;#58; 808003")).toBe("ЕО: 808003");
    expect(decodeHtmlEntities("ЕО&amp;amp;#58; 808003")).toBe("ЕО: 808003");
  });

  it("пример пользователя — описание задачи целиком", () => {
    const raw = "Установить местоположение ЕО&amp;#58; 808003003003003003 для получателя 109";
    expect(decodeHtmlEntities(raw)).toBe("Установить местоположение ЕО: 808003003003003003 для получателя 109");
  });

  it("именованные сущности — как раньше", () => {
    expect(decodeHtmlEntities("a &amp; b &lt;c&gt; &quot;d&quot;")).toBe('a & b <c> "d"');
    expect(decodeHtmlEntities("неразрывный&nbsp;пробел")).toBe("неразрывный пробел");
    expect(decodeHtmlEntities("«кавычки» &#171;лапки&#187;")).toBe("«кавычки» «лапки»");
  });

  it("неизвестное и мусор не трогает", () => {
    expect(decodeHtmlEntities("&unknown; & 5 &#99999999999; &#xZZ;")).toBe("&unknown; & 5 &#99999999999; &#xZZ;");
  });

  it("пустые значения", () => {
    expect(decodeHtmlEntities(null)).toBe("");
    expect(decodeHtmlEntities(undefined)).toBe("");
    expect(decodeHtmlEntities(0)).toBe("0");
  });

  it("без сущностей текст не меняется", () => {
    const s = "Обычный текст: 109 — без сущностей";
    expect(decodeHtmlEntities(s)).toBe(s);
  });
});
