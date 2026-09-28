// preview/client-check.mjs — рендер сцены в jsdom: эффекты выполняются, видно поля из Behaviour.rf.
// Запуск: npx vite build --config preview/vite.config.js --ssr client-check.mjs --outDir .ssrout && node preview/.ssrout/client-check.mjs
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/?dbg=1",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { default: CardsScene } = await import("./CardsScene");

const theme = createTheme({ shape: { borderRadius: 28 }, palette: { primary: { main: "#171c8f" } } });

const root = createRoot(document.getElementById("root"));
root.render(createElement(ThemeProvider, { theme }, createElement(CardsScene)));

await new Promise((r) => setTimeout(r, 800));

const cards = [...document.querySelectorAll("#root > div > div > div")];
console.log("=== Всего карточек:", cards.length, "===");
cards.forEach((c, i) => {
  console.log(`--- Карточка ${i + 1} ---`);
  console.log(c.textContent.replace(/\s+/g, " ").trim());
});
