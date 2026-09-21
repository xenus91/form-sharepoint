// src/tasks/config.js
// Константы SharePoint для задач. Раньше жили на module scope в TasksView.jsx.
// GUID взят из исходников — это список "Tasks" в SharePoint.

export const TASKS_LIST_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639";
export const TASKS_LIST_API = `/web/lists(guid'${TASKS_LIST_GUID}')`;

// RowLimit для CAML при hash-поиске. Раньше было 100 → цикл fetchFullTask по
// всем кандидатам мог делать до 101 запроса. Теперь берём топ-20 свежих
// + fetchFullTask только для лучшего кандидата.
export const HASH_CAML_ROW_LIMIT = 20;

// Доп. действия по найденной ЕО (AdditionalActionsRequired + AdditionalActions Multi-Choice)
export const ADDITIONAL_ACTIONS_REQUIRED_FIELD = "AdditionalActionsRequired";
export const ADDITIONAL_ACTIONS_FIELD = "AdditionalActions";
export const ADDITIONAL_ACTIONS_STANDARD = [
  "Отправить ЕО в OTM",
  "Переместить в корректную линию",
  "Перебрать",
];

// Дефолт из настроек поля SharePoint (чтобы не хардкодить). Кэшируется в sessionStorage.
let _cachedDefaultActions = null;
export async function fetchAdditionalActionsDefault(apiClient) {
  if (_cachedDefaultActions !== null) return _cachedDefaultActions;
  const cachedRaw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sp:AdditionalActions:Default") : null;
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw);
      if (Array.isArray(parsed)) {
        _cachedDefaultActions = parsed;
        return parsed;
      }
    } catch {}
  }
  try {
    const url = `${TASKS_LIST_API}/fields/getbytitle('${ADDITIONAL_ACTIONS_FIELD}')?$select=DefaultValue,DefaultFormula,TypeAsString`;
    const resp = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
    const data = resp?.data?.d || resp?.data || {};
    let def = data.DefaultValue ?? "";
    // MultiChoice с FillIn может хранить дефолт как "Отправить ЕО в OTM" или "a;#b" или ";#a;#b;#"
    const raw = String(def || "").trim();
    let values = [];
    if (raw) {
      if (raw.includes(";#")) {
        values = raw.split(";#").map((s) => s.trim()).filter(Boolean);
      } else if (raw.includes(";")) {
        values = raw.split(";").map((s) => s.trim()).filter(Boolean);
      } else {
        values = [raw];
      }
      // Фильтруем только из разрешённых + кастом (но дефолт обычно из стандартных)
      values = values.map((v) => String(v).trim()).filter(Boolean);
    }
    _cachedDefaultActions = values;
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("sp:AdditionalActions:Default", JSON.stringify(values));
    }
    return values;
  } catch (e) {
    console.warn("fetchAdditionalActionsDefault failed, fallback to []", e?.response?.status, e?.message);
    _cachedDefaultActions = [];
    return [];
  }
}
export function getCachedAdditionalActionsDefaultSync() {
  return _cachedDefaultActions;
}

// Select/expand для fetchFullTask (используется в TasksView и hashSearch).
export const FULL_TASK_SELECT = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,AdditionalActionsRequired,AdditionalActions,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,RelatedItems,WorkflowItemId,ContentTypeId";
export const FULL_TASK_EXPAND = "AssignedTo,Editor";

// Лёгкий select для polling/hash-refresh — только то, что реально
// сравнивается в диффе (Status/ResultSearchTHU/PercentComplete/Location1/Modified).
// Экономит трафик: 6 полей вместо 18+ каждые 60 секунд.
export const HASH_REFRESH_SELECT = "Id,Status,ResultSearchTHU,Location1,PercentComplete,Modified";