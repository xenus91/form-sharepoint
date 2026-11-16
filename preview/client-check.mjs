// preview/client-check.mjs — рендер карточек в jsdom и печать их содержимого.
import "./jsdom-setup.mjs";
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { default: CardsScene } = await import("./CardsScene");

const theme = createTheme({ shape: { borderRadius: 28 }, palette: { primary: { main: "#171c8f" } } });
const root = createRoot(document.getElementById("root"));
root.render(createElement(ThemeProvider, { theme }, createElement(CardsScene)));
await new Promise((r) => setTimeout(r, 900));

const cards = [...document.querySelectorAll("#root > div > div > div")];
console.log("=== Карточек:", cards.length, "===");
cards.forEach((c, i) => {
  console.log(`--- Карточка ${i + 1} ---`);
  console.log(c.textContent.replace(/\s+/g, " ").trim());
});
console.log("=== Кнопки с иконками ===");
const allBtns = [...document.querySelectorAll("#root button")];
console.log("Всего кнопок:", allBtns.length, "с иконкой:", allBtns.filter((b) => b.querySelector("svg")).length);
console.log("=== Кнопки ===");
cards.forEach((c, i) => {
  const btns = [...c.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  console.log(`Карточка ${i + 1}:`, btns.join(" | "));
});
