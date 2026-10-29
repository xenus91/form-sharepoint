// preview/ct-check.mjs — диагностика: какой CT и какая запись TaskBehaviour находятся для задачи.
import "./jsdom-setup.mjs";
const { tasks, taskConfig } = await import("./CardsScene");
const { findContentTypeMeta, resolveTaskBehaviourByName } = await import("../src/services/taskBehaviour");

console.log("=== CT в сцене ===");
for (const [id, meta] of taskConfig.ctMetaMap.entries()) console.log(id.slice(-14), "→", meta.name);
console.log("\n=== Задачи ===");
for (const t of tasks) {
  const ctId = t.contentTypeId;
  const meta = findContentTypeMeta(ctId, taskConfig.ctMetaMap);
  const rec = resolveTaskBehaviourByName(meta?.name, taskConfig.taskBehaviour);
  console.log(
    `#${t.Id} ct=…${String(ctId).slice(-14)} → name="${meta?.name}" → запись="${rec?.raw?.title ?? "НЕТ"}" (${rec?.matchedBy ?? "—"})`
  );
}
process.exit(0);
