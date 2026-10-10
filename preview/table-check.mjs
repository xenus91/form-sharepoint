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
// Первая строка сцены — «Не начата»: пока задачу не взяли, «Изменить» недоступна
// (правило 2026-10-04, см. src/features/tasks/lib/rowActions.js). У задачи
// «в работе» она есть — это проверяется ниже.
check(!labels.some((t) => /Изменить/.test(t)), "у невзятой задачи «Изменить» нет");

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

  // ⭐ Цвета и иконки кнопок результата — ровно как в карточке: их задаёт
  // Behaviour-пайплайн (background/color/hover + «i»), а не набор по умолчанию.
  // sx из Behaviour уезжает в CSS-класс (emotion), поэтому проверяем computed style.
  const buttonByText = (re) => [...(openPopup()?.querySelectorAll("button") || [])].find((b) => re.test(b.textContent || ""));
  const foundBtn = buttonByText(/Найдена/);
  const foundBg = window.getComputedStyle(foundBtn).backgroundImage;
  check(/linear-gradient\(180deg, #2e7d32/.test(foundBg), "«Найдена» залита градиентом из Behaviour (как в карточке)", foundBg);
  check(window.getComputedStyle(foundBtn).color === "rgb(255, 255, 255)", "цвет текста кнопки — из Behaviour (#fff)");
  const notFoundBtn = buttonByText(/Не найдена/);
  const notFoundBg = window.getComputedStyle(notFoundBtn).backgroundColor;
  check(notFoundBg === "rgb(198, 40, 40)", "«Не найдена» залита плоским цветом из Behaviour", notFoundBg);
  check(!!foundBtn?.querySelector("svg"), "иконка результата пришла из Behaviour («i»)", "svg внутри кнопки");

  // «Изменить» закреплена внизу: она вне прокручиваемого списка действий
  const list = openPopup()?.querySelector('[data-testid="tasks-row-actions-list"]');
  check(!!list && !/Изменить/.test(list.textContent || ""), "«Изменить» закреплена внизу и не скроллится вместе со списком");

  // Вид «Изменить» — вторичная кнопка, как в карточке внешней задачи
  // (рамка/текст цвета #171c8f). Проверяем здесь: позже поповер перекроется
  // меню другой строки.
  const editBtn = buttonByText(/Изменить/) || null;
  const editColor = editBtn ? window.getComputedStyle(editBtn).color : "";
  check(/rgb\(23, 28, 143\)/.test(editColor), "«Изменить» — вторичная, как в карточке", editColor);
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

  // «Взять в работу» — тот же индиговый градиент, что у кнопки карточки
  const takeBtn = [...(openPopup()?.querySelectorAll("button") || [])].find((b) => /Взять в работу/.test(b.textContent || ""));
  const takeBg = window.getComputedStyle(takeBtn).backgroundImage;
  check(/linear-gradient\(180deg, (#7B84FF|rgb\(123, 132, 255\))/.test(takeBg), "«Взять в работу» — градиент карточки", takeBg);
}

// ── заливка строк по статусу, «Срок» как в карточке, фильтр «Я исполнитель» ──
// (требования 2026-10-10; см. docs/decisions/form-ui-ux.md §13)
const rowsOf = () => [...host.querySelectorAll(".ag-center-cols-container .ag-row")];
// col-id колонки «Исполнитель» берём из шапки: у неё нет field/colId.
const takerColId = [...host.querySelectorAll(".ag-header-cell")]
  .find((h) => /Исполнитель/.test(h.textContent || ""))?.getAttribute("col-id") || null;
const cellText = (row, colId) => row.querySelector(`[col-id="${colId}"]`)?.textContent?.trim() || "";
const STATUS_CLASS = { progress: "tasks-row-progress", completed: "tasks-row-completed", overdue: "tasks-row-overdue" };

// закрываем поповер, чтобы не мешал
document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await settle(200);

const all = rowsOf();
const byClass = { progress: 0, completed: 0, overdue: 0, none: 0 };
let noneWrong = 0;
for (const row of all) {
  const cls = row.className || "";
  const kind = Object.keys(STATUS_CLASS).find((k) => cls.includes(STATUS_CLASS[k]));
  if (kind) byClass[kind] += 1;
  else {
    byClass.none += 1;
    // без заливки остаётся только «Не начата» со сроком вперёд
    const due = cellText(row, "DueDate");
    if (!/Не начата/.test(cellText(row, "Status")) || !/^Осталось/.test(due)) noneWrong += 1;
  }
}
console.log("   строки:", JSON.stringify(byClass), "всего", all.length);
check(all.length > 0 && byClass.progress + byClass.completed + byClass.overdue + byClass.none === all.length, "каждая строка получила ровно один статус");
check(byClass.progress > 0, "есть оранжевые строки («В процессе выполнения» / «В работе»)", String(byClass.progress));
check(byClass.completed > 0, "есть зелёные строки («Завершена»)", String(byClass.completed));
check(byClass.overdue > 0, "есть красные строки (просрочены и не закрыты)", String(byClass.overdue));
check(noneWrong === 0, "без заливки — только «Не начата» в срок");

// «Срок» — как в карточке
const dues = all.map((r) => cellText(r, "DueDate")).filter(Boolean);
check(dues.some((d) => /^Осталось \d+д \d+ч$/.test(d)), "в «Сроке» есть «Осталось …д …ч»", dues.find((d) => /^Осталось/.test(d)) || "");
check(dues.some((d) => /^Просрочено \d+д \d+ч назад$/.test(d)), "в «Сроке» есть «Просрочено … назад»", dues.find((d) => /^Просрочено/.test(d)) || "");
check(!dues.some((d) => /^\d{2}\.\d{2}\.\d{4}$/.test(d)), "голых дат в «Сроке» не осталось");
// порядок по умолчанию — от самых старых к самым новым (движок сортирует по Created)
const dueHeader = [...host.querySelectorAll(".ag-header-cell")].find((h) => /Срок/.test(h.textContent || ""));
check(dueHeader?.getAttribute("aria-sort") === "ascending",
  "«Срок» по умолчанию отсортирован по возрастанию", dueHeader?.getAttribute("aria-sort") || "нет");
// В сцене Created растёт вместе с порядком сценария (см. preview/TableScene.jsx),
// поэтому «от старых к новым» = первые сценарии сверху. Берём первые четыре.
const EXPECTED_FIRST = [
  "Проверить паллету на складе",
  "Просмотр видеоархива",
  "Основная задача ООБ (в работе)",
  "Заявка ООБ",
];
const shownTitles = all.map((r) => cellText(r, "Title"));
check(EXPECTED_FIRST.every((t, i) => shownTitles[i] === t),
  "первые строки — самые старые задачи (по дате создания)", shownTitles.slice(0, 4).join(" → "));

// завершённая строка — время решения (как чип в карточке), а не «Просрочено»
const doneDues = all.filter((r) => /Завершена/.test(cellText(r, "Status"))).map((r) => cellText(r, "DueDate"));
check(doneDues.length > 0 && doneDues.every((d) => /^Решено( за \d+д \d+ч)?$/.test(d)),
  "у завершённых — «Решено за …д …ч»", doneDues.join(" | "));

// зебры нет: чётные и нечётные строки одного цвета
const oddBg = getComputedStyle(host.querySelector(".ag-theme-quartz") || host).getPropertyValue("--ag-odd-row-background-color").trim();
check(oddBg === "transparent" || oddBg === "rgba(0, 0, 0, 0)",
  "переменной чередования строк нет (зебра выключена)", oddBg || "пусто");

// «Исполнитель» — кнопка принципала, как «Кому назначено»
const takerBtns = host.querySelectorAll('[data-testid="taker-button"]');
const takerEmpty = host.querySelectorAll('[data-testid="taker-empty"]');
check(takerBtns.length > 0 && takerEmpty.length > 0,
  "в «Исполнителе» кнопки и прочерки (у невзятых — «—»)",
  `кнопок ${takerBtns.length}, прочерков ${takerEmpty.length}`);

// «Кому назначено» без имени в задаче — имя доуточнено по Id (mockApi)
check(!!takerColId, "колонка «Исполнитель» найдена в шапке", takerColId || "");
const assignedCells = all.map((r) => cellText(r, "assignedTo"));
check(assignedCells.length > 0 && !assignedCells.some((t) => /^Id \d+$/.test(t)), "в «Кому назначено» нет «Id <номер>»");

// фильтр «Я исполнитель» — только то, что я веду.
// ВАЖНО: AG Grid рендерит только видимые строки (виртуализация), поэтому
// сравниваем не отрисованные строки, а счётчики: подпись на кнопке («N») и
// «Найдено: X из Y» под поиском.
const mineBtn = host.querySelector('[data-testid="tasks-grid-only-mine"]');
check(!!mineBtn && mineBtn.disabled === false, "кнопка «Я исполнитель» доступна");
const totalRows = Number((host.textContent.match(/Найдено: \d+ из (\d+)/) || [])[1] || 0);
const mineCount = Number((mineBtn?.textContent || "").match(/\((\d+)\)/)?.[1] || 0);
mineBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
await settle(400);
const mineRows = rowsOf();
const mineTakers = [...new Set(mineRows.map((r) => cellText(r, takerColId)))];
const mineStatuses = [...new Set(mineRows.map((r) => cellText(r, "Status")))];
const shownAfter = Number((host.textContent.match(/Найдено: (\d+) из/) || [])[1] || 0);
console.log("   «Я исполнитель»:", mineCount, "из", totalRows, "| показано", shownAfter, "| исполнители:", mineTakers.join(", "), "| статусы:", mineStatuses.join(", "));
check(totalRows > 0 && mineCount > 0 && mineCount < totalRows, "фильтр оставляет часть задач", `${mineCount}/${totalRows}`);
check(shownAfter === mineCount, "таблица показывает ровно столько, сколько на кнопке", String(shownAfter));
check(mineRows.length > 0 && mineTakers.length === 1 && mineTakers[0] === "Поршаков Сергей", "во всех строках исполнитель — я", mineTakers.join(", "));
check(!mineStatuses.some((st) => /Не начата/.test(st)), "«Не начата» в отфильтрованном списке нет");
// снятие фильтра возвращает всё
mineBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
await settle(400);
check(Number((host.textContent.match(/Найдено: (\d+) из/) || [])[1] || 0) === totalRows, "второй клик возвращает все строки");

console.log(`\n=== Итог: ${problems === 0 ? "ОК — действия открываются в точке клика" : `проблем: ${problems}`} ===`);
process.exit(problems === 0 ? 0 : 1);
