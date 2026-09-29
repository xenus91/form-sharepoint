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

/**
 * REST-фильтр «завершённые» — то же правило, что в isCompletedStatus().
 * Исключаем «В процессе выполнения» / «Выполняется» / «Не начата».
 */
export function buildCompletedRestFilter() {
  return (
    "(PercentComplete eq 1" +
    " or substringof('Заверш',Status)" +
    " or substringof('Выполнено',Status)" +
    " or substringof('Выполнена',Status))" +
    " and not substringof('В процессе',Status)" +
    " and not substringof('Выполня',Status)" +
    " and not substringof('Не начат',Status)"
  );
}

export const COMPLETED_PAGE_SIZE = 20;

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
 * CAML-фильтр «задача завершена» — зеркалит isCompletedStatus() из tasks/status.js.
 *
 * ⚠️ Нельзя искать просто Contains "Выполн": статус «В процессе выполнения» (и «Выполняется»)
 * тоже его содержит — такие задачи попадали в завершённые. Ищем «Выполнено/Выполнена»
 * и дополнительно исключаем явные «в работе» через <Not><Contains>.
 */
const COMPLETED_CAML = `
  <Or>
    <Eq><FieldRef Name="PercentComplete" /><Value Type="Number">1</Value></Eq>
    <Or>
      <Contains><FieldRef Name="Status" /><Value Type="Text">Заверш</Value></Contains>
      <Or>
        <Contains><FieldRef Name="Status" /><Value Type="Text">Выполнено</Value></Contains>
        <Contains><FieldRef Name="Status" /><Value Type="Text">Выполнена</Value></Contains>
      </Or>
    </Or>
  </Or>`;

/** CAML-исключение статусов «в работе» («В процессе выполнения», «Выполняется», «Не начата»). */
const NOT_ACTIVE_CAML = `
  <And>
    <Not><Contains><FieldRef Name="Status" /><Value Type="Text">В процессе</Value></Contains></Not>
    <And>
      <Not><Contains><FieldRef Name="Status" /><Value Type="Text">Выполня</Value></Contains></Not>
      <Not><Contains><FieldRef Name="Status" /><Value Type="Text">Не начат</Value></Contains></Not>
    </And>
  </And>`;

export function buildCompletedViewXml({ currentUserId, distribution, pageSize, fields = VIEW_FIELDS }) {
  const assigned = buildAssignedCaml(currentUserId, distribution);
  const completed = `<And>${COMPLETED_CAML}${NOT_ACTIVE_CAML}</And>`;
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
 * Количество завершённых задач (всё время).
 * Сначала пробуем RowCount из RenderListDataAsStream, иначе — REST $inlinecount.
 *
 * @returns {Promise<{count:number|null, source:string}>}
 */
export async function fetchCompletedCount({ currentUserId, distribution }) {
  // Основной источник — REST $inlinecount: он корректно считает все строки по фильтру.
  const rest = await fetchCompletedCountFallback({ currentUserId, distribution });
  if (typeof rest.count === "number") return rest;
  // Фолбэк — RowCount из RenderListDataAsStream.
  try {
    const payload = await renderListData({
      viewXml: buildCompletedViewXml({ currentUserId, distribution, pageSize: 1 }),
    });
    const rowCount = payload?.RowCount;
    if (typeof rowCount === "number") return { count: rowCount, source: "RenderListDataAsStream" };
    __dlog("no RowCount in payload");
  } catch (e) {
    __dlog("count via RenderListDataAsStream failed", e?.response?.status, e?.message);
  }
  return { count: null, source: "error" };
}

/** REST-фолбэк: $top=1 + $inlinecount=allpages по тому же фильтру. */
async function fetchCompletedCountFallback({ currentUserId, distribution }) {
  try {
    const ids = new Set();
    if (currentUserId != null) ids.add(Number(currentUserId));
    for (const id of (distribution ? getGroupIdsFromDistribution(distribution) || [] : [])) ids.add(Number(id));
    const list = [...ids].filter((n) => !Number.isNaN(n));
    const assigned = list.map((id) => `AssignedToId eq ${id}`).join(" or ");
    const filter = assigned ? `(${assigned}) and ${buildCompletedRestFilter()}` : buildCompletedRestFilter();
    const url = `${TASKS_LIST_API}/items?$select=Id&$filter=${encodeURIComponent(filter)}&$top=1&$inlinecount=allpages`;
    __dlog("count:request", { url, filter });
    const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
    const count = data?.d?.__count != null ? Number(data.d.__count) : null;
    __dlog("count:result", { count, source: "REST $inlinecount" });
    return { count, source: "REST $inlinecount" };
  } catch (e) {
    dbgError("completedTasks:count:failed", {
      status: apiErrorStatus(e),
      message: describeApiError(e),
      badField: extractFieldFromError(e) || null,
      payload: apiErrorPayload(e),
    });
    return { count: null, source: "error" };
  }
}

// ── Маппинг строки RenderListDataAsStream → сырой REST-элемент ───────────────────────

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

/**
 * Загружает одну страницу завершённых задач.
 *
 * @param {{ currentUserId:number|null, distribution:object|null, pageSize?:number, paging?:string|null, recipientField?:string|null, scNumberField?:string|null }} opts
 * @returns {Promise<{ tasks:Array, nextPaging:string|null, rowCount:number|null, source:string }>}
 */
export async function fetchCompletedTasksPage({
  currentUserId,
  distribution,
  pageSize = COMPLETED_PAGE_SIZE,
  paging = null,
  recipientField = null,
  scNumberField = null,
}) {
  let fields = [...VIEW_FIELDS];
  let attempt = 0;
  let lastError = null;

  while (attempt < 5) {
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
          attempt += 1;
          continue;
        }
      }
      break;
    }
  }
  throw lastError || new Error("fetchCompletedTasksPage failed");
}
