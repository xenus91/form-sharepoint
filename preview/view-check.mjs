// preview/view-check.mjs — рендер настоящего TasksView в jsdom (без HMR): ловим предупреждения React о порядке хуков.
import "./jsdom-setup.mjs";

// окружение для MUI / виртуализатора
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
globalThis.matchMedia = window.matchMedia;

const problems = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...a) => { const s = a.map(String).join(" "); problems.push(s); origError("ERR>", s.slice(0, 200)); };
console.warn = (...a) => { const s = a.map(String).join(" "); problems.push(s); origWarn("WARN>", s.slice(0, 200)); };

const { createElement, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeProvider, createTheme } = await import("@mui/material");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const NotificationsProvider = (await import("../src/NotificationsProvider")).default;
const { default: TasksView } = await import("../src/TasksView");

const theme = createTheme({ shape: { borderRadius: 28 }, palette: { primary: { main: "#171c8f" } } });
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
        { theme },
        createElement(NotificationsProvider, null, createElement(TasksView, {}))
      )
    )
  )
);

const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
const settle = async (ms = 350) => { for (let i = 0; i < Math.ceil(ms / 100); i += 1) await new Promise((r) => setTimeout(r, 100)); };

await settle(1200);
// переключение вкладок + группировка: гарантируем несколько повторных рендеров
const tabCompleted = [...host.querySelectorAll("button,[role=tab]")].find((b) => /Завершенные/.test(b.textContent));
if (tabCompleted) { click(tabCompleted); await settle(600); }
const tabActive = [...host.querySelectorAll("button,[role=tab]")].find((b) => /Активные/.test(b.textContent));
if (tabActive) { click(tabActive); await settle(600); }
const grouping = [...host.querySelectorAll("input[type=checkbox]")][0];
if (grouping) { click(grouping); await settle(600); }
if (grouping) { click(grouping); await settle(600); }
if (tabCompleted) { click(tabCompleted); await settle(800); }
if (tabActive) { click(tabActive); await settle(800); }

const text = host.textContent.replace(/\s+/g, " ").trim().slice(0, 400);
console.log("\n=== Результат ===");
console.log("DOM:", text || "(пусто)");
console.log("кнопки/табы:", [...host.querySelectorAll("button,[role=tab],input[type=checkbox]")].map((b) => (b.textContent || b.type || "?").trim()).filter(Boolean).slice(0, 12).join(" | "));

const hookProblems = problems.filter((p) => /order of Hooks|Should have a queue|Rendered more hooks|Rendered fewer hooks/i.test(p));
console.log("\n=== Предупреждения React о хуках:", hookProblems.length, "===");
hookProblems.slice(0, 3).forEach((p) => console.log("-", p.replace(/\s+/g, " ").slice(0, 400)));
const other = problems.filter((p) => !hookProblems.includes(p));
console.log("прочих error/warn:", other.length);
other.slice(0, 5).forEach((p) => console.log("*", p.replace(/\s+/g, " ").slice(0, 200)));
process.exit(0);
