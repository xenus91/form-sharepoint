// preview/take-check.mjs — проверка взятия задачи dob в работу без тенанта (jsdom).
//
// Воспроизводит реальный кейс пользователя: dob-задача из списка RequestsTask
// (03fc1b92-…) не бралась в работу из-за 400
// «Найдена запись без имени типа, но не указан ожидаемый тип…».
//
// Мок DOB-API (preview/mockDob.js) ведёт себя как SharePoint: MERGE без
// `__metadata.type` → 400 с тем же текстом. Проверка гоняет настоящий
// `takeTaskInWork` из src/tasks/mutations/takeTaskInWork.js и печатает:
//   • результат взятия,
//   • тело MERGE (тип элемента обязателен),
//   • и то, что мок действительно отвергает payload без типа.
//
// Запуск:
//   npx vite-node --config preview/vite.config.js preview/take-check.mjs

import "./jsdom-setup.mjs";

const { getSourceById } = await import("../src/tasks/sources.js");
const { takeTaskInWork } = await import("../src/tasks/mutations/takeTaskInWork.js");
const mock = await import("./mockDob.js");

let problems = 0;
const check = (ok, label, extra = "") => {
  if (!ok) problems += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const source = getSourceById("dob");
console.log("Источник:", source.id, source.listApi);

const res = await takeTaskInWork("dob:1", { allSources: [source] });
console.log("Результат взятия:", JSON.stringify(res));
check(res.ok === true, "задача взята в работу без ошибки", res.message || "");
check(res.status === "В работе", "статус установлен в «В работе»", String(res.status));

const merge = mock.dobRequests.find((r) => r.method === "MERGE");
console.log("MERGE:", merge?.url);
console.log("MERGE body:", JSON.stringify(merge?.body));
check(!!merge, "MERGE ушёл в список источника");
check(merge?.url?.includes(`lists(guid'${mock.DOB_TASKS_LIST_GUID.toLowerCase()}')/items(1)`), "MERGE целится в элемент dob-списка");
check(merge?.body?.__metadata?.type === mock.DOB_TASKS_ENTITY_TYPE, "в теле MERGE есть __metadata.type (иначе SharePoint 400)");
check(merge?.body?.Status === "В работе", "в теле MERGE есть новый статус");

// Контроль: без типа мок (как и SharePoint) обязан ответить той самой ошибкой —
// значит проверка выше не «проходит сама собой».
let refused = null;
try {
  await mock.dobAxios.post(
    "/dob-api/sites/dob/doblogistic/_api" + mock.DOB_TASKS_LIST_API + "/items(1)",
    { Status: "В работе" },
    { headers: { "X-HTTP-Method": "MERGE", "If-Match": "*" } }
  );
} catch (e) {
  refused = e;
}
check(refused?.response?.status === 400, "payload без типа отвергнут (как в SharePoint)", `status: ${refused?.response?.status}`);
check(
  /без имени типа, но не указан ожидаемый тип/.test(String(refused?.response?.data?.error?.message?.value || "")),
  "текст ошибки совпадает с тем, что видел пользователь"
);

console.log(`\n=== Итог: ${problems === 0 ? "ОК — 400 при взятии dob-задачи закрыт" : `проблем: ${problems}`} ===`);
process.exit(problems === 0 ? 0 : 1);
