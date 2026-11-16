// scripts/grant-task-behaviour-list.cjs
// Идемпотентное создание списка `TaskBehaviour` и его полей через локальный proxy
// (http://localhost:5000/api/web/...).
//
// Что делает:
//   1. Проверяет наличие списка `TaskBehaviour` — если нет, создаёт.
//   2. Создаёт поля: Behaviour (MultiLineText, AllowUnlimitedLength),
//      StylingResultButton (MultiLineText, AllowUnlimitedLength),
//      Description (Text), Enabled (Boolean, default true),
//      IsDobTask (Boolean, default false) — «задачи этого типа ведёт наша форма ДОБ».
//   3. Идемпотентно: повторный запуск пропускает уже существующие элементы.
//
// Использование:
//   node scripts/grant-task-behaviour-list.cjs --dry-run      # посмотреть, что сделает
//   node scripts/grant-task-behaviour-list.cjs                # применить
//   node scripts/grant-task-behaviour-list.cjs --list-id ID   # указать существующий list Id
//   PROXY=http://localhost:5000/api node scripts/grant-task-behaviour-list.cjs
//
// Переменные окружения:
//   PROXY  — база прокси (default: http://localhost:5000/api)
//   LIST_TITLE — имя списка (default: TaskBehaviour)

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PROXY = process.env.PROXY || "http://localhost:5000/api";
const LIST_TITLE = process.env.LIST_TITLE || "TaskBehaviour";
const DRY_RUN = process.argv.includes("--dry-run");
const LIST_ID_ARG = (process.argv.find((a) => a.startsWith("--list-id=")) || "").split("=")[1] || null;

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

function note(msg) { console.log(`[grant] ${msg}`); }
function err(msg) { console.error(`[grant:ERROR] ${msg}`); }

async function listExists() {
  const r = await req(`${PROXY}/web/lists/getbytitle('${encodeURIComponent(LIST_TITLE)}')`);
  if (r.status === 200 && r.json?.d?.Id) {
    return { id: r.json.d.Id, title: r.json.d.Title };
  }
  if (r.status === 404) return null;
  throw new Error(`getbytitle status=${r.status}: ${r.body.slice(0, 300)}`);
}

async function createList() {
  const body = {
    __metadata: { type: "SP.List" },
    BaseTemplate: 100,
    Title: LIST_TITLE,
    Description: "Поведение Result-кнопок по ContentType (Behaviour + StylingResultButton). См. docs/feature-taskbehaviour.md",
    AllowContentTypes: false,
    EnableVersioning: false,
  };
  const r = await req(`${PROXY}/web/lists`, { method: "POST", body });
  if (r.status !== 201) throw new Error(`createList status=${r.status}: ${r.body.slice(0, 300)}`);
  return r.json.d.Id;
}

async function listFields(listId) {
  const r = await req(`${PROXY}/web/lists(guid'${listId}')/fields?$select=InternalName,Title,TypeAsString&$filter=InternalName ne 'Title'&$top=200`);
  if (r.status !== 200) throw new Error(`listFields status=${r.status}: ${r.body.slice(0, 300)}`);
  return (r.json.d.results || []).map((f) => ({ InternalName: f.InternalName, Title: f.Title, TypeAsString: f.TypeAsString }));
}

const FIELDS_TO_ENSURE = [
  {
    InternalName: "Behaviour",
    Title: "Behaviour",
    TypeAsString: "Note",
    Schema: { RichText: false, UnlimitedLengthInDocumentLibrary: true },
  },
  {
    InternalName: "StylingResultButton",
    Title: "StylingResultButton",
    TypeAsString: "Note",
    Schema: { RichText: false, UnlimitedLengthInDocumentLibrary: true },
  },
  {
    InternalName: "Description",
    Title: "Description",
    TypeAsString: "Text",
    Schema: {},
  },
  {
    InternalName: "Enabled",
    Title: "Enabled",
    TypeAsString: "Boolean",
    Schema: { DefaultValue: "1" },
  },
  {
    // Признак «задача ДОБ»: задачи этого типа открываются нашей формой
    // (#dob_tasks/<id>) и закрываются формой по колонкам типа контента.
    // Настраивается на КАЖДЫЙ тип контента своей записью (Title = имя CT).
    InternalName: "IsDobTask",
    Title: "IsDobTask",
    TypeAsString: "Boolean",
    Schema: { DefaultValue: "0" },
  },
];

async function createField(listId, f) {
  // SP типы: Note → FieldTypeKind 3, Text → 2, Boolean → 8
  const kindMap = { Note: 3, Text: 2, Boolean: 8 };
  const body = {
    __metadata: { type: "SP.FieldMultiLineText" },
    FieldTypeKind: kindMap[f.TypeAsString] || 3,
    InternalName: f.InternalName,
    Title: f.Title,
    Required: false,
    StaticName: f.InternalName,
    ...f.Schema,
  };
  // SP определяет тип по FieldTypeKind; __metadata лучше указывать конкретный
  if (f.TypeAsString === "Text") body.__metadata = { type: "SP.FieldText" };
  if (f.TypeAsString === "Boolean") body.__metadata = { type: "SP.FieldBoolean" };

  const r = await req(`${PROXY}/web/lists(guid'${listId}')/fields`, { method: "POST", body });
  if (r.status !== 201) throw new Error(`createField ${f.InternalName} status=${r.status}: ${r.body.slice(0, 300)}`);
  return r.json.d;
}

async function ensureField(listId, f, existingFields) {
  if (existingFields.some((e) => e.InternalName === f.InternalName)) {
    note(`field ${f.InternalName} уже существует — пропускаю`);
    return null;
  }
  if (DRY_RUN) {
    note(`[dry-run] создал бы поле ${f.InternalName} (${f.TypeAsString})`);
    return null;
  }
  note(`создаю поле ${f.InternalName} (${f.TypeAsString})…`);
  return createField(listId, f);
}

async function main() {
  note(`PROXY=${PROXY}`);
  note(`LIST_TITLE=${LIST_TITLE}`);
  note(`режим: ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);

  let list = LIST_ID_ARG ? { id: LIST_ID_ARG, title: LIST_TITLE } : null;
  if (!list) {
    list = await listExists();
    if (list) note(`список уже существует: ${list.title} (${list.id})`);
  }
  if (!list) {
    if (DRY_RUN) { note(`[dry-run] создал бы список ${LIST_TITLE}`); return; }
    note(`создаю список ${LIST_TITLE}…`);
    const id = await createList();
    list = { id, title: LIST_TITLE };
    note(`список создан: ${list.title} (id=${id})`);
  }

  const existing = await listFields(list.id);
  note(`существующих полей: ${existing.length}`);

  for (const f of FIELDS_TO_ENSURE) {
    await ensureField(list.id, f, existing);
  }

  note("готово.");
  note(`---\nСледующие шаги:`);
  note(`1) node scripts/grant-ct-lookup.cjs                       # добавить BehaviourConfig lookup на CT`);
  note(`2) создать запись в ${LIST_TITLE} (Behaviour + StylingResultButton)`);
  note(`3) в CT указать BehaviourConfig = эту запись (см. plan §Шаг 5)`);
  note(`4) node scripts/migrate-ct-behaviour.cjs --dry-run       # посмотреть миграцию с legacy`);
}

main().catch((e) => {
  err(String(e?.stack || e?.message || e));
  process.exit(1);
});