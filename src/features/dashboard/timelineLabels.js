const HOUR_MS = 60 * 60 * 1000;
const DATE_LABEL_SPACER = "\u00a0";
const DAY_SEPARATOR_MARK = "│";

const pad = (value) => String(value).padStart(2, "0");

function roundedHourTimestamp(timestamp) {
  const time = Number(timestamp);
  if (!Number.isFinite(time)) return NaN;
  const hour = new Date(time);
  hour.setMinutes(0, 0, 0);
  const hourStart = hour.getTime();
  return time - hourStart <= HOUR_MS / 2 ? hourStart : hourStart + HOUR_MS;
}

function localDayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(timestamp) {
  const date = new Date(timestamp);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

function getLocalNoon(timestamp) {
  const date = new Date(timestamp);
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

function chooseClosestTick(entries, target) {
  return entries.reduce((closest, entry) => {
    if (!closest || Math.abs(entry.timestamp - target) < Math.abs(closest.timestamp - target)) {
      return entry;
    }
    return closest;
  }, null);
}

/**
 * Format a datetime-axis tick as an hour. Put the date below the tick nearest
 * noon when that part of the day is visible; for a zoomed partial day, fall
 * back to the first visible tick of that day so the date never disappears.
 * ApexCharts supplies its full tick scale and index in `opts`, which also lets
 * us keep only the tick nearest to each hour when a zoom creates sub-hour ticks.
 */
export function formatTimelineXLabel(value, timestamp, opts = {}) {
  const time = Number(timestamp ?? value);
  if (!Number.isFinite(time)) return "";

  const roundedTime = roundedHourTimestamp(time);
  if (!Number.isFinite(roundedTime)) return "";

  const date = new Date(roundedTime);
  const hourLabel = `${pad(date.getHours())}:00`;
  const globals = opts?.w?.globals || {};
  const ticks = Array.isArray(globals.xAxisScale?.result)
    ? globals.xAxisScale.result.map(Number)
    : [];
  const minX = Number(globals.minX);
  const maxX = Number(globals.maxX);
  const index = Number(opts?.i);
  const hasTickIndex = Number.isInteger(index) && index >= 0 && index < ticks.length;

  // After zoom, ApexCharts may distribute more ticks per hour than there are
  // whole-hour boundaries. Keep the tick closest to each hour; this avoids
  // duplicate labels without dropping all labels between fractional ticks.
  const nearestTickByHour = new Map();
  ticks.forEach((tick, tickIndex) => {
    const rounded = roundedHourTimestamp(tick);
    const current = nearestTickByHour.get(rounded);
    if (!current || Math.abs(tick - rounded) < Math.abs(current.timestamp - rounded)) {
      nearestTickByHour.set(rounded, { timestamp: tick, tickIndex, rounded });
    }
  });
  if (hasTickIndex && nearestTickByHour.get(roundedTime)?.tickIndex !== index) return "";
  if (
    hasTickIndex
    && index === ticks.length - 1
    && Number.isFinite(maxX)
    && Math.abs(time - maxX) < 1
    && localDayKey(roundedTime) !== localDayKey(maxX - 1)
  ) return hourLabel;

  const isExactMidnightTick = hasTickIndex
    && Math.abs(time - roundedTime) < 1
    && date.getHours() === 0
    && date.getMinutes() === 0
    && date.getSeconds() === 0
    && date.getMilliseconds() === 0;
  const hasVisibleDaySeparator = isExactMidnightTick
    && Number.isFinite(minX)
    && roundedTime > minX + 1;

  // During ApexCharts' layout measurement it calls the formatter without an
  // index. Return three lines, including a blank spacer, so the SVG reserves
  // both the small gap and the date row before the chart is drawn.
  if (!hasTickIndex) return [hourLabel, DATE_LABEL_SPACER, formatDay(roundedTime)];

  const dayKey = localDayKey(roundedTime);
  const dayTicks = ticks
    .map((tick, tickIndex) => ({
      timestamp: tick,
      tickIndex,
      rounded: roundedHourTimestamp(tick),
    }))
    .filter((entry) => (
      localDayKey(entry.rounded) === dayKey
      && nearestTickByHour.get(entry.rounded)?.tickIndex === entry.tickIndex
    ));

  if (!dayTicks.length) return hourLabel;

  const noon = getLocalNoon(roundedTime);
  const noonVisible = Number.isFinite(minX) && Number.isFinite(maxX)
    && noon >= minX && noon <= maxX;
  const edgeSafeTicks = dayTicks.filter(({ tickIndex }) => (
    !(tickIndex === 0 && globals.skipFirstTimelinelabel)
    && !(tickIndex === ticks.length - 1 && globals.skipLastTimelinelabel)
  ));
  if (!edgeSafeTicks.length) return hourLabel;

  const dateAnchor = chooseClosestTick(
    edgeSafeTicks,
    noonVisible ? noon : dayTicks[0].timestamp,
  );

  if (dateAnchor?.tickIndex === index) {
    const dateLabel = formatDay(roundedTime);
    return [
      hourLabel,
      DATE_LABEL_SPACER,
      hasVisibleDaySeparator ? `${DAY_SEPARATOR_MARK} ${dateLabel}` : dateLabel,
    ];
  }
  if (hasVisibleDaySeparator) return [hourLabel, DATE_LABEL_SPACER, DAY_SEPARATOR_MARK];
  return hourLabel;
}

export { HOUR_MS };
