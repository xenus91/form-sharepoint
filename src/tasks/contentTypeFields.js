// src/tasks/contentTypeFields.js
// Форма задачи строится ИСКЛЮЧИТЕЛЬНО по типу контента и типам колонок SharePoint:
// запрашиваем поля конкретного CT (/contenttypes('<id>')?$expand=Fields), отбрасываем
// системные/служебные и раскладываем по видам контролов.
//
// Виды контролов (kind):
//   richtext      — Note (многострочный, RTF) → RichEditor
//   multiline     — Note/Text без разметки
//   text          — Text
//   autocomplete  — Choice (подсказки из Choices; свой вариант, если FillInChoice)
//   choice        — Choice без свободного ввода
//   multichoice   — MultiChoice
//   number        — Number/Currency/Integer
//   boolean       — Boolean
//   date          — DateTime
//   person        — User/UserMulti («Пользователь или группа»): автокомплит по
//                   учётной записи с многократным выбором (см. tasks/userSearch.js)
//   url           — URL
//
// Обязательность — строго из метаданных SharePoint (Required). Поля, которые
// SharePoint помечает как обязательные, проверяются перед отправкой.

import apiClient from "../api";
import { TASKS_LIST_API } from "./config";

/** Тип контента «Результат проверки ООБ» (портал Лента, группа ProblemsPallet). */
export const RESULT_CHECK_OOO_CT_ID =
  "0x0108003365C4474CAE8C42BCE396314E88E51F00DDA2B3C73567D14D8127B2CBCC18DC19";

/** Имя типа контента, по которому включается закрытие через диалог (по названию). */
export const RESULT_CHECK_OOO_CT_NAME = "Результат проверки ООБ";

// Системные поля списка, служебные поля SharePoint и инфраструктура «Задача
// рабочего процесса»: в форме закрытия они не нужны (меняются самим движком).
export const SYSTEM_AND_TASK_FIELDS = new Set([
  "ID", "Id", "Title", "Body", "Attachments", "ContentType", "ContentTypeId",
  "Created", "Modified", "Author", "Editor", "AssignedTo", "PercentComplete",
  "Status", "TaskStatus", "Priority", "Predecessors", "RelatedItems",
  "StartDate", "TaskDueDate", "DueDate", "Completed",
  "WorkflowVersion", "WorkflowInstanceID", "WorkflowName", "WorkflowStatus",
  "GUID", "UniqueId", "MetaInfo", "ScopeId", "Edit", "LinkTitle", "LinkTitleNoMenu",
  "DocIcon", "ItemChildCount", "FolderChildCount", "AppAuthor", "AppEditor",
  "_UIVersionString", "ContentVersion", "owshiddenversion", "FileRef", "FileDirRef",
  "FSObjType", "ServerUrl", "_ComplianceFlags", "_ComplianceTag", "_IsRecord",
  "_Dirty", "_HasCopyDestinations", "_CopySource", "_ModerationStatus",
  "_ModerationComments", "InstanceID", "PermMask", "SelectTitle",
]);

// Человекочитаемые подписи там, где SharePoint отдаёт внутреннее имя вместо названия
// (Title совпадает с InternalName). Ключ — InternalName.
export const FIELD_LABEL_OVERRIDES = {
  DescriptionCheckResult: "Описание результата проверки",
  DobSearchResult: "Результат проверки",
  ErrorCountValidation: "Кол-во ошибок",
  ErrorTypeValidation: "Тип ошибки",
  Guilty: "Виновный",
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_PREFIX = "sp:ctFields:";
const _cache = new Map(); // ctId -> { at, fields }

function getStorage() {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch (_e) { void _e; }
  return null;
}

/** Сброс кэша полей типов контента (тесты/отладка). */
export function clearContentTypeFieldsCache() {
  _cache.clear();
  const storage = getStorage();
  if (!storage) return;
  try {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const k = storage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) storage.removeItem(k);
    }
  } catch (_e) { void _e; }
}

function cacheGet(ctId) {
  const hit = _cache.get(ctId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.fields;
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${ctId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.fields) && Date.now() - parsed.at < CACHE_TTL_MS) {
      _cache.set(ctId, parsed);
      return parsed.fields;
    }
  } catch (_e) { void _e; }
  return null;
}

function cacheSet(ctId, fields) {
  const entry = { at: Date.now(), fields };
  _cache.set(ctId, entry);
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(`${STORAGE_PREFIX}${ctId}`, JSON.stringify(entry));
  } catch (_e) { void _e; }
}

const FIELD_PROPS = [
  "InternalName", "Title", "TypeAsString", "TypeDisplayName", "Required", "Hidden",
  "ReadOnlyField", "Choices", "FillInChoice", "AllowMultipleValues", "LookupList",
  "LookupField", "Description", "Id",
];

const FIELD_SELECT = FIELD_PROPS.map((p) => `Fields/${p}`).join(",");

function fieldResults(data) {
  const d = data?.d ?? data ?? null;
  if (!d) return [];
  const fields = d.Fields;
  if (!fields) return [];
  if (Array.isArray(fields)) return fields;
  return Array.isArray(fields.results) ? fields.results : [];
}

function listFields(data) {
  const d = data?.d ?? data ?? null;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return Array.isArray(d.results) ? d.results : [];
}

/**
 * Поля типа контента (с учётом наследования от родительского шаблона).
 * @param {string} ctId — StringId типа контента (0x0108…)
 * @param {{ get?: Function, forceRefresh?: boolean }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function fetchContentTypeFields(ctId, opts = {}) {
  const id = String(ctId || "").trim();
  if (!id) return [];
  if (!opts.forceRefresh) {
    const cached = cacheGet(id);
    if (cached) return cached;
  }
  const get = opts.get || ((url, cfg) => apiClient.get(url, cfg));
  const ACCEPT = { headers: { Accept: "application/json;odata=verbose" } };
  const quoted = id.replace(/'/g, "''");

  // 1) Поля прямо у типа контента (самый точный источник)
  try {
    const url = `${TASKS_LIST_API}/contenttypes('${quoted}')?$expand=Fields&$select=${FIELD_SELECT}`;
    const resp = await get(url, ACCEPT);
    const fields = fieldResults(resp.data);
    if (fields.length > 0) {
      cacheSet(id, fields);
      return fields;
    }
  } catch (e) {
    if (e?.response?.status && ![400, 404].includes(e.response.status)) {
      console.warn("[contentTypeFields] CT fields failed", e.response.status);
    }
  }

  // 2) Фолбэк: все поля списка + FieldLinks типа контента (по Id поля)
  try {
    const [allResp, linksResp] = await Promise.all([
      get(`${TASKS_LIST_API}/fields?$top=500`, ACCEPT),
      get(`${TASKS_LIST_API}/contenttypes('${quoted}')?$expand=FieldLinks`, ACCEPT),
    ]);
    const all = listFields(allResp.data);
    const linksRaw = linksResp?.data?.d?.FieldLinks;
    const links = Array.isArray(linksRaw) ? linksRaw : (Array.isArray(linksRaw?.results) ? linksRaw.results : []);
    const linkIds = new Set(links.map((l) => String(l?.Id || "").toLowerCase()).filter(Boolean));
    const fields = linkIds.size > 0
      ? all.filter((f) => linkIds.has(String(f?.Id || "").toLowerCase()))
      : all;
    if (fields.length > 0) {
      cacheSet(id, fields);
      return fields;
    }
  } catch (e) {
    console.warn("[contentTypeFields] fallback failed", e?.response?.status || e?.message);
  }
  return [];
}

/**
 * ContentTypeId из любого представления: строка, объект SharePoint
 * ({ StringValue } / { StringId } / { Id }), с OData-префиксом, из raw-элемента.
 * @param {any} value
 * @returns {string}
 */
export function contentTypeIdOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const inner = value.StringValue || value.StringId || value.Value
      || (typeof value.Id === "string" ? value.Id : value.Id?.StringValue);
    return inner ? String(inner).trim() : "";
  }
  return "";
}

/**
 * ContentTypeId задачи — в любой форме, в которой он пришёл из SharePoint:
 * mapping (contentTypeId/ContentTypeId), raw-элемент, OData-префикс, объект.
 * Раньше поддерживалась только строка + raw.StringValue — из-за этого задача
 * «Результат проверки ООБ» могла не распознаваться и открывалась карточкой.
 *
 * @param {any} task
 * @returns {string}
 */
export function taskContentTypeId(task) {
  if (!task || typeof task !== "object") return "";
  const raw = task.raw || null;
  const candidates = [
    task.contentTypeId,
    task.ContentTypeId,
    task.OData__ContentTypeId,
    task.ContentType,
    raw?.contentTypeId,
    raw?.ContentTypeId,
    raw?.OData__ContentTypeId,
    raw?.ContentType,
    raw?.ContentTypeId?.Id,
  ];
  for (const candidate of candidates) {
    const id = contentTypeIdOf(candidate);
    if (id) return id;
  }
  return "";
}

/** Имя типа контента задачи (если SharePoint его отдал). */
export function taskContentTypeName(task) {
  if (!task || typeof task !== "object") return "";
  const raw = task.raw || null;
  const candidates = [
    task.contentTypeName,
    task.ContentTypeName,
    raw?.ContentTypeName,
    typeof task.ContentType === "object" ? task.ContentType?.Name : null,
    typeof raw?.ContentType === "object" ? raw?.ContentType?.Name : null,
  ];
  for (const candidate of candidates) {
    const name = String(candidate || "").trim();
    if (name) return name;
  }
  return "";
}

/**
 * Задача типа контента «Результат проверки ООБ» (id ИЛИ имя — что доступно).
 * Такие задачи ведут себя как задачи сайта ДОБ: форма DobTaskEditView закрывает
 * их через форму по колонкам типа контента.
 *
 * @param {any} task
 * @returns {boolean}
 */
export function isResultCheckTask(task) {
  const id = taskContentTypeId(task).toLowerCase();
  if (id && id === RESULT_CHECK_OOO_CT_ID.toLowerCase()) return true;
  const name = taskContentTypeName(task).toLowerCase();
  return name !== "" && name === RESULT_CHECK_OOO_CT_NAME.toLowerCase();
}

/**
 * Нужно ли закрывать задачу через диалог по типу контента.
 *   • Behaviour `dlg: true` → да (для любого результата);
 *   • `dlg: false` → нет (явное отключение, даже для «Результат проверки ООБ»);
 *   • иначе — да, если тип контента задачи это «Результат проверки ООБ»:
 *     он по требованию закрывается ТОЛЬКО через диалог ДОБ.
 */
export function isDialogRequired(rule, ctId, ctName = "") {
  if (rule?.requiresDialog === false) return false;
  if (rule?.requiresDialog === true) return true;
  const id = contentTypeIdOf(ctId).toLowerCase();
  if (id !== "" && id === RESULT_CHECK_OOO_CT_ID.toLowerCase()) return true;
  const name = String(ctName || "").trim().toLowerCase();
  return name !== "" && name === RESULT_CHECK_OOO_CT_NAME.toLowerCase();
}

function normType(field) {
  return String(field?.TypeAsString || "").trim().toLowerCase();
}

function allowMultiple(field) {
  return field?.AllowMultipleValues === true
    || normType(field) === "usermulti"
    || normType(field) === "lookupmulti"
    || normType(field) === "multichoice"
    || normType(field) === "taxonomyfieldtypemulti";
}

function choicesOf(field) {
  const raw = field?.Choices;
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
  return list.map((v) => String(v).trim()).filter(Boolean);
}

/** Вид контрола по типу колонки (или null — поле не показываем/не поддерживаем). */
export function controlKindOf(field) {
  const t = normType(field);
  switch (t) {
    case "note":
      return "richtext";
    case "text":
      return "text";
    case "choice":
      return "autocomplete";
    case "multichoice":
      return "multichoice";
    case "number":
    case "currency":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "datetime":
      return "date";
    case "user":
    case "usermulti":
      return "person";
    case "url":
      return "url";
    case "lookup":
    case "lookupmulti":
      return "lookup";
    default:
      return null;
  }
}

/**
 * Показываем ли поле в форме закрытия.
 * Скрытые/только для чтения/системные — нет; Calculated/Computed/Taxonomy — нет.
 */
export function isFormField(field) {
  if (!field || !field.InternalName) return false;
  if (field.Hidden === true || field.ReadOnlyField === true) return false;
  if (SYSTEM_AND_TASK_FIELDS.has(field.InternalName)) return false;
  const kind = controlKindOf(field);
  if (!kind) return false;
  // Lookup'ы в форме закрытия не показываем: их payload требует Collection(Edm.Int32)
  // и связи со списком-источником (как у «Пользователь или группа», но без поиска людей).
  if (kind === "lookup") return false;
  return true;
}

/**
 * Описание формы закрытия по полям типа контента.
 * @param {Array<object>} fields — поля из fetchContentTypeFields
 * @param {{ resultFieldInternalNames?: string[], onlyRequired?: boolean }} [opts]
 * @returns {{ resultBlock: object|null, controls: object[], required: object[] }}
 */
export function buildContentTypeForm(fields = [], opts = {}) {
  const resultNames = new Set((opts.resultFieldInternalNames || []).map((n) => String(n).toLowerCase()));
  const isResultChoiceField = (field) => {
    const internal = String(field.InternalName || "");
    if (resultNames.has(internal.toLowerCase())) return true;
    const display = String(field.TypeDisplayName || "").toLowerCase();
    const shortDesc = String(field.TypeShortDescription || "").toLowerCase();
    if (display.includes("результирующий выбор") || shortDesc.includes("результат задачи")) return true;
    // Эвристика по имени поля (когда метаданные не отдали тип): ResultSearchTHU,
    // ResultOOB, DobSearchResult. Специально НЕ ловим «…CheckResult» (описание проверки).
    const compact = internal.toLowerCase();
    return compact.startsWith("result")
      || compact.includes("searchresult")
      || compact.includes("resultsearch");
  };

  const controls = [];
  let resultBlock = null;
  const seen = new Set();
  for (const field of fields || []) {
    if (!field || !field.InternalName || seen.has(field.InternalName)) continue;
    if (field.Hidden === true) continue;
    seen.add(field.InternalName);
    if (isFormField(field) && isResultChoiceField(field)) {
      // Кнопки результата — отдельный блок (DobSearchResult и любой «Результирующий выбор»)
      if (!resultBlock) {
        resultBlock = {
          internalName: field.InternalName,
          title: field.Title && field.Title !== field.InternalName ? field.Title : (FIELD_LABEL_OVERRIDES[field.InternalName] || "Результат"),
          choices: choicesOf(field),
          required: field.Required === true,
          allowFillIn: field.FillInChoice === true,
        };
      }
      continue;
    }
    if (!isFormField(field)) continue;
    const kind = controlKindOf(field);
    const title = field.Title && field.Title !== field.InternalName
      ? String(field.Title)
      : (FIELD_LABEL_OVERRIDES[field.InternalName] || String(field.InternalName));
    controls.push({
      internalName: field.InternalName,
      title,
      kind,
      typeAsString: String(field.TypeAsString || ""),
      required: field.Required === true,
      choices: choicesOf(field),
      allowFillIn: field.FillInChoice === true,
      multiple: allowMultiple(field),
      description: field.Description ? String(field.Description) : "",
    });
  }
  return {
    resultBlock,
    controls,
    required: controls.filter((c) => c.required),
  };
}

/** Текст без HTML — для проверки «рич-текст заполнен». */
export function plainText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Проверка обязательных полей (как в SharePoint: Required=true).
 * @returns {string[]} список сообщений об ошибке (пусто → можно отправлять)
 */
export function validateRequiredFields(controls = [], values = {}, resultBlock = null, result = "") {
  const problems = [];
  if (resultBlock?.required && !String(result || "").trim()) {
    problems.push(`Укажите «${resultBlock.title}»`);
  }
  for (const control of controls) {
    if (!control.required) continue;
    const value = values[control.internalName];
    const isEmpty = (v) => {
      if (v === undefined || v === null) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === "number") return Number.isNaN(v);
      if (typeof v === "object") return Object.keys(v).length === 0;
      const text = control.kind === "richtext" ? plainText(v) : String(v).trim();
      return text.length === 0;
    };
    if (isEmpty(value)) problems.push(`Заполните «${control.title}»`);
  }
  return problems;
}
