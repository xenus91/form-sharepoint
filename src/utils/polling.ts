// src/utils/polling.js
// Адаптивный polling с паузой на скрытой вкладке и backoff при ошибках.
//
// Использование:
//   const stop = createAdaptivePolling({
//     fn: () => loadTasks({ silent: true }),
//     intervalMs: 60_000,
//     maxBackoffMs: 5 * 60_000,
//     pauseWhenHidden: true,
//   });
//   // ... позже:
//   stop();
//
// Возвращает функцию stop() для отписки.

const DEFAULT_OPTS = {
  intervalMs: 60_000,        // базовый интервал
  maxBackoffMs: 5 * 60_000,  // потолок бэкоффа
  backoffFactor: 2,          // множитель на каждой ошибке
  pauseWhenHidden: true,     // пауза при document.visibilityState === "hidden"
  runOnStart: false,         // запустить ли fn() сразу при старте
  onError: null,             // колбэк для логирования ошибок
};

/**
 * @param {object} opts
 * @param {() => Promise<any>} opts.fn
 * @param {number} [opts.intervalMs]
 * @param {number} [opts.maxBackoffMs]
 * @param {number} [opts.backoffFactor]
 * @param {boolean} [opts.pauseWhenHidden]
 * @param {boolean} [opts.runOnStart]
 * @param {(err: any) => void} [opts.onError]
 * @returns {() => void} stop
 */
export function createAdaptivePolling(opts) {
  const o = { ...DEFAULT_OPTS, ...opts };
  let timer = null;
  let currentDelay = o.intervalMs;
  let stopped = false;
  let inFlight = false;

  const schedule = (delay) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped) return;
    if (o.pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
      // Вкладка скрыта — перенесём на потом, отложенно
      schedule(o.intervalMs);
      return;
    }
    if (inFlight) {
      // Уже идёт запрос — пропускаем этот тик
      schedule(currentDelay);
      return;
    }
    inFlight = true;
    try {
      await o.fn();
      // Успех: сбрасываем backoff
      currentDelay = o.intervalMs;
    } catch (err) {
      // Ошибка: увеличиваем задержку (cap на maxBackoffMs)
      currentDelay = Math.min(currentDelay * o.backoffFactor, o.maxBackoffMs);
      if (o.onError) {
        try { o.onError(err); } catch {}
      }
    } finally {
      inFlight = false;
      schedule(currentDelay);
    }
  };

  const onVisible = () => {
    if (!o.pauseWhenHidden) return;
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") {
      // Возвращаемся к базовому интервалу и тикаем сразу
      currentDelay = o.intervalMs;
      if (timer) clearTimeout(timer);
      tick();
    }
  };

  if (typeof document !== "undefined" && o.pauseWhenHidden) {
    document.addEventListener("visibilitychange", onVisible);
  }

  if (o.runOnStart) {
    tick();
  } else {
    schedule(o.intervalMs);
  }

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (typeof document !== "undefined" && o.pauseWhenHidden) {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}