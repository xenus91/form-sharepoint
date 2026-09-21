// src/services/additionalActionsResolver.js
// Resolver для AdditionalActions поля — §18 плана.
// Отвечает: Task → ContentTypeId → TaskTypeConfiguration → fieldInternalName → field metadata → normalized config
// TaskTypeConfiguration §17 ОТКЛЮЧЁН до аудита (нет 404) — оставлен закомментированным, VERIFIED-ready после аудита:
// иначе fallback к общему полю AdditionalActions (случай A). До tenant аудита таблица UNKNOWN → single field.

import { ADDITIONAL_ACTIONS_FIELD } from "../tasks/config";
import { fetchTaskTypeConfigurationMap, resolveTaskTypeConfig } from "./taskTypeConfiguration";

/**
 * @typedef {object} AdditionalActionsConfig
 * @property {boolean} enabled - показывать ли контрол (false = required false и нет значений)
 * @property {boolean} required
 * @property {string} fieldInternalName - реальное SharePoint поле для сохранения
 * @property {string} fieldTitle
 * @property {string} fieldType
 * @property {boolean} allowFillIn
 * @property {Array<{value:string,label:string}>} choices
 * @property {string} contentTypeId
 * @property {string} source - "sharepoint-field" | "task-type-config" | "fallback"
 */

// Кэш нормализованных конфигов: Map<ContentTypeId, config>
const _normalizedCache = new Map();
let _taskTypeMapCache = null;
let _taskTypeMapAt = 0;
const TASK_TYPE_CACHE_TTL = 30 * 60_000;

async function getTaskTypeConfig(contentTypeId, apiClient) {
  // §17 ОТКЛЮЧЁН до аудита — всегда null, нет 404 TaskTypeConfiguration
  return null;
  //if (!apiClient || !contentTypeId) return null;
  //const now = Date.now();
  //if (_taskTypeMapCache && now - _taskTypeMapAt < TASK_TYPE_CACHE_TTL) {
  //  return resolveTaskTypeConfig(contentTypeId, _taskTypeMapCache);
  //}
  //try {
  //  const map = await fetchTaskTypeConfigurationMap(apiClient);
  //  if (map === null) {
  //    _taskTypeMapCache = new Map();
  //    _taskTypeMapAt = now;
  //    return null;
  //  }
  //  _taskTypeMapCache = map;
  //  _taskTypeMapAt = now;
  //  return resolveTaskTypeConfig(contentTypeId, map);
  //} catch {
  //  return null;
  //}
}

/**
 * Получить metadata поля по internalName (обёртка над fields API).
 * Использует кэш resultField.js-подобный, но для AdditionalActions.
 */
async function getFieldMetadata(apiClient, internalName) {
  try {
    const url = `/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')/fields/getbyinternalnameormtitle('${internalName}')?$select=InternalName,Title,TypeAsString,Choices,FillInChoice,AllowMultipleValues,Hidden,ReadOnlyField`;
    // Fallback: используем getbytitle
    const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
    const f = data?.d;
    if (!f || f.Hidden) return null;
    return {
      internalName: f.InternalName,
      title: f.Title,
      typeAsString: f.TypeAsString,
      choices: f.Choices?.results ? [...f.Choices.results] : Array.isArray(f.Choices) ? [...f.Choices] : [],
      allowFillIn: !!f.FillInChoice,
      allowMultiple: !!f.AllowMultipleValues || String(f.TypeAsString).toLowerCase().includes("multichoice"),
      hidden: !!f.Hidden,
    };
  } catch (e) {
    // fallback via getbytitle
    try {
      const fb = `/web/lists(guid'463B634E-A71A-4FEF-9A1F-B803431D8639')/fields/getbytitle('${internalName}')?$select=InternalName,Title,TypeAsString,Choices,FillInChoice,AllowMultipleValues`;
      const { data } = await apiClient.get(fb, { headers: { Accept: "application/json;odata=verbose" } });
      const f = data?.d;
      if (!f) return null;
      return {
        internalName: f.InternalName,
        title: f.Title,
        typeAsString: f.TypeAsString,
        choices: f.Choices?.results ? [...f.Choices.results] : Array.isArray(f.Choices) ? [...f.Choices] : [],
        allowFillIn: !!f.FillInChoice,
        allowMultiple: !!f.AllowMultipleValues,
        hidden: !!f.Hidden,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Резолвит AdditionalActions конфиг для задачи.
 * @param {object} task DomainTask (с contentTypeId)
 * @param {object} opts { apiClient, ctMap, additionalFieldMeta? } — если переданы, не делаем сеть
 * @returns {Promise<AdditionalActionsConfig>}
 */
export async function resolveAdditionalActionsConfig(task, opts = {}) {
  const { apiClient = null, ctMap = null, additionalFieldMeta = null } = opts;
  const ctId = String(task?.contentTypeId || task?.ContentTypeId || task?.raw?.ContentTypeId?.StringValue || "").trim();
  const cacheKey = ctId || "__default";
  if (_normalizedCache.has(cacheKey)) return _normalizedCache.get(cacheKey);

  // 1) Пробуем TaskTypeConfiguration (план §17: Title/ContentTypeId/AdditionalActionsFieldInternalName/AdditionalActionsRequired/Enabled)
  let fieldInternalName = ADDITIONAL_ACTIONS_FIELD;
  let source = "sharepoint-field";
  let typeCfg = null;
  if (apiClient && ctId) {
    typeCfg = await getTaskTypeConfig(ctId, apiClient);
    if (typeCfg) {
      if (typeCfg.enabled === false) {
        // Enabled=false → контрол отсутствует (план §18)
        const cfgDisabled = {
          enabled: false,
          required: false,
          fieldInternalName: typeCfg.additionalActionsFieldInternalName || fieldInternalName,
          fieldTitle: typeCfg.additionalActionsFieldInternalName || fieldInternalName,
          fieldType: "DisabledByConfig",
          allowFillIn: true,
          choices: [],
          contentTypeId: ctId,
          source: "task-type-config-disabled",
        };
        _normalizedCache.set(cacheKey, cfgDisabled);
        return cfgDisabled;
      }
      if (typeCfg.additionalActionsFieldInternalName) {
        fieldInternalName = typeCfg.additionalActionsFieldInternalName;
        source = "task-type-config";
      } else {
        source = "task-type-config";
      }
    }
  }

  // 2) Field metadata
  let fieldMeta = additionalFieldMeta;
  if (!fieldMeta && apiClient) {
    fieldMeta = await getFieldMetadata(apiClient, fieldInternalName);
  }
  // Fallback если поле не найдено — configuration error, не молча другое поле (требование §18)
  if (!fieldMeta) {
    const cfg = {
      enabled: false,
      required: false,
      fieldInternalName,
      fieldTitle: fieldInternalName,
      fieldType: "UNKNOWN",
      allowFillIn: true,
      choices: [],
      contentTypeId: ctId,
      source: "missing-field",
      error: `Field ${fieldInternalName} not found for CT ${ctId.slice(0,12)}`,
    };
    _normalizedCache.set(cacheKey, cfg);
    return cfg;
  }

  // 3) Required — приоритет: TaskTypeConfiguration.AdditionalActionsRequired (план §17), затем task.AdditionalActionsRequired / task.additionalActions.required
  // Если required=false — контрол отсутствует (план §18)
  let required = false;
  // Сначала из TaskTypeConfiguration (если задан)
  if (typeCfg && typeCfg.additionalActionsRequired !== null && typeCfg.additionalActionsRequired !== undefined) {
    required = !!typeCfg.additionalActionsRequired;
  } else if (task?.additionalActions?.required !== undefined) {
    required = String(task.additionalActions.required).toLowerCase() === "да" || task.additionalActions.required === true;
  } else if (task?.AdditionalActionsRequired !== undefined && task?.AdditionalActionsRequired !== null && String(task.AdditionalActionsRequired).trim() !== "") {
    required = String(task.AdditionalActionsRequired).toLowerCase() === "да" || String(task.AdditionalActionsRequired).toLowerCase() === "true" || String(task.AdditionalActionsRequired).toLowerCase() === "yes";
  }

  const cfg = {
    enabled: true,
    required,
    fieldInternalName: fieldMeta.internalName,
    fieldTitle: fieldMeta.title,
    fieldType: fieldMeta.typeAsString,
    allowFillIn: fieldMeta.allowFillIn,
    choices: (fieldMeta.choices || []).map((v) => ({ value: v, label: v })),
    contentTypeId: ctId,
    source,
    rawMeta: fieldMeta,
  };

  _normalizedCache.set(cacheKey, cfg);
  return cfg;
}

/**
 * Синхронный resolver для уже загруженных metadata (без сети) — O(1).
 */
export function resolveAdditionalActionsConfigSync(task, fieldMetaMap) {
  const ctId = String(task?.contentTypeId || task?.ContentTypeId || "").trim();
  const meta = fieldMetaMap?.get(ctId) || fieldMetaMap?.get("__default") || null;
  if (!meta) return null;
  return {
    enabled: true,
    required: String(task?.AdditionalActionsRequired).toLowerCase() === "да",
    fieldInternalName: meta.internalName,
    fieldTitle: meta.title,
    fieldType: meta.typeAsString,
    allowFillIn: meta.allowFillIn,
    choices: (meta.choices || []).map((v) => ({ value: v, label: v })),
    contentTypeId: ctId,
    source: "sync-cache",
  };
}

export function clearAdditionalActionsResolverCache() {
  _normalizedCache.clear();
  _taskTypeMapCache = null;
  _taskTypeMapAt = 0;
}
