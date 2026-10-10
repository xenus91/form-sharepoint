// src/features/tasks/hooks/useActiveTasksCount.js
//
// Счётчик активных (не завершённых) задач — бейдж «Задачи» в бургер-меню.
//
// Почему отдельный хук, а не состояние внутри App: раньше в ОДНО и то же
// состояние писали двое —
//   1) опросчик App (фильтр «я + мои группы», основной список);
//   2) TasksView через onCountChange — он считал по ЗАГРУЖЕННОЙ выборке
//      (фильтры, поиск, источники), а при уходе из интерфейса задач просто
//      переставал писать.
// Из-за этого при переключении интерфейсов бейдж «слетал»: показывал чужое
// число или пропадал до следующего тика (60 с).
//
// Правила хука:
//   * счётчик считается ТОЛЬКО тут, по одному и тому же фильтру;
//   * последний запущенный запрос побеждает (иначе ответ «личного» фильтра,
//     пришедший позже, затирает свежий счёт с группами);
//   * одинаковый фильтр не шлёт второй запрос, пока первый в полёте;
//   * ошибка сети НЕ обнуляет счётчик — бейдж не должен «слетать» из-за неё;
//   * интерфейс задач не передаёт число, а просит пересчитать (refresh).

import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../../../api";
import { getGroupIdsFromDistribution } from "../../../tasks/distribution";
import { isCompletedStatus } from "../../../tasks/status";

const TASKS_LIST_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639";
const TASKS_LIST_API = `/web/lists(guid'${TASKS_LIST_GUID}')`;
const DEFAULT_INTERVAL_MS = 60_000;
// Задач у сотрудника обычно десятки, но берём с запасом: $top — не «точный
// предел счётчика», а страница, по которой считаем.
const PAGE_SIZE = 500;

const accept = { headers: { Accept: "application/json;odata=verbose" } };

/** Фильтр «мои задачи»: я + группы из рассылки (DcEmail). */
export function buildActiveTasksFilter(currentUserId, distribution = null) {
  const ids = new Set();
  const me = Number(currentUserId);
  if (Number.isFinite(me) && me > 0) ids.add(me);
  for (const raw of getGroupIdsFromDistribution(distribution)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  const list = [...ids];
  if (list.length === 0) return "";
  if (list.length === 1) return `AssignedToId eq ${list[0]}`;
  return `(${list.map((id) => `AssignedToId eq ${id}`).join(" or ")})`;
}

const countActive = (results = []) =>
  results.filter((r) => !isCompletedStatus(r?.Status, r?.PercentComplete)).length;

async function requestCount(currentUserId, distribution, get) {
  const filter = buildActiveTasksFilter(currentUserId, distribution);
  if (!filter) return 0;
  const page = `$select=Id,Status,PercentComplete&$top=${PAGE_SIZE}`;
  try {
    const { data } = await get(`${TASKS_LIST_API}/items?${page}&$filter=${filter}`, accept);
    return countActive(data?.d?.results || []);
  } catch {
    // Фолбэк: колонки AssignedToId может не быть (или она не фильтруется) —
    // считаем по раскрытому полю AssignedTo.
    const me = Number(currentUserId);
    if (!Number.isFinite(me) || me <= 0) throw new Error("useActiveTasksCount: no user");
    const { data } = await get(`${TASKS_LIST_API}/items?${page}&$filter=AssignedTo/Id eq ${me}`, accept);
    return countActive(data?.d?.results || []);
  }
}

/**
 * @param {object} opts
 * @param {number|string|null} opts.currentUserId
 * @param {object|null} [opts.distribution] — запись DcEmail (группы пользователя)
 * @param {boolean} [opts.enabled]
 * @param {number} [opts.intervalMs]
 * @param {Function} [opts.get] — http-клиент (для тестов)
 * @returns {{count: number, refresh: Function}}
 */
export default function useActiveTasksCount({
  currentUserId = null,
  distribution = null,
  enabled = true,
  intervalMs = DEFAULT_INTERVAL_MS,
  get = null,
} = {}) {
  const [count, setCount] = useState(0);
  // Номер запущенного запроса: применяем ответ только последнего.
  const seqRef = useRef(0);
  const inFlightRef = useRef(null);
  const getRef = useRef(get);
  getRef.current = get;

  const http = useCallback((url, cfg) => {
    const client = getRef.current;
    return client ? client(url, cfg) : apiClient.get(url, cfg);
  }, []);

  const refresh = useCallback(async () => {
    const me = Number(currentUserId);
    if (!enabled || !Number.isFinite(me) || me <= 0) return 0;
    const key = buildActiveTasksFilter(me, distribution);
    if (!key) return 0;
    // Тот же фильтр уже в полёте — второй запрос не нужен.
    if (inFlightRef.current && inFlightRef.current.key === key) return inFlightRef.current.promise;
    const seq = (seqRef.current += 1);
    const promise = (async () => {
      try {
        const next = await requestCount(me, distribution, http);
        // Поздний ответ устаревшего запроса не затирает свежий счётчик.
        if (seq === seqRef.current) setCount(next);
        return next;
      } catch {
        // Ошибка сети — оставляем прежнее значение: бейдж не должен слетать.
        return undefined;
      } finally {
        if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
      }
    })();
    inFlightRef.current = { key, promise };
    return promise;
  }, [currentUserId, distribution, enabled, http]);

  useEffect(() => {
    const me = Number(currentUserId);
    if (!enabled || !Number.isFinite(me) || me <= 0) return undefined;
    refresh();
    const id = setInterval(refresh, intervalMs);
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, enabled, currentUserId, intervalMs]);

  return { count, refresh };
}
