// src/tasks/completedTasks.js
// Ленивая загрузка завершённых задач через RenderListDataAsStream (CAML + постранично).
//
// Зачем: завершённых задач со временем становится много, тащить их вместе с активными
// каждый раз дорого. Новый контракт:
//   • активные задачи — обычный REST-запрос (fetchTasks), завершённые в него не попадают;
//   • количество завершённых — считаем отдельно (RenderListDataAsStream, RowLimit 1 → RowCount);
//   • сами карточки завершённых — грузим только при открытии вкладки, порциями по PAGE_SIZE.
//
// Paging: ответ RenderListDataAsStream содержит NextHref ("?Paged=TRUE&p_ID=…"),
// его и передаём в следующий запрос как parameters.Paging.

import apiClient from "../api";
import { TASKS_LIST_API } from "./config";
import { getGroupIdsFromDistribution } from "./distribution";
import { toDomainTask } from "../domain/tasks/taskModel";
import { isCompletedStatus } from "./status";
import { DBG_ENABLED, dbg, dbgError, dbgWarn } from "../utils/dbg";
import { apiErrorStatus, describeApiError, extractFieldFromError, apiErrorPayload } from "../utils/apiError";


export const COMPLETED_PAGE_SIZE = 20;

// Сколько строк запрашиваем для подсчёта через CAML. RowCount в RenderListDataAsStream
// на части ферм равен размеру страницы, поэтому считаем сами по числу строк.
const COMPLETED_COUNT_ROWLIMIT = 2000;

// Диагностика: ?dbg=1 (или localStorage dbg / dbg_tasks = 1). См. src/utils/dbg.js.
const __DBG_ENABLED__ = DBG_ENABLED;
const __dlog = (...a) => dbg("completedTasks", ...a);

// Поля, которые нужны карточке завершённой задачи.
// Несуществующие поля автоматически вычищаются при ошибке (см. retryWithoutBadField).
const VIEW_FIELDS = [
  "ID",
  "Title",
  "Body",
  "Status",
  "PercentComplete",
  "DueDate",
  "Created",
  "Modified",
  "AssignedTo",
  "Editor",
  "RelatedItems",
  "ContentTypeId",
  "Location1",
  "ResultSearchTHU",
  "AdditionalsActionsRequired",
  "AdditionalActions",
];

function escXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** CAML-фильтр «мои/нашей группы». */
function buildAssignedCaml(currentUserId, distribution) {
  const ids = new Set();
  if (currentUserId != null && !Number.isNaN(Number(currentUserId))) ids.add(Number(currentUserId));
  if (distribution) {
    for (const id of getGroupIdsFromDistribution(distribution) || []) {
      const n = Number(id);
      if (!Number.isNaN(n)) ids.add(n);
    }
  }
  const list = [...ids];
  if (list.length === 0) return null;
  const parts = list.map((id) => `<Eq><FieldRef Name="AssignedTo" LookupId="TRUE" /><Value Type="Integer">${id}</Value></Eq>`);
  return wrapOr(parts);
}

function wrapOr(parts) {
  if (parts.length === 1) return parts[0];
  let node = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    node = `<Or>${parts[i]}${node}</Or>`;
  }
  return node;
}

/**
 * CAML-фильтр «задача завершена»: ровно одно условие — Status = «Завершена».
 *
 * Без PercentComplete, без <Contains> и <Not>: на части списков такие конструкции
 * вызывают 500 «Один или несколько типов полей установлены неправильно».
 * Точное сравнение заодно отсекает «В процессе выполнения» / «Выполняется».
 */
function buildCompletedCaml(extraStatuses = []) {
  const statuses = resolveCompletedStatuses(extraStatuses);
  const eqParts = statuses.map(
    (sv) => `<Eq><FieldRef Name="Status" /><Value Type="Text">${escXml(sv)}</Value></Eq>`
  );
  if (eqParts.length === 1) return eqParts[0];
  let or = eqParts[eqParts.length - 1];
  for (let i = eqParts.length - 2; i >= 0; i -= 1) or = `<Or>${eqParts[i]}${or}</Or>`;
  return or;
}

export function buildCompletedViewXml({
  currentUserId,
  distribution,
  pageSize,
  fields = VIEW_FIELDS,
  extraStatuses = [],
}) {
  const assigned = buildAssignedCaml(currentUserId, distribution);
  const completed = buildCompletedCaml(extraStatuses);
  const where = assigned
    ? `<Where><And>${assigned}${completed}</And></Where>`
    : `<Where>${completed}</Where>`;
  const viewFields = fields.map((f) => `<FieldRef Name="${escXml(f)}" />`).join("");
  return `<View Scope="RecursiveAll"><ViewFields>${viewFields}</ViewFields><Query>${where}<OrderBy><FieldRef Name="Modified" Ascending="FALSE" /></OrderBy></Query><RowLimit Paged="TRUE">${pageSize}</RowLimit></View>`;
}

/** Вызов RenderListDataAsStream. Возвращает распакованный payload. */
async function renderListData({ viewXml, paging = null }) {
  const body = {
    parameters: {
      __metadata: { type: "SP.RenderListDataParameters" },
      ViewXml: viewXml,
      DatesInUtc: true,
      ...(paging ? { Paging: paging } : {}),
    },
  };
  const url = `${TASKS_LIST_API}/RenderListDataAsStream`;
  __dlog("request", { url, paging, viewXml });
  let response;
  try {
    response = await apiClient.post(url, body, {
      headers: {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
      },
    });
  } catch (e) {
    // Полная диагностика падения — пишем ВСЕГДА, без ?dbg=1.
    dbgError("completedTasks:failed", {
      url,
      paging,
      status: apiErrorStatus(e),
      message: describeApiError(e),
      badField: extractFieldFromError(e) || null,
      viewXml,
      payload: apiErrorPayload(e),
    });
    markCamlBroken(e);
    throw e;
  }
  // В разных версиях ответ приходит как d.RenderListDataAsStream / d / корень
  const payload = response?.data?.d?.RenderListDataAsStream || response?.data?.d || response?.data || {};
  __dlog("response", {
    keys: Object.keys(payload || {}).slice(0, 12),
    rowCount: payload?.RowCount,
    rows: Array.isArray(payload?.Row) ? payload.Row.length : null,
    nextHref: payload?.NextHref || null,
  });
  return payload;
}

/** Достаёт имя «плохого» поля из текста ошибки SharePoint. */
function extractBadField(message) {
  const m = String(message || "").match(/column\s+['"]?([^'"]+)['"]?/i) || String(message || "").match(/пол[ея]\s+['"]?([^'"]+)['"]?/i);
  return m ? m[1].trim() : "";
}

/**
 * Статус завершённой задачи — ровно один: Status = «Завершена».
 *
 * Переопределить без пересборки (массив, если статусов несколько):
 *   localStorage.setItem("completedTasks.statuses", JSON.stringify(["Завершена"]))
 * Если ключ задан — используются ТОЛЬКО эти значения.
 */
const DEFAULT_COMPLETED_STATUS = "Завершена";

function resolveCompletedStatuses(extra = []) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem("completedTasks.statuses");
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr) && arr.length) {
        const statuses = [...new Set([...arr, ...extra])].filter(Boolean);
        __dlog("statuses", { source: "localStorage", statuses });
        return statuses;
      }
    }
  } catch {}
  const statuses = [...new Set([DEFAULT_COMPLETED_STATUS, ...extra])].filter(Boolean);
  __dlog("statuses", { source: "default", statuses });
  return statuses;
}





/**
 * REST-фильтры «завершённые»: одно условие — Status eq «Завершена».
 * Второй вариант (assignedOnly) — без Status вообще: «только мои» + определение
 * завершённости на клиенте. Нужен крайним фолбэком, если сервер отвергает фильтр по Status.
 */
function buildCompletedRestFilters({ assignedFilter, extraStatuses = [], assignedOnlyVariant = false }) {
  const statuses = resolveCompletedStatuses(extraStatuses).map(
    (sv) => `Status eq '${String(sv).replace(/'/g, "''")}'`
  );
  const base = assignedFilter ? `(${assignedFilter}) and ` : "";
  const byStatus = statuses.length > 1 ? `(${statuses.join(" or ")})` : statuses.join(" or ");

  const filters = [{ filter: `${base}${byStatus}`, name: "status" }];
  if (assignedOnlyVariant && assignedFilter) {
    filters.push({ filter: `(${assignedFilter})`, name: "assignedOnly+clientFilter" });
  }
  return filters.filter((f) => f.filter);
}

/** REST-фолбэк счётчика: $top=1 + $inlinecount=allpages, несколько вариантов фильтра. */
async function fetchCompletedCountFallback({ currentUserId, distribution, extraStatuses = [] }) {
  const ids = new Set();
  if (currentUserId != null) ids.add(Number(currentUserId));
  for (const id of (distribution ? getGroupIdsFromDistribution(distribution) || [] : [])) ids.add(Number(id));
  const list = [...ids].filter((n) => !Number.isNaN(n));
  const assignedFilter = list.map((id) => `AssignedToId eq ${id}`).join(" or ");

  let lastError = null;
  for (const { filter, name } of buildCompletedRestFilters({ assignedFilter, extraStatuses })) {
    try {
      const url = `${TASKS_LIST_API}/items?$select=Id&$filter=${encodeURIComponent(filter)}&$top=1&$inlinecount=allpages`;
      __dlog("count:request", { url, filter, name });
      const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
      const count = data?.d?.__count != null ? Number(data.d.__count) : null;
      dbgWarn("completedTasks:count", `сработал фильтр «${name}»`, { count, filter });
      return { count, source: `REST $inlinecount (${name})` };
    } catch (e) {
      lastError = e;
      dbgError("completedTasks:count:filterFailed", {
        name,
        filter,
        status: apiErrorStatus(e),
        message: describeApiError(e),
      });
    }
  }
  if (lastError) {
    dbgError("completedTasks:count:failed", {
      status: apiErrorStatus(lastError),
      message: describeApiError(lastError),
      badField: extractFieldFromError(lastError) || null,
      payload: apiErrorPayload(lastError),
    });
  }
  return { count: null, source: "error" };
}

/**
 * Количество завершённых задач (всё время).
 *
 * 1) REST $inlinecount — дёшево, но на части списков по Choice-полю Status отдаёт 0;
 *    результат используем, только если он больше нуля.
 * 2) CAML: RowLimit = COMPLETED_COUNT_ROWLIMIT, ViewFields — только ID, считаем строки.
 *    RowCount тоже учитываем (на некоторых фермах он и есть общее число).
 *
 * @returns {Promise<{count:number|null, source:string}>}
 */
export async function fetchCompletedCount({ currentUserId, distribution, extraStatuses = [] }) {
  const rest = await fetchCompletedCountFallback({ currentUserId, distribution, extraStatuses });
  if (typeof rest.count === "number" && rest.count > 0) return rest;
  dbgWarn("completedTasks:count", "REST дал 0/null — считаем через CAML", {
    restCount: rest.count,
    restSource: rest.source,
  });

  if (isCamlBroken()) return { count: null, source: "error (caml disabled)" };

  try {
    const payload = await renderListData({
      viewXml: buildCompletedViewXml({
        currentUserId,
        distribution,
        pageSize: COMPLETED_COUNT_ROWLIMIT,
        fields: ["ID"],
        extraStatuses,
      }),
    });
    const rows = Array.isArray(payload?.Row) ? payload.Row.length : 0;
    const rowCount = typeof payload?.RowCount === "number" ? payload.RowCount : 0;
    const count = Math.max(rows, rowCount);
    dbgWarn("completedTasks:count:caml", { rows, rowCount, nextHref: payload?.NextHref || null, count });
    if (count > 0) return { count, source: "RenderListDataAsStream (rows)" };
  } catch (e) {
    // Диагностика уже записана внутри renderListData ([completedTasks:failed]).
    __dlog("count via RenderListDataAsStream failed", apiErrorStatus(e), describeApiError(e));
  }
  return { count: null, source: "error" };
}

function asText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return asText(value[0]);
  if (typeof value === "object") {
    if (value.Title !== undefined) return String(value.Title ?? "");
    if (value.Value !== undefined) return String(value.Value ?? "");
    if (typeof value.StringValue === "string") return value.StringValue;
    if (value.results && Array.isArray(value.results)) return asText(value.results[0]);
    return "";
  }
  return String(value);
}

/** Пользователь/lookup: объект {id,title}, массив или строка "1;#Иванов И.И.". */
function asPerson(value) {
  if (!value) return null;
  if (Array.isArray(value)) return asPerson(value[0]);
  if (typeof value === "object") {
    if (value.results && Array.isArray(value.results)) return asPerson(value.results[0]);
    const id = value.id ?? value.Id ?? value.ID ?? null;
    const title = value.title ?? value.Title ?? value.Name ?? "";
    return { Id: id != null ? Number(id) : null, Title: String(title || "") };
  }
  const str = String(value);
  const m = str.match(/^(\d+);#(.*)$/);
  if (m) return { Id: Number(m[1]), Title: m[2] };
  return { Id: null, Title: str };
}

function rowToRawTask(row) {
  const id = row.ID ?? row.Id ?? row.id;
  const raw = {
    Id: id != null ? Number(id) : null,
    ID: id != null ? Number(id) : null,
    Title: asText(row.Title),
    Body: asText(row.Body),
    BodyRaw: asText(row.Body),
    Status: asText(row.Status),
    PercentComplete: row.PercentComplete != null && row.PercentComplete !== "" ? Number(row.PercentComplete) : null,
    Created: asText(row.Created) || null,
    Modified: asText(row.Modified) || null,
    DueDate: asText(row.DueDate) || null,
    AssignedTo: asPerson(row.AssignedTo),
    AssignedToId: asPerson(row.AssignedTo)?.Id ?? null,
    Editor: asPerson(row.Editor),
    EditorTitle: asPerson(row.Editor)?.Title || "",
    RelatedItems: asText(row.RelatedItems) || null,
    ContentTypeId: asText(row.ContentTypeId) || null,
    Location1: asText(row.Location1),
    ResultSearchTHU: asText(row.ResultSearchTHU),
    AdditionalsActionsRequired: row.AdditionalsActionsRequired ?? row.AdditionalActionsRequired ?? null,
    AdditionalActions: row.AdditionalActions ?? null,
    OffDepKey: row.OffDepKey ?? null,
    __renderRow: row,
  };
  return raw;
}

// ── Самовосстановление набора полей ──────────────────────────────────────────
// SharePoint может падать 500 «Один или несколько типов полей установлены неправильно»
// из-за «битого» поля в ViewFields — при этом имя поля в тексте ошибки НЕ называется.
// Тогда перебираем поля делением пополам и находим рабочий набор (запоминаем его).

/** Минимальный набор — карточка без него невозможна, поля проверенные. */
const CORE_FIELDS = ["ID", "Title", "Status", "PercentComplete", "Modified", "AssignedTo", "ContentTypeId"];

const usableFieldsCache = new Map(); // listId -> string[]

function listIdFromApi() {
  const m = String(TASKS_LIST_API || "").match(/guid'([^']+)'/i);
  return m ? m[1].toLowerCase() : "default";
}

function readStoredFields(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

function storeFields(key, fields) {
  usableFieldsCache.set(key, fields);
  try {
    if (typeof window !== "undefined" && window.localStorage) window.localStorage.setItem(key, JSON.stringify(fields));
  } catch {}
}

/** Рабочий набор полей: из памяти → из localStorage → полный список. */
function getUsableFields() {
  const key = `completedTasks.usableFields.${listIdFromApi()}`;
  const fromMemory = usableFieldsCache.get(key);
  if (fromMemory) return fromMemory;
  const stored = readStoredFields(key);
  if (stored) {
    usableFieldsCache.set(key, stored);
    dbgWarn("completedTasks:fields", "использую сохранённый набор полей", stored);
    return stored;
  }
  return [...VIEW_FIELDS];
}

/** Ключ признака «CAML/RenderListDataAsStream на этом списке не работает». */
function camlBrokenKey() {
  return `completedTasks.camlBroken.${listIdFromApi()}`;
}

/** CAML уже падал на этом списке — больше не пытаемся (REST справляется сам). */
function isCamlBroken() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    if (window.localStorage.getItem("completedTasks.forceCaml") === "1") return false;
    return window.localStorage.getItem(camlBrokenKey()) === "1";
  } catch {
    return false;
  }
}

function markCamlBroken(e) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(camlBrokenKey(), "1");
  } catch {}
  dbgWarn("completedTasks:camlDisabled", "RenderListDataAsStream на этом списке не работает — дальше используем только REST", {
    status: apiErrorStatus(e),
    message: describeApiError(e),
    hint: 'вернуть CAML можно так: localStorage.setItem("completedTasks.forceCaml", "1")',
  });
}

/** Один пробный запрос: просто проверяем, что сервер отвечает без ошибки. */
async function probeFields(ctx, fields) {
  const viewXml = buildCompletedViewXml({ ...ctx, fields, pageSize: 1 });
  await renderListData({ viewXml });
  return true;
}

/**
 * Рекурсивный поиск рабочего набора: пробуем базу, потом добавляем кандидатов
 * половинками. Возвращает максимальный набор полей, который сервер принимает.
 */
async function resolveUsableFields(ctx, fields, depth = 0) {
  const base = CORE_FIELDS.filter((f) => fields.includes(f));
  const candidates = fields.filter((f) => !base.includes(f));
  if (candidates.length === 0) return fields;
  if (depth > 6) return base;

  try {
    await probeFields(ctx, base);
  } catch (e) {
    dbgError("completedTasks:fields:coreFailed", {
      base,
      status: apiErrorStatus(e),
      message: describeApiError(e),
    });
    return fields; // сами базовые поля не проходят — ничего не трогаем, отдаём как есть
  }

  const grow = async (current, rest, d) => {
    if (rest.length === 0) return current;
    try {
      await probeFields(ctx, [...current, ...rest]);
      return [...current, ...rest];
    } catch {
      if (rest.length === 1) {
        dbgWarn("completedTasks:badField", `поле "${rest[0]}" ломает запрос (ViewFields) — отключаю`);
        return current;
      }
      if (d > 6) return current;
      const mid = Math.ceil(rest.length / 2);
      const left = await grow(current, rest.slice(0, mid), d + 1);
      return await grow(left, rest.slice(mid), d + 1);
    }
  };

  return await grow(base, candidates, 0);
}

/**
 * Загружает одну страницу завершённых задач.
 *
 * Если сервер отвергает ViewFields (500 «типы полей установлены неправильно» и имя поля
 * не названо) — автоматически ищет рабочий набор полей делением пополам и запоминает его.
 *
 * @param {{ currentUserId:number|null, distribution:object|null, pageSize?:number, paging?:string|null, recipientField?:string|null, scNumberField?:string|null }} opts
 * @returns {Promise<{ tasks:Array, nextPaging:string|null, rowCount:number|null, source:string }>}
 */
/**
 * Загружает одну страницу завершённых задач.
 *
 * Основной путь — CAML/RenderListDataAsStream с одним условием Status = «Завершена»:
 * на части списков REST-фильтр по Choice-полю Status возвращает 0 строк, хотя CAML
 * те же задачи отдаёт. Если CAML недоступен (ранее падал) — работаем через REST.
 *
 * @param {{ currentUserId:number|null, distribution:object|null, pageSize?:number, paging?:string|null, recipientField?:string|null, scNumberField?:string|null, extraStatuses?:string[] }} opts
 * @returns {Promise<{ tasks:Array, nextPaging:string|null, rowCount:number|null, source:string }>}
 */
export async function fetchCompletedTasksPage(opts) {
  if (!isCamlBroken()) {
    try {
      const page = await fetchCompletedTasksPageCaml(opts);
      if (page?.tasks?.length || page?.nextPaging) return page;
      dbgWarn("completedTasks:page", "CAML вернул пустую страницу — пробую REST");
    } catch (e) {
      dbgWarn("completedTasks:page:camlFailed", "CAML не сработал — перехожу на REST", {
        status: apiErrorStatus(e),
        message: describeApiError(e),
      });
    }
  }
  if (isCamlBroken()) {
    dbgWarn("completedTasks:page", "CAML отключён (ранее падал на этом списке) — работаем на REST");
  }
  return fetchCompletedTasksPageRest(opts);
}

// ── REST-загрузка страницы завершённых ───────────────────────────────────────
// Пейджинг — через $skiptoken.

const REST_PAGE_FIELDS = [
  "Id", "Title", "Body", "Status", "PercentComplete", "DueDate", "Created", "Modified",
  "ContentTypeId", "RelatedItems", "Location1", "ResultSearchTHU", "IsDobTask",
  "AdditionalsActionsRequired", "AdditionalActions",
];

function restPagingToSkiptoken(paging) {
  if (!paging) return null;
  const m = String(paging).match(/p_ID[=:](\d+)/i);
  return m ? `Paged=TRUE&p_ID=${m[1]}` : String(paging).replace(/^\?/, "");
}

function skiptokenFromNext(nextUrl) {
  const m = String(nextUrl || "").match(/\$skiptoken=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchCompletedTasksPageRest({
  currentUserId,
  distribution,
  pageSize = COMPLETED_PAGE_SIZE,
  paging = null,
  recipientField = null,
  scNumberField = null,
  extraStatuses = [],
}) {
  const ids = new Set();
  if (currentUserId != null) ids.add(Number(currentUserId));
  for (const id of (distribution ? getGroupIdsFromDistribution(distribution) || [] : [])) ids.add(Number(id));
  const list = [...ids].filter((n) => !Number.isNaN(n));
  const assignedFilter = list.map((id) => `AssignedToId eq ${id}`).join(" or ");

  let fields = [...REST_PAGE_FIELDS];
  let select = `${fields.join(",")},AssignedTo/Title,Editor/Title`;
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const { filter, name } of buildCompletedRestFilters({
      assignedFilter,
      extraStatuses,
      assignedOnlyVariant: true,
    })) {
      try {
        const skiptoken = restPagingToSkiptoken(paging);
        let url =
          `${TASKS_LIST_API}/items?$select=${select}&$expand=AssignedTo,Editor` +
          `&$filter=${encodeURIComponent(filter)}&$orderby=Modified desc&$top=${pageSize}`;
        if (skiptoken) url += `&$skiptoken=${encodeURIComponent(skiptoken)}`;
        __dlog("page:rest:request", { url, name });
        const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
        const rows = Array.isArray(data?.d?.results) ? data.d.results : [];
        const tasks = rows
          .map((row) => rowToRawTask(row))
          .filter((r) => r.Id != null)
          // Страховка: при фильтре «только мои» завершённость определяем на клиенте.
          .filter((r) => isCompletedStatus(r.Status, r.PercentComplete))
          .map((r) => toDomainTask(r, { recipientField, scNumberField }));
        const nextPaging = skiptokenFromNext(data?.d?.__next);
        dbgWarn("completedTasks:page", `сработал фильтр «${name}»`, { tasks: tasks.length, nextPaging });
        return {
          tasks,
          nextPaging,
          rowCount: null,
          source: name === "assignedOnly+clientFilter" ? "REST (client-filter)" : "REST",
        };
      } catch (e) {
        lastError = e;
        const bad = extractFieldFromError(e);
        if (bad) {
          const before = fields.length;
          fields = fields.filter((f) => f.toLowerCase() !== bad.toLowerCase());
          if (fields.length !== before) {
            select = `${fields.join(",")},AssignedTo/Title,Editor/Title`;
            dbgWarn("completedTasks:badField", `поле "${bad}" отсутствует в списке — убираю из REST-запроса`);
            break; // повторяем перебор фильтров уже с новым набором полей
          }
        }
        dbgError("completedTasks:page:rest:failed", {
          name,
          filter,
          status: apiErrorStatus(e),
          message: describeApiError(e),
        });
      }
    }
  }
  throw lastError || new Error("fetchCompletedTasksPageRest failed");
}

async function fetchCompletedTasksPageCaml({
  currentUserId,
  distribution,
  pageSize = COMPLETED_PAGE_SIZE,
  paging = null,
  recipientField = null,
  scNumberField = null,
}) {
  let fields = getUsableFields();
  let attempt = 0;
  let lastError = null;
  let searched = false;
  const ctx = { currentUserId, distribution };

  while (attempt < 6) {
    const viewXml = buildCompletedViewXml({ currentUserId, distribution, pageSize, fields });
    try {
      const payload = await renderListData({ viewXml, paging });
      const rows = Array.isArray(payload?.Row) ? payload.Row : [];
      const nextHref = typeof payload?.NextHref === "string" ? payload.NextHref.replace(/^\?/, "") : null;
      const rowCount = typeof payload?.RowCount === "number" ? payload.RowCount : null;
      const dropped = rows
        .map((row) => rowToRawTask(row))
        .filter((r) => r.Id != null && !isCompletedStatus(r.Status, r.PercentComplete))
        .map((r) => ({ Id: r.Id, Status: r.Status, PercentComplete: r.PercentComplete }));
      if (dropped.length) dbgWarn("completedTasks:page:filtered", "строки «в работе» отсеяны", dropped);
      const tasks = rows
        .map((row) => rowToRawTask(row))
        .filter((r) => r.Id != null)
        // Страховка: если CAML всё же пропустил «в работе» (например, нестандартный статус),
        // отсекаем такие строки по тому же правилу isCompletedStatus().
        .filter((r) => isCompletedStatus(r.Status, r.PercentComplete))
        .map((r) => toDomainTask(r, { recipientField, scNumberField }));
      __dlog("page:result", {
        rows: rows.length,
        tasks: tasks.length,
        dropped: dropped.length,
        rowCount,
        nextHref,
        ids: tasks.map((t) => t.Id),
      });
      if (searched || fields.length !== VIEW_FIELDS.length) storeFields(`completedTasks.usableFields.${listIdFromApi()}`, fields);
      return { tasks, nextPaging: nextHref, rowCount, source: "RenderListDataAsStream" };
    } catch (e) {
      lastError = e;
      const msg = String(e?.response?.data?.error?.message?.value || e?.message || "");
      const bad = extractBadField(msg);
      if (bad) {
        const before = fields.length;
        fields = fields.filter((f) => f.toLowerCase() !== bad.toLowerCase());
        if (fields.length !== before) {
          dbgWarn("completedTasks:badField", `поле "${bad}" отсутствует в списке — убираю из ViewXml и повторяю`);
          searched = true;
          attempt += 1;
          continue;
        }
      }
      // Имя поля не названо (500 «типы полей установлены неправильно») — ищем рабочий набор.
      if (!searched) {
        searched = true;
        dbgWarn("completedTasks:fields", "запрос отклонён, ищу рабочий набор полей", {
          status: apiErrorStatus(e),
          message: describeApiError(e),
        });
        const usable = await resolveUsableFields(ctx, fields);
        if (usable.length !== fields.length || usable.length < VIEW_FIELDS.length) {
          fields = usable;
          attempt += 1;
          continue;
        }
      }
      break;
    }
  }
  // REST уже пробовали (он идёт первым) — здесь просто фиксируем итог.
  dbgError("completedTasks:page:failed", {
    caml: describeApiError(lastError),
    hint: "REST и CAML не сработали — завершённые задачи загрузить не удалось",
  });
  throw lastError || new Error("fetchCompletedTasksPage failed");
}
