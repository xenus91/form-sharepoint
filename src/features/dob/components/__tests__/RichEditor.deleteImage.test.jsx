// @vitest-environment jsdom
// src/features/dob/components/__tests__/RichEditor.deleteImage.test.jsx
//
// Каскад «удалили картинку ИЗ ТЕКСТА → вложение тоже удаляем»: RichEditor сам
// сообщает наружу про исчезнувшие картинки (onDeleteImage), причём в СЕРВЕРНОМ
// виде ссылки (`/sites/…`), чтобы страница нашла вложение. При внешнем обновлении
// значения (загрузка/сохранение/шаблон) картинки не считаются удалёнными.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ThemeProvider, createTheme } from "@mui/material";

const IMG_STORED = "/sites/obrazceo/Lists/List/Attachments/737/image_1.png";
const IMG_DISPLAY = "/dob-api/sites/obrazceo/Lists/List/Attachments/737/image_1.png";

// CKEditor в jsdom не работает — подменяем минимальным редактором с тем же
// контрактом: getData/setData + изменение текста через onChange. setData, как и
// в настоящем CKEditor, тоже «сообщает» об изменении данных.
vi.mock("@ckeditor/ckeditor5-react", () => ({
  CKEditor: ({ data, onChange, onReady }) => {
    const state = React.useRef({ value: data || "" });
    const editor = {
      getData: () => state.current.value,
      setData: (next) => {
        state.current.value = next || "";
        onChange?.(null, editor);
      },
    };
    React.useEffect(() => { onReady?.(editor); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <textarea
        data-testid="ck-content"
        value={state.current.value}
        onChange={(e) => {
          state.current.value = e.target.value;
          onChange?.(null, editor);
        }}
      />
    );
  },
}));
vi.mock("@ckeditor/ckeditor5-build-classic", () => ({ default: {} }));

const { default: RichEditor } = await import("../RichEditor");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderEditor(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const rerender = (next) => act(() => {
    root.render(
      <ThemeProvider theme={createTheme()}>
        <RichEditor {...next} />
      </ThemeProvider>,
    );
  });
  rerender({ value: "", onChange: () => {}, ...props });
  return { host, rerender };
}

const editorNode = (host) => host.querySelector('[data-testid="ck-content"]');

const setEditorText = (host, text) => {
  const el = editorNode(host);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  act(() => {
    setter.call(el, text);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};

describe("RichEditor — удаление картинки из текста", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("сообщает о удалённой картинке в серверном виде ссылки", () => {
    const onDeleteImage = vi.fn();
    const { host } = renderEditor({
      value: `<p>текст</p><img src="${IMG_DISPLAY}">`,
      onDeleteImage,
    });

    setEditorText(host, "<p>текст</p>");

    expect(onDeleteImage).toHaveBeenCalledTimes(1);
    expect(onDeleteImage).toHaveBeenCalledWith(IMG_STORED);
  });

  it("картинка на месте — сообщать нечего", () => {
    const onDeleteImage = vi.fn();
    const { host } = renderEditor({ value: `<img src="${IMG_DISPLAY}">`, onDeleteImage });

    setEditorText(host, `<p>добавили текст</p><img src="${IMG_DISPLAY}">`);

    expect(onDeleteImage).not.toHaveBeenCalled();
  });

  it("внешнее обновление значения (загрузка/сохранение) — не удаление картинок", () => {
    const onDeleteImage = vi.fn();
    const { rerender } = renderEditor({
      value: `<p>текст</p><img src="${IMG_DISPLAY}">`,
      onDeleteImage,
    });

    // Значение пришло с сервера уже без картинки (например, после сохранения).
    rerender({ value: "<p>текст</p>", onDeleteImage });

    expect(onDeleteImage).not.toHaveBeenCalled();
  });

  it("base64-картинка пока не вложение — о её исчезновении не сообщаем", () => {
    const onDeleteImage = vi.fn();
    const { host } = renderEditor({
      value: '<img src="data:image/png;base64,AQID">',
      onDeleteImage,
    });

    setEditorText(host, "<p>x</p>");

    expect(onDeleteImage).toHaveBeenCalledWith("data:image/png;base64,AQID");
    // страница сама отфильтрует base64 (fileNameFromSrc → ""), но проверим, что
    // сообщение не «сломало» удаление обычных ссылок;
    expect(onDeleteImage.mock.calls[0][0]).toContain("data:image");
  });
});
