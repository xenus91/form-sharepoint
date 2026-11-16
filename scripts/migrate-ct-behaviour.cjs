// scripts/migrate-ct-behaviour.cjs
// Миграция legacy-данных из `TaskPromptFields` + `TaskResultDefinitions` в `TaskBehaviour`.
//
// Что делает:
//   1. Тянет все записи из TaskPromptFields и TaskResultDefinitions через proxy.
//   2. Группирует по ContentTypeId (с parent-prefix свёрткой по правилам resolveTaskResultDefinition).
//   3. Строит компактный JSON `Behaviour` и `StylingResultButton` для каждого CT.
//   4. По умолчанию: печатает JSON и не делает никаких изменений.
//   5. С `--apply` — создаёт записи в TaskBehaviour (если их нет) и печатает PowerShell-фрагмент
//      для привязки lookup-значения к CT (этот шаг требует админских прав и не автоматизируется).
//
// Использование:
//   node scripts/migrate-ct-behaviour.cjs --dry-run     # по умолчанию — посмотреть JSON
//   node scripts/migrate-ct-behaviour.cjs --apply       # создать записи в TaskBehaviour
//   PROXY=http://localhost:5000/api node scripts/migrate-ct-behaviour.cjs

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PROXY = process.env.PROXY || "http://localhost:5000/api";
const APPLY = process.argv.includes("--apply");
const PROMPT_LIST_TITLE = "TaskPromptFields";
const DEF_LIST_TITLE = "TaskResultDefinitions";
const BEHAVIOUR_LIST_TITLE = "TaskBehaviour";

function req(urlStr, { method = "GET", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
        ...headers,
      },
    };
    const r = lib.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: data, json: parsed });
      });
    });
    r.on("error", reject);
    if (body) r.write(typeof body === "string" ? body : JSON.stringify(body));
    r.end();
  });
}

const note = (m) => console.log(`[migrate] ${m}`);
const err = (m) => console.error(`[migrate:ERROR] ${m}`);

function parseBool(v, fb = false) {
  if (v === undefined || v === null || v === "") return fb;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  const s = String(v).trim().toLowerCase();
  return s === "да" || s === "true" || s === "yes";
}
function normCtype(s) { return String(s || "").trim().toLowerCase(); }
function normKey(s) { return String(s || "").trim().toLowerCase(); }

async function fetchPromptFields() {
  const r = await req(`${PROXY}/web/lists/getbytitle('${PROMPT_LIST_TITLE}')/items?$select=Id,CType,ResultValue,FieldInternalName,FieldTitle,FieldType,Required,SortOrder,Enabled&$filter=Enabled eq 1&$top=500`);
  if (r.status !== 200) {
    if (r.status === 404) return [];
    throw new Error(`fetchPromptFields status=${r.status}: ${r.body.slice(0, 300)}`);
  }
  return (r.json.d.results || []).map((r) => ({
    CType: normCtype(r.CType),
    ResultValue: String(r.ResultValue || "").trim(),
    FieldInternalName: String(r.FieldInternalName || "").trim(),
    FieldTitle: String(r.FieldTitle || "").trim(),
    FieldType: String(r.FieldType || "text").trim().toLowerCase(),
    Required: parseBool(r.Required, false),
    SortOrder: r.SortOrder != null ? Number(r.SortOrder) : 999,
  })).filter((r) => r.CType && r.ResultValue && r.FieldInternalName);
}

async function fetchResultDefs() {
  const r = await req(`${PROXY}/web/lists/getbytitle('${DEF_LIST_TITLE}')/items?$select=Id,CType,ResultValue,ShowAdditionalActions,AdditionalsActionsRequired,RequiresConfirmed,Color,Variant,Gradient,SortOrder,Enabled&$filter=Enabled eq 1&$top=500`);
  if (r.status !== 200) {
    if (r.status === 404) return [];
    throw new Error(`fetchResultDefs status=${r.status}: ${r.body.slice(0, 300)}`);
  }
  return (r.json.d.results || []).map((r) => ({
    CType: normCtype(r.CType),
    ResultValue: String(r.ResultValue || "").trim(),
    Show: parseBool(r.ShowAdditionalActions, null),
    Required: parseBool(r.AdditionalsActionsRequired ?? r.AdditionalActionsRequired, null),
    RequiresConfirmed: parseBool(r.RequiresConfirmed, null),
    Color: r.Color ? String(r.Color).trim() : null,
    Variant: r.Variant ? String(r.Variant).trim() : null,
    Gradient: r.Gradient ? String(r.Gradient).trim() : null,
  })).filter((r) => r.CType && r.ResultValue);
}

async function fetchExistingBehaviourConfigs() {
  const r = await req(`${PROXY}/web/lists/getbytitle('${BEHAVIOUR_LIST_TITLE}')/items?$select=Id,Title&$top=500`);
  if (r.status !== 200) {
    if (r.status === 404) return [];
    throw new Error(`fetchExisting status=${r.status}: ${r.body.slice(0, 300)}`);
  }
  return (r.json.d.results || []).map((r) => ({ Id: r.Id, Title: r.Title }));
}

function findBestMatch(items, ctId, resultValue) {
  // items — массив {CType, ...}; ctId — нормализованный CT.
  // Найти exact (CType === ctId) → иначе prefix (ctId.startsWith(CType) — самый длинный).
  const n = normKey(resultValue);
  const exact = items.find((i) => i.CType === ctId && normKey(i.ResultValue) === n);
  if (exact) return exact;
  let best = null, bestLen = -1;
  for (const it of items) {
    if (normKey(it.ResultValue) !== n) continue;
    if (ctId.startsWith(it.CType) && it.CType.length > bestLen) { best = it; bestLen = it.CType.length; }
  }
  return best;
}

function buildBehaviourJson(promptFieldsForCt, defsForCt) {
  const out = {};
  // Группируем по choice
  const byChoice = new Map();
  for (const pf of promptFieldsForCt) {
    if (!byChoice.has(pf.ResultValue)) byChoice.set(pf.ResultValue, []);
    byChoice.get(pf.ResultValue).push(pf);
  }
  for (const [choice, fields] of byChoice.entries()) {
    const sorted = [...fields].sort((a, b) => a.SortOrder - b.SortOrder);
    out[normKey(choice)] = {
      p: sorted.map((f) => {
        const obj = { f: f.FieldInternalName };
        if (f.FieldTitle && f.FieldTitle !== f.FieldInternalName) obj.ti = f.FieldTitle;
        if (f.FieldType === "multiline" || f.FieldType === "multi" || f.FieldType === "textarea") obj.t = "multiline";
        if (f.Required) obj.r = true;
        return obj;
      }),
    };
  }
  // Накатываем дефолты из TaskResultDefinitions
  for (const d of defsForCt) {
    const n = normKey(d.ResultValue);
    if (!out[n]) out[n] = {};
    if (d.RequiresConfirmed === true) out[n].c = true;
    // showAdditionalActions/additionalActionsRequired — НЕ накатываем, потому что они на CT
    // остаются в TaskResultDefinitions (ваше решение).
  }
  return out;
}

function buildStylingJson(defsForCt) {
  const out = { _default: { bg: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", c: "#fff", v: "ctd" } };
  for (const d of defsForCt) {
    if (!d.Color && !d.Variant && !d.Gradient) continue;
    const n = normKey(d.ResultValue);
    const entry = {};
    // Color MUI-name → конвертируем в градиент по имени
    const colorMap = {
      success: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)",
      error:   "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)",
      warning: "linear-gradient(180deg, #ed6c02 0%, #b85400 100%)",
      info:    "linear-gradient(180deg, #0288d1 0%, #01579b 100%)",
    };
    if (d.Gradient) entry.bg = d.Gradient;
    else if (d.Color && colorMap[d.Color.toLowerCase()]) entry.bg = colorMap[d.Color.toLowerCase()];
    else if (d.Color) entry.bg = d.Color; // raw CSS
    if (d.Variant) {
      const v = d.Variant.toLowerCase();
      if (v === "outlined") entry.v = "out";
      else if (v === "text") entry.v = "tx";
      else entry.v = "ctd";
    }
    if (Object.keys(entry).length) out[n] = entry;
  }
  return out;
}

async function main() {
  note(`PROXY=${PROXY}`);
  note(`режим: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  note("тяну legacy данные…");
  const [promptFields, defs, existing] = await Promise.all([fetchPromptFields(), fetchResultDefs(), fetchExistingBehaviourConfigs()]);
  note(`prompt fields: ${promptFields.length}, result defs: ${defs.length}, существующие TaskBehaviour: ${existing.length}`);

  // Группируем по CT
  const byCtype = new Map();
  for (const pf of promptFields) {
    if (!byCtype.has(pf.CType)) byCtype.set(pf.CType, { promptFields: [], defs: [] });
    byCtype.get(pf.CType).promptFields.push(pf);
  }
  for (const d of defs) {
    if (!byCtype.has(d.CType)) byCtype.set(d.CType, { promptFields: [], defs: [] });
    byCtype.get(d.CType).defs.push(d);
  }

  // Набор CT, для которых есть записи в legacy (даже пустые defs без promptFields дают стилевые миграции)
  const ctIds = Array.from(byCtype.keys()).sort();
  note(`найдено CT для миграции: ${ctIds.length}`);

  const proposed = [];
  for (const ctId of ctIds) {
    const group = byCtype.get(ctId);
    const behaviour = buildBehaviourJson(group.promptFields, group.defs);
    const styling = buildStylingJson(group.defs);
    const title = `${ctId} — поведение (миграция)`;
    proposed.push({ ctId, title, behaviour, styling });
  }

  for (const p of proposed) {
    console.log("");
    console.log(`=== CT ${p.ctId.slice(0, 18)}… ===`);
    console.log("Title:", p.title);
    console.log("Behaviour:");
    console.log(JSON.stringify(p.behaviour));
    console.log("StylingResultButton:");
    console.log(JSON.stringify(p.styling));
  }

  if (!APPLY) {
    note("[dry-run] ничего не создавал. Для применения: node scripts/migrate-ct-behaviour.cjs --apply");
    return;
  }

  note("создаю записи в TaskBehaviour (идемпотентно — пропускаю уже существующие)…");
  for (const p of proposed) {
    const alreadyExists = existing.some((e) => e.Title === p.title);
    if (alreadyExists) { note(`пропускаю "${p.title}" (уже есть)`); continue; }
    const body = {
      __metadata: { type: "SP.Data.TaskBehaviourListItem" },
      Title: p.title,
      Behaviour: JSON.stringify(p.behaviour),
      StylingResultButton: JSON.stringify(p.styling),
      Description: `Мигрировано из TaskPromptFields+TaskResultDefinitions для CT ${p.ctId}.`,
      Enabled: true,
    };
    const r = await req(`${PROXY}/web/lists/getbytitle('${BEHAVIOUR_LIST_TITLE}')/items`, { method: "POST", body });
    if (r.status !== 201) { err(`create ${p.title} status=${r.status}: ${r.body.slice(0, 300)}`); continue; }
    note(`создана запись "${p.title}" (id=${r.json.d.Id})`);
  }

  note("---");
  note("Следующий шаг: привяжите BehaviourConfig lookup к нужным CT. PowerShell:");
  note(`   Connect-PnPOnline -Url "<site>" -UseWebLogin`);
  note(`   $config = Get-PnPListItem -List "TaskBehaviour" -Query "<View><Query><Where><Eq><FieldRef Name='Title'/><Value Type='Text'>ИСПРАВЛЕНИЕ ПРОБЛЕМНОЙ ЕО — поведение (миграция)</Value></Eq></Where></Query></View>"`);
  note(`   # CT-API напрямую default-value на lookup не ставится — откройте CT в браузере и выберите config в форме, либо через SP REST:`);
  note(`   # (см. plan §Шаг 5 — привязка через UpdateListContentType или через DefaultValue поля)`);
}

main().catch((e) => { err(String(e?.stack || e?.message || e)); process.exit(1); });