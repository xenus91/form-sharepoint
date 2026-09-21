/* eslint-disable */
// src/tasks/mapping.js
// eslint-disable-next-line no-unused-vars
// DBG helper — включи ?dbg=1 или localStorage.setItem('dbg','1') чтобы видеть детальные логи
const __DBG_ENABLED__ = (()=>{ try{ if(typeof window==='undefined') return false; if(new URLSearchParams(location.search).get('dbg')==='1') return true; if(localStorage.getItem('dbg')==='1') return true; if(localStorage.getItem('dbg_tasks')==='1') return true; return false; }catch(_e){ void _e; return false; } })();
const __dlog = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.log(...a);}catch(_e){ void _e;} };
// eslint-disable-next-line no-unused-vars
const __dgroup = (...a)=>{ if(!__DBG_ENABLED__) return; try{ console.groupCollapsed(...a);}catch(_e){ void _e;} };
// eslint-disable-next-line no-unused-vars
// eslint-disable-next-line no-unused-vars
const __dgroupEnd = ()=>{ if(!__DBG_ENABLED__) return; try{ console.groupEnd();}catch(_e){ void _e;} };

// Маппинг сырого SP task в наш task-объект.
// Раньше жил внутри TasksView.jsx как mapRawTask — вынесен сюда для переиспользования
// в loadTasks, fetchFullTask, searchTaskByRelatedItem, hashSearch и т.д.
//
// extractEONumberFromTask и другие extractors живут в ./formatters.js,
// чтобы TaskCard мог их импортировать без циклических импортов.

/**
 * Удаляет HTML-теги и декодирует базовые сущности.
 * Используется только в mapRawTask для поля Body (карточка показывает plain text).
 */
function stripHtml(html) {
  if (!html) return "";
  const tmp = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "");
  let s = tmp.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  s = s.replace(/\s*\)+\s*\}+\s*$/, "").replace(/\s+,/g, ",");
  return s;
}

/**
 * @param {object} r сырой объект с SharePoint (data.d из verbose-ответа)
 * @param {{ recipientField?: string|null, scNumberField?: string|null }} [opts]
 * @returns {object} наш Task
 */
export function mapRawTask(r, opts = {}) {
  const { recipientField = null, scNumberField = null } = opts;
  let recipientVal = "";
  if (recipientField && r[recipientField]) {
    const rec = r[recipientField];
    if (rec && typeof rec === "object") {
      if (rec.Title) recipientVal = rec.Title;
      else if (rec.results && rec.results[0]?.Title) recipientVal = rec.results[0].Title;
    } else if (typeof rec === "string") recipientVal = rec;
  }
  // Fallback: try common names
  if (!recipientVal) {
    recipientVal = r.Recipient?.Title || r.RecipientTitle || r["Recipient"] || "";
    if (typeof recipientVal === "object" && recipientVal?.Title) recipientVal = recipientVal.Title;
  }
  // SCNumber direct from task fields
  let scNumberVal = "";
  if (scNumberField && r[scNumberField] != null) scNumberVal = String(r[scNumberField]).trim();
  if (!scNumberVal) scNumberVal = r.SCNumber || r.ScNumber || r.SC_x0020_Number || "";
  if (typeof scNumberVal === 'object' && scNumberVal?.Title) scNumberVal = scNumberVal.Title;

  // AdditionalActionsRequired — может быть Choice (Нет/Да) или Boolean (Yes/No). У пользователя поле булевое.
  let additionalRequiredRaw = r.AdditionalActionsRequired;
  // SharePoint может отдавать также AdditionalActionsRequired_x0020_ или другое имя — проверяем варианты
  if (additionalRequiredRaw == null) {
    additionalRequiredRaw = r.AdditionalActionsRequired_x0020_ ?? r.OData__AdditionalActionsRequired ?? "";
  }
  let additionalRequired = "";
  if (additionalRequiredRaw === true || additionalRequiredRaw === 1 || additionalRequiredRaw === "1") {
    additionalRequired = "Да";
  } else if (additionalRequiredRaw === false || additionalRequiredRaw === 0 || additionalRequiredRaw === "0") {
    additionalRequired = "Нет";
  } else if (typeof additionalRequiredRaw === "string") {
    const s = additionalRequiredRaw.trim().toLowerCase();
    if (s === "да" || s === "true" || s === "1") additionalRequired = "Да";
    else if (s === "нет" || s === "false" || s === "0") additionalRequired = "Нет";
    else if (s) additionalRequired = additionalRequiredRaw.trim();
    else additionalRequired = "";
  } else if (additionalRequiredRaw != null && additionalRequiredRaw !== "") {
    additionalRequired = String(additionalRequiredRaw).trim();
  } else {
    additionalRequired = "";
  }
  // AdditionalActions (Multi-Choice Fill-in) — SharePoint verbose возвращает {results: []}
  let additionalActions = [];
  const rawAA = r.AdditionalActions ?? null;
  if (rawAA) {
    if (Array.isArray(rawAA)) additionalActions = rawAA;
    else if (Array.isArray(rawAA.results)) additionalActions = rawAA.results;
    else if (typeof rawAA === "string" && rawAA) additionalActions = [rawAA];
  }
  additionalActions = additionalActions.map((v) => String(v).trim()).filter(Boolean);

  // ContentTypeId для динамического определения поля результата (по ContentType)
  let contentTypeIdVal = r.ContentTypeId || r.ContentType?.StringValue || r.ContentTypeId?.StringValue || null;
  if (typeof contentTypeIdVal === "object" && contentTypeIdVal?.StringValue) contentTypeIdVal = contentTypeIdVal.StringValue;
  // Динамическое поле результата: если есть поле с TypeDisplayName "Результирующий выбор", берём его,
  // иначе fallback на ResultSearchTHU. Для совместимости проверяем все возможные InternalName из raw
  let dynamicResultVal = r.ResultSearchTHU || "";
  // DBG for completion type: log if has ResultComplete fields but THU empty
  if(__DBG_ENABLED__){ try{ const rk = Object.keys(r).filter(k=>k.toLowerCase().includes("result")); if(rk.length && !dynamicResultVal){ __dlog("[DBG:mapping] has result keys but THU empty", {Id:r.Id, keys:rk.slice(0,6), hasComplete: !!r.ResultSearchComplete, hasResultComplete: !!r.ResultComplete}); } }catch(_e){ void _e; } }
  // Если в raw есть другое поле с тем же смыслом (например, Result, ResultNew), но мы его не знаем на этапе маппинга,
  // оно будет доступно как r[fieldInternalName] — TaskCard позже уточнит через getTaskResultValue.
  // Здесь сохраняем первое найденное, но оставляем raw для дальнейшего разрешения.
  if (!dynamicResultVal) {
    // Попытка найти любое поле, где ключ содержит "Result" и значение похоже на choice
    for (const k of Object.keys(r)) {
      if (k.toLowerCase().includes("result") && typeof r[k] === "string" && r[k].trim()) {
        // Не берём ResultSearchTHU уже проверенный, но берём первый другой
        if (k !== "ResultSearchTHU") {
          dynamicResultVal = r[k];
          break;
        }
      }
    }
  }

  return {
    Id: r.Id,
    Title: r.Title || "",
    Body: stripHtml(r.Body) || r.Body || "",
    BodyRaw: r.Body || "",
    AssignedTo: r.AssignedTo?.Title || "",
    AssignedToId: r.AssignedTo?.Id || r.AssignedToId || null,
    EditorTitle: r.Editor?.Title || "",
    Editor: r.Editor?.Title || "",
    EditorId: r.Editor?.Id || r.EditorId || null,
    Status: r.Status || "",
    ResultSearchTHU: dynamicResultVal || "",
    // Сохраняем также динамическое значение под универсальным ключом для новой логики
    ResultValue: dynamicResultVal || "",
    Location1: r.Location1 || "",
    AdditionalActionsRequired: additionalRequired,
    AdditionalActions: additionalActions,
    Created: r.Created || "",
    Modified: r.Modified || "",
    PercentComplete: r.PercentComplete,
    DueDate: r.DueDate || null,
    Recipient: recipientVal || "",
    SCNumber: scNumberVal || "",
    RelatedItems: r.RelatedItems || null,
    ContentTypeId: contentTypeIdVal || null,
    raw: r,
  };
}
