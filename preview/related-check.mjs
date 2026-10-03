// preview/related-check.mjs — проверка диалога «Связанная заявка» без браузера (jsdom).
//
// Рендерит тот же компонент, что открывается из формы задачи кнопкой
// «Просмотреть связанную заявку», на мок-данных (preview/mockDob.js) и печатает:
//   • текст диалога (что видит пользователь),
//   • список полей,
//   • наличие чипов / поясняющей подписи / кнопки «Открыть форму заявки» (должно быть 0).
//
// Запуск:
//   npx vite-node --config preview/vite.config.js preview/related-check.mjs

import "./jsdom-setup.mjs";

const { createElement, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { default: RelatedScene } = await import("./RelatedScene");

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);

root.render(
  createElement(
    StrictMode,
    null,
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(RelatedScene, null)
      )
    )
  )
);

await new Promise((r) => setTimeout(r, 600));

// MUI Dialog рендерится в портал на document.body
const text = document.body.textContent || "";
const fields = [...document.body.querySelectorAll('[data-testid="related-field"]')]
  .map((el) => el.getAttribute("data-internal"));

const forbidden = [
  ["чип «Только просмотр»", /Только просмотр/],
  ["чип «Тип контента: …»", /Тип контента:/],
  ["чип «Заполнено полей: N»", /Заполнено полей:/],
  ["подпись «Данные связанной заявки…»", /Данные связанной заявки/],
];
const buttonTexts = [...document.body.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
const openFormButtons = buttonTexts.filter((t) => /Открыть форму заявки/.test(t));

console.log("=== Текст диалога ===");
console.log(text.replace(/\s+/g, " ").trim().slice(0, 700));
console.log("\n=== Поля (data-internal) ===");
console.log(fields.join(", ") || "(нет)");
console.log("\n=== Кнопки ===");
console.log(buttonTexts.filter(Boolean).join(" | "));

let problems = 0;
for (const [label, re] of forbidden) {
  const found = re.test(text);
  if (found) problems += 1;
  console.log(`${found ? "✗" : "✓"} ${label}: ${found ? "НАЙДЕНО (не должно быть)" : "нет"}`);
}
console.log(`${openFormButtons.length === 0 ? "✓" : "✗"} кнопка «Открыть форму заявки»: ${openFormButtons.length === 0 ? "нет" : "НАЙДЕНА"}`);
problems += openFormButtons.length;
if (!/Связанная заявка #1/.test(text)) {
  console.log("✗ заголовок «Связанная заявка #1» не найден");
  problems += 1;
}
console.log(`\n=== Итог: ${problems === 0 ? "ОК — лишних элементов нет" : `проблем: ${problems}`} ===`);
process.exit(problems === 0 ? 0 : 1);
