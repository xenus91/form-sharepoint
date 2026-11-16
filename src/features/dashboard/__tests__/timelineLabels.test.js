import { describe, expect, it } from "vitest";
import { formatTimelineXLabel, HOUR_MS } from "../timelineLabels";

function makeOptions(ticks, minX, maxX, index, edgeFlags = {}) {
  return {
    i: index,
    w: {
      globals: {
        minX,
        maxX,
        xTickAmount: ticks.length - 1,
        xAxisScale: { result: ticks },
        ...edgeFlags,
      },
    },
  };
}

function labelsFor(ticks, minX, maxX, edgeFlags = {}) {
  return ticks.map((timestamp, index) => formatTimelineXLabel(
    timestamp,
    timestamp,
    makeOptions(ticks, minX, maxX, index, edgeFlags),
  ));
}

function dateLabelsFrom(labels) {
  return labels.filter((label) => (
    Array.isArray(label) && /\d{2}\.\d{2}/.test(label.at(-1))
  ));
}

describe("formatTimelineXLabel", () => {
  it("keeps dates centered under each day on the full seven-day range", () => {
    const start = new Date(2026, 9, 23, 0, 0, 0, 0).getTime();
    const maxX = start + 7 * 24 * HOUR_MS;
    const ticks = Array.from({ length: 29 }, (_, index) => start + index * 6 * HOUR_MS);
    const labels = labelsFor(ticks, start, maxX, { skipLastTimelinelabel: true });
    const dateLabels = dateLabelsFrom(labels);
    const daySeparators = labels.filter((label) => Array.isArray(label) && label.at(-1) === "│");

    expect(dateLabels).toHaveLength(7);
    expect(dateLabels.map((label) => label.at(-1))).toEqual([
      "23.10", "24.10", "25.10", "26.10", "27.10", "28.10", "29.10",
    ]);
    expect(dateLabels.every(([hour]) => hour === "12:00")).toBe(true);
    expect(dateLabels.every((label) => label.length === 3 && label[1] === " ")).toBe(true);
    expect(daySeparators).toHaveLength(6);
    expect(daySeparators.every(([hour]) => hour === "00:00")).toBe(true);
  });

  it("shows the date on a visible tick when zoomed into a partial day without noon", () => {
    const start = new Date(2026, 9, 29, 17, 30, 0, 0).getTime();
    const ticks = Array.from({ length: 13 }, (_, index) => start + index * 30 * 60 * 1000);
    const labels = labelsFor(ticks, ticks[0], ticks.at(-1));
    const dateLabels = dateLabelsFrom(labels);

    expect(dateLabels).toHaveLength(1);
    expect(dateLabels[0].at(-1)).toBe("29.10");
    expect(labels.some((label) => label === "18:00")).toBe(true);
  });

  it("keeps date labels for each visible day after a zoom across midnight", () => {
    const start = new Date(2026, 9, 29, 19, 0, 0, 0).getTime();
    const ticks = Array.from({ length: 9 }, (_, index) => start + index * HOUR_MS);
    const labels = labelsFor(ticks, ticks[0], ticks.at(-1));

    expect(dateLabelsFrom(labels).map((label) => label.at(-1).match(/\d{2}\.\d{2}/)[0])).toEqual(["29.10", "30.10"]);
    expect(labels.find((label) => Array.isArray(label) && label[0] === "00:00")).toEqual(["00:00", " ", "│ 30.10"]);
  });

  it("shows only the nearest tick for each hour when the zoom creates sub-hour ticks", () => {
    const start = new Date(2026, 9, 29, 11, 0, 0, 0).getTime();
    const ticks = Array.from({ length: 13 }, (_, index) => start + index * 10 * 60 * 1000);
    const labels = labelsFor(ticks, ticks[0], ticks.at(-1));

    expect(labels.filter((label) => typeof label === "string" && label !== "")).toEqual([
      "11:00", "13:00",
    ]);
    expect(dateLabelsFrom(labels)).toEqual([["12:00", " ", "29.10"]]);
  });

  it("returns a three-line measurement label with a small gap before the date", () => {
    const timestamp = new Date(2026, 9, 29, 18, 15).getTime();
    expect(formatTimelineXLabel(timestamp, timestamp)).toEqual(["18:00", " ", "29.10"]);
  });

  it("formats a valid hour at the closest tick even when the scale ticks are fractional", () => {
    const start = new Date(2026, 9, 29, 9, 0, 0, 0).getTime();
    const ticks = [start + 12 * 60 * 1000, start + 31 * 60 * 1000, start + 52 * 60 * 1000];
    const labels = labelsFor(ticks, ticks[0], ticks.at(-1));
    expect(labels).toEqual([["09:00", " ", "29.10"], "", "10:00"]);
  });
});
