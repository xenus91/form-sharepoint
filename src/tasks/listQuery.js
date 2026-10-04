// src/tasks/listQuery.js
// Чистый билдер URL для REST-запроса списка задач.
// Раньше жило inline в TasksView.jsx как closure-функция buildUrl() внутри loadTasks —
// вынесено в Tier 3 (Q11) для упрощения loadTasks и переиспользования в других местах.
//
// Multi-source: у каждого источника свой набор полей, поэтому select строится
// из «профиля» (main | external) и списка доступных полей (taskFieldNames):
//   • main     — историческое поведение (Location1, ResultSearchTHU, OffDepKey,
//                AdditionalActions, результат-поля) с ретраями в fetchTasksForSource;
//   • external — только безопасное ядро + те поля, которые реально есть в списке.
//                ResultSearchTHU/Location1 на сайтах-источниках обычно отсутствуют,
//                и запрос падал с 400 «Столбец … не существует» — таблица была пустой.

import { TASKS_LIST_API } from "./config";
import { getGroupIdsFromDistribution } from "./distribution";

// Ядро, которое есть практически в любом списке задач.
const CORE_FIELDS = [
  "Id",
  "Title",
  "Body",
  "AssignedTo/Id",
  "AssignedTo/Title",
  "Status",
  "Created",
  "Modified",
  "PercentComplete",
  "Editor/Id",
  "Editor/Title",
  "ContentTypeId",
];
const SELECT_BASE_NO_DUE = CORE_FIELDS.join(",");
const SELECT_BASE = [...CORE_FIELDS, "DueDate"].join(",");
// Поля, которые добавляются только для основного сайта (профиль "main").
// ⚠️ Признак «задача ДОБ» здесь НЕ читается: колонка в списке задач имеет одно
// значение по умолчанию на весь список (и «расползается» по всем типам контента).
// Настройка живёт в TaskBehaviour — см. services/taskBehaviour.js (isDobTaskByName).
const MAIN_ONLY_FIELDS = ["Location1", "ResultSearchTHU"];

/**
 * @typedef {object} BuildTaskListQueryOpts
 * @property {string} [listApi=TASKS_LIST_API] — путь к списку (например, "/web/lists(guid'…')"). По умолчанию — основной список задач.
 * @property {string[]} [taskFieldNames=[]] — доступные поля в списке (OffDepKey, RelatedItems), [] = неизвестны
 * @property {"main"|"external"} [selectProfile="main"] — профиль select (см. выше)
 * @property {string[]} [omittedFields=[]] — поля, которых заведомо нет в списке (после 400-ретраев)
 * @property {boolean} [useDueDate=true] — выбирать ли поле DueDate
 * @property {boolean} [useAdditionalActions=true] — включать ли AdditionalActions поля
 * @property {string|null} [recipientField=null] — InternalName поля Recipient (Lookup)
 * @property {string[]} [resultFieldInternalNames=[]] — InternalName полей результата (динамически по ContentType)
 * @property {object|null} [distribution=null] — DcEmail-запись (для фильтра по группе)
 * @property {number|null} [currentUserId=null] — Id текущего пользователя (fallback для фильтра)
 * @property {number[]} [assignedIds=null] — массив Id для AssignedToId OR-фильтра. Если передан — игнорирует distribution/currentUserId-логику.
 * @property {number} [top=100] — page size
 * @property {string} [orderBy="Created asc"]
 * @property {boolean} [excludeCompleted=false] — добавить фильтр «PercentComplete ne 1»
 */

/**
 * Нормализует список «пропущенных» полей в Set в нижнем регистре.
 * @param {string[]} omitted
 * @returns {Set<string>}
 */
function toOmittedSet(omitted) {
  const set = new Set();
  for (const f of omitted || []) {
    if (!f) continue;
    set.add(String(f).trim().toLowerCase());
  }
  return set;
}

/**
 * Достаёт список запрошенных полей из $select в URL запроса.
 * Нужно для авто-восстановления после 400 «поле не существует»:
 * по имени из ошибки находим поле в select и исключаем его.
 * @param {string} url
 * @returns {string[]}
 */
export function readSelectFields(url) {
  const m = String(url || "").match(/[?&]\$select=([^&]*)/);
  if (!m) return [];
  try {
    return decodeURIComponent(m[1]).split(",").map((s) => s.trim()).filter(Boolean);
  } catch (_e) {
    void _e;
    return m[1].split(",").map((s) => s.trim()).filter(Boolean);
  }
}

/**
 * Достаёт базовое имя поля из select-записи ("AssignedTo/Id" → "assignedto").
 * @param {string} field
 * @returns {string}
 */
export function baseFieldName(field) {
  const trimmed = String(field || "").trim();
  if (!trimmed) return "";
  return trimmed.split("/")[0].toLowerCase();
}

/**
 * Строит абсолютный URL (относительно API base) для получения списка задач.
 * Возвращает строку типа "/web/lists(guid'…')/items?$select=…&$expand=…&$filter=…&$orderby=Created asc&$top=100".
 *
 * Логика фильтра AssignedToId:
 *   - если передан assignedIds → OR-фильтр по этим Id (multi-source: пользователь + группы из DcEmail)
 *   - иначе распределение: группы DcEmail + текущий пользователь
 *   - иначе AssignedToId eq currentUserId
 *
 * @param {BuildTaskListQueryOpts} [opts]
 * @returns {string}
 */
export function buildTaskListQuery(opts = {}) {
  let {
    listApi = TASKS_LIST_API, // legacy: если не передан — основной список
    taskFieldNames = [],
    selectProfile = "main",
    omittedFields = [],
    useDueDate = true,
    useAdditionalActions = true,
    recipientField = null,
    useRecipient = null,
    distribution = null,
    currentUserId = null,
    assignedIds = null, // массив Id для OR-фильтра
    top = 100,
    orderBy = "Created asc",
    excludeCompleted = false,
  } = opts;

  const isExternal = selectProfile === "external";
  const omitted = toOmittedSet(omittedFields);
  const omit = (field) => omitted.has(baseFieldName(field));

  // Защита: удалённое поле EndJob фильтруем из всех входных массивов
  if (Array.isArray(taskFieldNames) && taskFieldNames.some((f) => String(f).toLowerCase() === "endjob")) {
    taskFieldNames = taskFieldNames.filter((f) => String(f).toLowerCase() !== "endjob");
  }

  // taskFieldNames непустой → поля списка известны, лишнее выкидываем.
  // Пустой массив → поля неизвестны, доверяемся профилю + авто-ретраям.
  const fieldsKnown = Array.isArray(taskFieldNames) && taskFieldNames.length > 0;
  const knownSet = new Set(
    (taskFieldNames || [])
      .filter(Boolean)
      .map((f) => String(f).trim().toLowerCase())
  );
  const has = (field) => knownSet.has(baseFieldName(field)) || knownSet.has(String(field).toLowerCase());
  /** Поле допустимо для этого списка: известно И присутствует, либо список полей ещё не подгружен. */
  const allowed = (field) => !omit(field) && (!fieldsKnown || has(field));

  // ---- базовый select ----
  const baseFields = [];
  for (const f of CORE_FIELDS) {
    if (omit(f)) continue;
    // Если поля списка известны — не запрашиваем отсутствующие (иначе 400).
    // Если неизвестны — берём ядро целиком, лишнее уберёт авто-ретрай.
    if (fieldsKnown && !has(f)) continue;
    baseFields.push(f);
  }
  if (useDueDate && allowed("DueDate") && !baseFields.includes("DueDate")) baseFields.push("DueDate");
  if (!useDueDate) {
    const idx = baseFields.indexOf("DueDate");
    if (idx >= 0) baseFields.splice(idx, 1);
  }
  if (selectProfile === "main") {
    // Историческое поведение основного сайта: Location1/ResultSearchTHU берём
    // даже когда список полей не загрузился (ретраи в fetchTasksForSource).
    for (const f of MAIN_ONLY_FIELDS) {
      if (!omit(f) && (!fieldsKnown || has(f)) && !baseFields.includes(f)) baseFields.push(f);
    }
  }

  // ---- extra select fields (OffDepKey, RelatedItems, AdditionalActions, Result fields) ----
  const extraFields = [];
  const pushExtra = (field) => {
    if (!field) return;
    const trimmed = String(field).trim();
    if (!trimmed || trimmed.toLowerCase() === "endjob") return;
    if (omit(trimmed)) return;
    if (extraFields.some((f) => f.toLowerCase() === trimmed.toLowerCase())) return;
    extraFields.push(trimmed);
  };

  // Динамические поля результата — только для того профиля, который их запросил.
  // В табличном режиме resultFieldInternalNames === [] — результат-поля не нужны.
  if (Array.isArray(opts.resultFieldInternalNames)) {
    for (const fn of opts.resultFieldInternalNames) {
      if (!fn || typeof fn !== "string" || !fn.trim()) continue;
      const f = fn.trim();
      if (f.toLowerCase() === "endjob") continue;
      // Внешним источникам результат-поля не навязываем: берём только если они
      // реально есть в списке (ResultSearchTHU на dob отсутствует → 400).
      if (isExternal && !has(f)) continue;
      pushExtra(f);
    }
  }
  if (!isExternal && (taskFieldNames.length === 0 || has("OffDepKey"))) pushExtra("OffDepKey");
  // Recipient в Tasks отсутствует — не используем дефолт "Recipient" на первом рендере.
  const shouldUseRecipient = useRecipient !== null ? useRecipient : !!recipientField;
  const effectiveRecipientFieldRaw = shouldUseRecipient ? (recipientField || null) : null;
  const effectiveRecipientField = effectiveRecipientFieldRaw && effectiveRecipientFieldRaw.toLowerCase() === "endjob" ? null : effectiveRecipientFieldRaw;
  if (effectiveRecipientField && shouldUseRecipient && allowed(effectiveRecipientField)) {
    pushExtra(`${effectiveRecipientField}/Id`);
    pushExtra(`${effectiveRecipientField}/Title`);
  }
  // RelatedItems — критично для enrich (там лежит ListId/ItemId → оттуда тянем Recipient/THU)
  if (allowed("RelatedItems")) pushExtra("RelatedItems");
  // AdditionalActions поля — только основной сайт (на dob их обычно нет).
  const hasAdditionalFields = !isExternal && (
    taskFieldNames.length === 0 ||
    taskFieldNames.includes("AdditionalActions") ||
    taskFieldNames.includes("AdditionalsActionsRequired") ||
    taskFieldNames.includes("AdditionalActionsRequired")
  );
  if (useAdditionalActions && hasAdditionalFields) {
    const hasNew = taskFieldNames.includes("AdditionalsActionsRequired");
    const hasOld = taskFieldNames.includes("AdditionalActionsRequired");
    if (taskFieldNames.length === 0 || hasNew) pushExtra("AdditionalsActionsRequired");
    else if (hasOld) pushExtra("AdditionalActionsRequired");
    if (taskFieldNames.length === 0 || taskFieldNames.includes("AdditionalActions")) pushExtra("AdditionalActions");
  }
  const finalExtra = extraFields;
  const selectFields = finalExtra.length
    ? `${baseFields.join(",")},${finalExtra.join(",")}`
    : baseFields.join(",");

  // Expand
  const expands = ["AssignedTo", "Editor"];
  const effectiveExpandRecipient = shouldUseRecipient ? (recipientField || null) : null;
  if (effectiveExpandRecipient && shouldUseRecipient && allowed(effectiveExpandRecipient)) expands.push(effectiveExpandRecipient);

  // Filter по AssignedToId:
  //   - assignedIds (массив) → OR-фильтр по этим Id (multi-source: пользователь + группы из DcEmail)
  //   - иначе legacy: distribution → группа + currentUserId, fallback на currentUserId
  let assignedFilter;
  if (Array.isArray(assignedIds) && assignedIds.length > 0) {
    // ВАЖНО: Number(null) === 0 → без фильтра «> 0» в фильтр попадал AssignedToId eq 0
    const ids = [...new Set(assignedIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    if (ids.length === 0) {
      // нет ни одного валидного Id — пустой фильтр (на источнике ничего не вернётся)
      assignedFilter = "AssignedToId eq -1";
    } else if (ids.length === 1) {
      assignedFilter = `AssignedToId eq ${ids[0]}`;
    } else {
      assignedFilter = `(${ids.map((id) => `AssignedToId eq ${id}`).join(" or ")})`;
    }
  } else if (distribution) {
    const groupIds = getGroupIdsFromDistribution(distribution);
    if (groupIds.length > 0) {
      // Включаем и группу и персональный Id, чтобы фолбэк работал даже когда группа существует но задач в ней нет
      const allIds = [...new Set([...groupIds.map(Number), currentUserId].filter((v) => v != null && !Number.isNaN(v)).map(Number))];
      if (allIds.length === 0) {
        assignedFilter = `AssignedToId eq ${currentUserId}`;
      } else if (allIds.length === 1) {
        assignedFilter = `AssignedToId eq ${allIds[0]}`;
      } else {
        assignedFilter = `(${allIds.map((id) => `AssignedToId eq ${id}`).join(" or ")})`;
      }
    } else {
      assignedFilter = `AssignedToId eq ${currentUserId}`;
    }
  } else {
    assignedFilter = `AssignedToId eq ${currentUserId}`;
  }

  // Завершённые задачи в основной запрос не попадают: их считает и грузит
  // отдельный ленивый источник (tasks/completedTasks.js — RenderListDataAsStream).
  const finalFilter = excludeCompleted
    ? `${assignedFilter} and (PercentComplete eq null or PercentComplete ne 1)`
    : assignedFilter;

  return `${listApi}/items` +
    `?$select=${selectFields}` +
    `&$expand=${expands.join(",")}` +
    `&$filter=${encodeURIComponent(finalFilter)}` +
    `&$orderby=${orderBy}&$top=${top}`;
}

export { CORE_FIELDS, MAIN_ONLY_FIELDS, SELECT_BASE, SELECT_BASE_NO_DUE };
