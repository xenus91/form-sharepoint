// preview/flow-check.mjs — проверка потока результата: роутинг + реальные клики (свежий рендер на каждый клик).
import "./jsdom-setup.mjs";
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { default: CardsScene, tasks, taskConfig, choicesByTask } = await import("./CardsScene");
const { resolveTaskRule } = await import("../src/services/taskBehaviour");
const { resolveResultFlow } = await import("../src/features/tasks/resultFlow");

const theme = createTheme({ shape: { borderRadius: 28 }, palette: { primary: { main: "#171c8f" } } });

console.log("=== resolveResultFlow (логика TasksView.handleResultClick) ===");
for (const t of tasks) {
  for (const ch of choicesByTask[t.Id]) {
    const rule = resolveTaskRule(t, ch, taskConfig);
    const flow = resolveResultFlow(ch, rule);
    console.log(
      `задача #${t.Id} "${ch}" → ${flow.action}`,
      "| rule:", rule ? `${rule.source} c=${rule.requiresConfirmed} loc=${rule.requiresLocation} p=${rule.promptFields.length} anim=${rule.animation}` : "нет (завершаем сразу)"
    );
  }
}

async function renderOnce(spies, updating) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(ThemeProvider, { theme }, createElement(CardsScene, { ...spies, ...(updating || {}) })));
  await new Promise((r) => setTimeout(r, 900));
  return host;
}

console.log("\n=== Оверлей «Сохранение...» при submit ===");
{
  const host = await renderOnce({}, { updatingId: 651, updatingAction: "complete" });
  const card = [...host.querySelectorAll(":scope > div > div > div")].find((c) => c.textContent.includes("#651"));
  console.log("карточка #651:", card.textContent.replace(/\s+/g, " ").trim());
  console.log("кнопки:", [...card.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).join(" | ") || "нет (оверлей перекрывает)");
  host.remove();
}

console.log("\n=== Проверка loc (диалог «Где найдена ЕО?») ===");
console.log(
  'правило с {"loc": true} →',
  JSON.stringify(resolveResultFlow("Найдена", { source: "exact", requiresLocation: true, requiresConfirmed: false, promptFields: [] }))
);
console.log(
  'правило без loc/c →',
  JSON.stringify(resolveResultFlow("Найдена", { source: "exact", requiresLocation: null, requiresConfirmed: false, promptFields: [] }))
);

console.log("\n=== Клики по кнопкам (свежий рендер на каждый клик) ===");
for (const t of tasks) {
  for (const choice of choicesByTask[t.Id]) {
    const calls = [];
    const host = await renderOnce({
      onResultClick: (task, result) => calls.push({ type: "onResultClick", id: task.Id, result }),
      onComplete: (task, result, values) => calls.push({ type: "onComplete", id: task.Id, result, values }),
    });
    const card = [...host.querySelectorAll(":scope > div > div > div")].find((c) => c.textContent.includes(`#${t.Id}`));
    const btn = card && [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === choice);
    if (!btn) { console.log(`#${t.Id} «${choice}» → кнопка не найдена`); continue; }
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    await new Promise((r) => setTimeout(r, 200));
    const celebrate = host.textContent.includes("Паллет исправлен") ? " | показан celebrate «Паллет исправлен / Отличная работа!»" : "";
    const inline = host.textContent.includes("Причина") ? " | открыт inline-ввод «Причина»" : "";
    await new Promise((r) => setTimeout(r, 1800));
    console.log(
      `#${t.Id} «${choice}» →`,
      calls.length ? JSON.stringify(calls) : "(submit не вызван — нужен ввод/подтверждение)",
      celebrate, inline
    );
    host.remove();
  }
}

console.log("\n=== Диалог подтверждения для «Не исправлено» (#652) ===");
{
  const calls = [];
  const host = await renderOnce({
    onResultClick: (task, result) => calls.push({ type: "onResultClick", id: task.Id, result }),
    onComplete: (task, result, values) => calls.push({ type: "onComplete", id: task.Id, result, values }),
  });
  const card = [...host.querySelectorAll(":scope > div > div > div")].find((c) => c.textContent.includes("#652"));
  const btn = [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Не исправлено");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await new Promise((r) => setTimeout(r, 300));
  const allBtns = [...card.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  console.log("кнопки карточки после клика:", allBtns.join(" | "));
  const inputs = [...card.querySelectorAll("input,textarea")];
  console.log("полей ввода:", inputs.length, inputs.map((i) => i.getAttribute("placeholder") || i.name || "").join(","));
  // заполняем обязательное поле «Причина» (react-совместимо)
  for (const input of inputs) {
    const setter = Object.getOwnPropertyDescriptor(
      input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, "Паллет не перемотан");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  }
  await new Promise((r) => setTimeout(r, 200));
  const save = [...card.querySelectorAll("button")].find((b) => /Сохранить|Подтвердить|Отправить|Готово/.test(b.textContent));
  console.log("кнопка подтверждения в inline-режиме:", save ? save.textContent.trim() : "не найдена");
  save?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await new Promise((r) => setTimeout(r, 300));
  const dialogs = [...document.querySelectorAll(".MuiDialog-root")].map((d) => d.textContent.replace(/\s+/g, " ").trim());
  console.log("диалог:", dialogs.join(" || ") || "НЕ ОТКРЫЛСЯ");
  const okBtn = [...document.querySelectorAll(".MuiDialog-root button")].find((b) => b.textContent.trim().startsWith("Подтвердить"));
  okBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await new Promise((r) => setTimeout(r, 600));
  console.log("после подтверждения →", JSON.stringify(calls));
}
process.exit(0);
