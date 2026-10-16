// src/tasks/hashSearch.js
// Поиск задачи по elementId / THU для hash-режима (#tasks/24630 или #tasks/<THU>).
// Использует CAML GetItems с RowLimit=20 + один fetchFullTask для лучшего кандидата.
//
// Раньше жило в TasksView.jsx — вынесено сюда как часть Tier 3 (Q11).

import apiClient from "../api";
import { TASKS_LIST_API, HASH_CAML_ROW_LIMIT, FULL_TASK_SELECT, FULL_TASK_EXPAND } from "./config";
import { mapRawTask } from "./mapping";
import { extractEONumberFromTask } from "./formatters";
import { HASH_LOG, HASH_WARN } from "./log";
import { findInIndex, buildTaskIndex } from "../utils/taskIndex";

const THU_RE = /^\d{17,18}$/;

/**
 * Загрузить полные данные одной задачи с expand AssignedTo/Editor.
 * Используется для hash-карточки и для докачки лучшего кандидата из CAML.
 * Кэшируется автоматически через axios interceptor в src/api.js (TTL 60с).
 *
 * @param {number|string} id
 * @returns {Promise<object|null>}
 */
export async function fetchFullTask(id) {
  try {
    const { data } = await apiClient.get(
      `${TASKS_LIST_API}/items(${id})?$select=${FULL_TASK_SELECT}&$expand=${FULL_TASK_EXPAND}`,
      { headers: { Accept: "application/json;odata=verbose" } }
    );
    const raw = data?.d;
    if (raw) return mapRawTask(raw);
  } catch (e) {
    const st = e?.response?.status;
    const msg = String(e?.response?.data?.error?.message?.value || e?.message || "").toLowerCase();
    // Fallback если новые поля AdditionalActions ещё не созданы в списке (старый деплой)
    if (msg.includes("additionalactions")) {
      try {
        const fallbackSelect = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,RelatedItems";
        const { data } = await apiClient.get(
          `${TASKS_LIST_API}/items(${id})?$select=${fallbackSelect}&$expand=${FULL_TASK_EXPAND}`,
          { headers: { Accept: "application/json;odata=verbose" } }
        );
        const raw = data?.d;
        if (raw) return mapRawTask(raw);
      } catch (e2) {
        // fallback тоже не удался — логируем исходную ошибку
      }
    }
    // 401/403 — нет прав на задачу другого пользователя (например, 396 vs 403
    // при глобальном CAML без AssignedTo фильтра). Не критично, fallback к
    // данным из CAML GetItems.
    if (st === 401 || st === 403) {
      HASH_WARN("fetchFullTask 401/403 no access for", id, "— fallback to CAML data");
    } else {
      HASH_WARN("fetchFullTask failed", id, e?.message);
    }
  }
  return null;
}

/**
 * Поиск задачи по elementId или THU. Главная функция hash-режима.
 *
 * @param {string|number} elementId — ID элемента ProblemsPallet (число) или THU (17-18 цифр)
 * @returns {Promise<object|null>}
 */
export async function searchTaskByRelatedItem(elementId) {
  const idStr = String(elementId).trim();
  if (THU_RE.test(idStr)) {
    return searchByThu(idStr);
  }
  const idNum = Number(idStr);
  if (Number.isNaN(idNum)) {
    HASH_WARN("searchTaskByRelatedItem invalid id", idStr);
    return null;
  }
  return searchByElementId(idStr);
}

async function searchByThu(thu) {
  HASH_LOG("searchTaskByRelatedItem CAML THU single", thu);
  try {
    const viewXml = `<View><Query><Where><Or><Contains><FieldRef Name='Title'/><Value Type='Text'>${thu}</Value></Contains><Contains><FieldRef Name='Body'/><Value Type='Note'>${thu}</Value></Contains></Or></Where><OrderBy><FieldRef Name='Created' Ascending='FALSE'/></OrderBy></Query><RowLimit>${HASH_CAML_ROW_LIMIT}</RowLimit></View>`;
    HASH_LOG("CAML THU GetItems", viewXml);
    const payload = { query: { __metadata: { type: "SP.CamlQuery" }, ViewXml: viewXml } };
    const { data } = await apiClient.post(`${TASKS_LIST_API}/GetItems`, payload, {
      headers: { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" },
    });
    const results = data?.d?.results || [];
    HASH_LOG("CAML THU results", results.length);
    if (results.length === 0) return null;
    const mapped = results.map(mapRawTask);
    const byThu = mapped.find((t) => extractEONumberFromTask(t) === thu);
    const best = byThu || mapped[0];
    if (!best) return null;
    const full = await fetchFullTask(best.Id);
    if (full) {
      HASH_LOG("CAML THU full", full.Id, full.AssignedTo, full.EditorTitle);
      return full;
    }
    HASH_WARN("CAML THU fallback to cand without expand (likely 401)", best.Id);
    return best;
  } catch (e) {
    HASH_WARN("CAML THU failed", e?.message);
    return null;
  }
}

async function searchByElementId(elementId) {
  HASH_LOG("searchTaskByRelatedItem CAML single", elementId);
  try {
    const viewXml = `<View><Query><Where><Contains><FieldRef Name='RelatedItems'/><Value Type='Note'>${elementId}</Value></Contains></Where><OrderBy><FieldRef Name='Created' Ascending='FALSE'/></OrderBy></Query><RowLimit>${HASH_CAML_ROW_LIMIT}</RowLimit></View>`;
    HASH_LOG("CAML GetItems", viewXml);
    const payload = { query: { __metadata: { type: "SP.CamlQuery" }, ViewXml: viewXml } };
    const { data } = await apiClient.post(`${TASKS_LIST_API}/GetItems`, payload, {
      headers: { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" },
    });
    const results = data?.d?.results || [];
    HASH_LOG("CAML results", results.length);
    if (results.length === 0) return null;
    const mapped = results.map(mapRawTask);
    // Используем Map-индекс для O(1) поиска точного совпадения RelatedItems.ItemId.
    const index = buildTaskIndex(mapped);
    const found = findInIndex(index, elementId);
    const best = found || mapped[0];
    if (!best) return null;
    const full = await fetchFullTask(best.Id);
    if (full) {
      HASH_LOG("CAML full", full.Id, full.AssignedTo, full.EditorTitle);
      return full;
    }
    // fetchFullTask не удалось (401/403) — fallback к данным CAML без expand.
    HASH_WARN("CAML fallback to cand without expand (likely 401) for", best.Id);
    return best;
  } catch (e) {
    HASH_WARN("CAML failed", e?.message);
    return null;
  }
}