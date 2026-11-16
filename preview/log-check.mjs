// preview/log-check.mjs — рендер в jsdom с ?dbg=1 и печать диагностических логов.
// Показывает: откуда взялись плитки шапки (связанный элемент или поля задачи)
// и что происходит при загрузке завершённых задач.
import "./jsdom-setup.mjs";

// Перехватываем консоль ДО импорта приложения (флаги dbg читаются при импорте).
const captured = [];
const wrap = (level, fn) => (...args) => {
  captured.push(
    args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ")
  );
  fn(...args);
};
console.log = wrap("log", () => {});
console.info = wrap("info", () => {});
console.warn = wrap("warn", () => {});
console.error = wrap("error", () => {});

const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { default: CardsScene } = await import("./CardsScene");

const theme = createTheme({ shape: { borderRadius: 28 }, palette: { primary: { main: "#171c8f" } } });
createRoot(document.getElementById("root")).render(
  createElement(ThemeProvider, { theme }, createElement(CardsScene))
);
await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 900)));

const TAG = process.env.TAG || "";
process.stdout.write(`=== Логов: ${captured.length} (${TAG ? `фильтр: ${TAG}` : "все"}) ===\n`);
for (const line of captured) {
  if (TAG && !line.includes(TAG)) continue;
  process.stdout.write(`${line.slice(0, 400)}\n`);
}
