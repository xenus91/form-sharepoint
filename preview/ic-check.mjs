// preview/ic-check.mjs — проверка Behaviour.ic: подтверждение двумя кнопками В КАРТОЧКЕ.
// Ожидаем: диалог не открывается, полей для ввода нет, «Отмена» возвращает кнопки результата.
import "./jsdom-setup.mjs";
// Глушим служебные логи приложения (?dbg=1 включается в jsdom-setup)
for (const level of ["info", "debug"]) console[level] = () => {};

const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { default: CardsScene } = await import("./CardsScene");

const theme = createTheme({ shape: { borderRadius: 28 } });
createRoot(document.getElementById("root")).render(createElement(ThemeProvider, { theme }, createElement(CardsScene)));
await new Promise((r) => setTimeout(r, 1200));

const say = (msg) => process.stdout.write(msg + "\n");
const cards = () => [...document.querySelectorAll("#root > div > div > div")];
const btnText = (c) => [...c.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
const dialogs = () => document.querySelectorAll('[role="dialog"], .MuiDialog-root').length;
const inputs = (c) => c.querySelectorAll("input, textarea").length;
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
const findCard = () => cards().find((c) => btnText(c).includes("Не найдена"));
const btn = (c, text) => [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

let card = findCard();
say("1. До клика:                    " + JSON.stringify(btnText(card)));

click(btn(card, "Не найдена"));
await new Promise((r) => setTimeout(r, 300));
card = findCard() || cards()[0];
say("2. После «Не найдена»:          " + JSON.stringify(btnText(card)));
say("   диалогов:                   " + dialogs() + " (ожидаем 0)");
say("   полей ввода:                " + inputs(card) + " (ожидаем 0)");

// «Отмена» — возврат к кнопкам результата
click(btn(card, "Отмена"));
await new Promise((r) => setTimeout(r, 300));
card = findCard();
say("3. После «Отмена»:              " + JSON.stringify(btnText(card)));

// «Создать заявку» — анимация и завершение
click(btn(card, "Не найдена"));
await new Promise((r) => setTimeout(r, 300));
card = findCard() || cards()[0];
click(btn(card, "Создать заявку"));
await new Promise((r) => setTimeout(r, 400));
say("4. Анимация sherlock:          " + /Создаю заявку на ООБ|Отправляю запрос/.test(document.body.textContent));
say("   диалогов:                   " + dialogs() + " (ожидаем 0)");
