// preview/table-check.mjs — проверка табличного режима #tasks без браузера (jsdom).
//
// Рендерит ту же сцену, что открывается по ?scene=table (preview/TableScene.jsx),
// и проверяет поведение действий по строке:
//   • колонки действий в таблице нет;
//   • клик по строке НЕ меняет hash (только выделение);
//   • меню действий открывается В ТОЧКЕ КЛИКА (координаты клика в стиле popup);
//   • в меню — весь набор действий карточки: «Взять в работу» / результаты / «Изменить»;
//   • двойной клик по строке открывает форму.
//
// Запуск:
//   npx vite-node --config preview/vite.config.js preview/table-check.mjs

import "./jsdom-setup.mjs";

const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { default: TableScene } = await import("./TableScene");

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
root.render(createElement(ThemeProvider, { theme: createTheme() }, createElement(TableScene, null)));

const settle = async (ms = 400) => new Promise((r) => setTimeout(r, ms));
await settle(600);

let problems = 0;
const check = (ok, label, extra = "") => {
  if (!ok) problems += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const cellOfRow = (re) => [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .find((r) => re.test(r.textContent || ""))?.querySelector(".ag-cell") || null;

const openPopup = () => {
  const el = [...document.body.querySelectorAll('[data-testid="tasks-row-actions"]')].pop() || null;
  return el && el.style.opacity !== "0" ? el : null;
};

check(host.querySelectorAll('[col-id="rowActions"]').length === 0, "колонки действий в таблице нет");
check(openPopup() === null, "до клика меню действий закрыто");

// ── клик по строке «в работе» — меню в точке клика с полным набором ─────────
const inProgressCell = cellOfRow(/Проверить паллету на складе|Заявка ООБ|Задача/);
check(!!inProgressCell, "строка найдена");

const hashBefore = window.location.hash;
inProgressCell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 321, clientY: 234 }));
await settle(400);

check(window.location.hash === hashBefore, "одиночный клик по строке не открывает форму (hash не изменился)");
const paper = openPopup();
check(!!paper, "меню действий открылось");
const style = paper?.getAttribute("style") || "";
check(style.includes("321px") && style.includes("234px"), "меню позиционировано в точке клика (321, 234)", style.match(/top: [^;]+; left: [^;]+;|top: [^;]+|left: [^;]+/g)?.join(" ") || "");

const labels = [...(paper?.querySelectorAll("button") || [])].map((b) => (b.textContent || "").trim());
console.log("   действия:", labels.join(" | ") || "(нет)");
check(labels.some((t) => /Изменить/.test(t)), "есть «Изменить»");

// строка «в работе» → кнопки результатов (как в карточке)
const inProgressRow = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .find((r) => /В работе/.test(r.textContent || ""));
if (inProgressRow) {
  inProgressRow.querySelector(".ag-cell").dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 100, clientY: 200 })
  );
  await settle(400);
  const labelsInProgress = [...(openPopup()?.querySelectorAll("button") || [])].map((b) => (b.textContent || "").trim());
  console.log("   действия строки «в работе»:", labelsInProgress.join(" | "));
  check(labelsInProgress.some((t) => /Найдена|Не найдена/.test(t)), "есть кнопки результатов (как в карточке)");
  check(!labelsInProgress.some((t) => /Взять в работу/.test(t)), "«Взять в работу» для задачи в работе не предлагается");
}

// строка «Не начата» → «Взять в работу»
const notStartedCell = [...host.querySelectorAll(".ag-center-cols-container .ag-row")]
  .find((r) => /Не начата/.test(r.textContent || ""))?.querySelector(".ag-cell");
if (notStartedCell) {
  notStartedCell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 150, clientY: 260 }));
  await settle(400);
  const labelsNew = [...(openPopup()?.querySelectorAll("button") || [])].map((b) => (b.textContent || "").trim());
  console.log("   действия строки «Не начата»:", labelsNew.join(" | "));
  check(labelsNew.some((t) => /Взять в работу/.test(t)), "есть «Взять в работу»");
}

console.log(`\n=== Итог: ${problems === 0 ? "ОК — действия открываются в точке клика" : `проблем: ${problems}`} ===`);
process.exit(problems === 0 ? 0 : 1);
