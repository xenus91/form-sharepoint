// src/features/dashboard/DashboardView.jsx
// Сводный дашборд: плитки статусов, лента карточек исполнителей (3 в ряд,
// скролл колесом и перетаскиванием) и почасовой таймлайн на ApexCharts.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import Chart from "react-apexcharts";
import { fetchDashboardData, summarizeTasks, ROLLING_DAYS } from "./dashboardData";

const CARD_SX = {
  borderRadius: "22px",
  p: 3,
  bgcolor: "#fff",
  boxShadow: "0 6px 28px rgba(23,28,143,0.09)",
  border: "1px solid rgba(23,28,143,0.07)",
};

const HEROES = [
  { key: "notStarted", title: "Не начато", overdueKey: "notStartedOverdue", Icon: PendingActionsRoundedIcon, grad: "linear-gradient(135deg,#8E97FF 0%,#5A67D8 100%)" },
  { key: "inProgress", title: "В работе", overdueKey: "inProgressOverdue", Icon: PlayCircleOutlineRoundedIcon, grad: "linear-gradient(135deg,#2FD3B0 0%,#0E9C86 100%)" },
  { key: "completedToday", title: "Завершено сегодня", overdueKey: null, Icon: TaskAltRoundedIcon, grad: "linear-gradient(135deg,#FFC46B 0%,#F57C00 100%)" },
];

const METRICS = [
  { key: "notStarted", label: "Не начато", color: "#5A67D8" },
  { key: "notStartedOverdue", label: "Просрочено", color: "#E53935" },
  { key: "inProgress", label: "В работе", color: "#0E9C86" },
  { key: "inProgressOverdue", label: "Просрочено", color: "#E53935" },
  { key: "completedToday", label: "За сегодня", color: "#F57C00" },
];

function Metric({ label, value, color }) {
  return (
    <Box sx={{ flex: "1 1 0", minWidth: 0, textAlign: "center", whiteSpace: "nowrap" }}>
      <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05, color: value > 0 ? color : "rgba(0,0,0,0.22)" }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: 12 }}>{label}</Typography>
    </Box>
  );
}

/** Сводка по названиям: «• Брак упаковки — 3», по убыванию количества. */
function TitleSummary({ row }) {
  const lines = (obj) => Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => <Box key={k}>• {k} — {n}</Box>);
  const hasO = Object.keys(row.openCounts || {}).length > 0;
  const hasD = Object.keys(row.doneCounts || {}).length > 0;
  if (!hasO && !hasD) return row.title;
  return (
    <Box sx={{ fontSize: 12, maxWidth: 380 }}>
      {hasO ? <><Box sx={{ fontWeight: 800, mb: 0.5 }}>Открытые:</Box>{lines(row.openCounts)}</> : null}
      {hasD ? <><Box sx={{ fontWeight: 800, mt: 1, mb: 0.5 }}>Завершённые:</Box>{lines(row.doneCounts)}</> : null}
    </Box>
  );
}

export default function DashboardView({ office, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, meta: null, tasks: [] });
  const [tick, setTick] = useState(0);
  const railRef = useRef(null);
  const dragRef = useRef({ active: false, x: 0, left: 0, moved: false });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const res = await fetchDashboardData(office);
        if (cancelled) return;
        setState({ loading: false, error: null, tasks: res.tasks, meta: res });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, error: String(e?.response?.data?.error?.message?.value || e?.message || e), tasks: [], meta: null });
      }
    })();
    return () => { cancelled = true; };
  }, [office, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const summary = useMemo(() => summarizeTasks(state.tasks), [state.tasks]);

  // Прокрутка ленты колесом мыши (вертикальное колесо → горизонтальный скролл).
  useEffect(() => {
    const el = railRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [state.loading, state.error, summary.rows.length]);

  // Прокрутка ленты нажатием и перетаскиванием.
  const onPointerDown = (e) => {
    const el = railRef.current;
    if (!el) return;
    dragRef.current = { active: true, x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    const el = railRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.left - dx;
  };
  const onPointerUp = (e) => {
    const el = railRef.current;
    el?.releasePointerCapture?.(e.pointerId);
    dragRef.current.active = false;
  };

  // ---- ApexCharts: почасовой роллинг-таймлайн ----
  const { chartOptions, chartSeries, categories } = useMemo(() => {
    const tl = summary.timeline;
    const cats = tl.map((p) => `${p.dayKey} ${p.label}`);
    const dayBounds = [];
    tl.forEach((p, i) => {
      if (p.hour === 0 && i > 0) dayBounds.push({ x: cats[i], borderColor: "#5A67D8", strokeDashArray: 4, label: { text: `${p.dayLabel} ${String(p.day).padStart(2, "0")}`, orientation: "horizontal", style: { color: "#5A67D8", fontSize: "11px", fontWeight: 700, background: "transparent" } } });
    });
    return {
      categories: cats,
      chartSeries: [{ name: "Завершено", data: tl.map((p) => p.count) }],
      chartOptions: {
        chart: {
          type: "bar",
          height: 380,
          fontFamily: "inherit",
          toolbar: { show: true, tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
          // Зум колесом мыши и выделением рамки — штатная возможность ApexCharts.
          zoom: { enabled: true, type: "x", autoScaleYaxis: true },
          animations: { enabled: false },
        },
        plotOptions: { bar: { borderRadius: 3, columnWidth: "72%" } },
        dataLabels: { enabled: false },
        fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.2, opacityFrom: 1, opacityTo: 0.6, stops: [0, 100] } },
        colors: ["#5A67D8"],
        grid: { borderColor: "rgba(23,28,143,0.08)", strokeDashArray: 0, yaxis: { lines: { show: true } }, xaxis: { lines: { show: false } } },
        xaxis: {
          categories: cats,
          tickAmount: 28,
          labels: {
            rotate: 0,
            hideOverlappingLabels: true,
            style: { fontSize: "11px", colors: "#7A8194" },
            // Двухуровневая подпись: час, а под ним дата тех часов, к которым он относится.
            formatter: (val) => {
              const s = String(val);
              const day = s.slice(0, 10);
              const hour = s.slice(11);
              if (hour === "12:00") return [hour, `${day.slice(8)}.${day.slice(5, 7)}`];
              return /^(00|06|18):00$/.test(hour) ? hour : "";
            },
          },
          axisBorder: { show: true, color: "rgba(23,28,143,0.12)" },
          axisTicks: { show: false },
        },
        yaxis: { allowDecimals: false, labels: { style: { fontSize: "11px", colors: "#7A8194" } } },
        annotations: { xaxis: dayBounds },
        tooltip: {
          y: { title: { formatter: () => "Завершено" } },
          x: { formatter: (val) => String(val).replace("_", " ").slice(0, 16) },
        },
      },
    };
  }, [summary.timeline]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F3F5FB", pb: 8 }}>
      <Box sx={{ maxWidth: "100%", px: { xs: 2, md: 4 }, pt: { xs: 8, md: 4 }, minWidth: 0, overflowX: "hidden" }}>
        <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: 30, md: 40 }, fontWeight: 900, color: "#171C8F", lineHeight: 1.1 }}>
              Дашборд задач
            </Typography>
            <Typography sx={{ color: "text.secondary", fontSize: 15, mt: 0.5 }}>
              {state.meta?.prefix
                ? <>DC Office <b>{office}</b> → префикс DcEmail <b>{state.meta.prefix}</b> · записей {state.meta.dcEmailCount} · исполнителей {state.meta.peopleCount}</>
                : "DC Office не определён — показаны все задачи"}
              {` · окно ${ROLLING_DAYS} суток, шаг 1 час`}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={refresh} variant="outlined" startIcon={<RefreshRoundedIcon />} sx={{ borderRadius: "14px", textTransform: "none", fontWeight: 700, px: 2.5 }}>
              Обновить
            </Button>
            {typeof onBack === "function" && (
              <Button onClick={onBack} sx={{ borderRadius: "14px", textTransform: "none", fontWeight: 700, px: 2.5 }}>Назад</Button>
            )}
          </Box>
        </Box>

        {state.loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
            <CircularProgress size={44} sx={{ color: "#5A67D8" }} />
          </Box>
        )}

        {!state.loading && state.error && (
          <Box sx={{ ...CARD_SX, border: "1px solid rgba(229,57,53,0.4)" }}>
            <Typography sx={{ fontWeight: 800, color: "#c62828", fontSize: 18 }}>Не удалось загрузить задачи</Typography>
            <Typography sx={{ color: "text.secondary" }}>{state.error}</Typography>
          </Box>
        )}

        {!state.loading && !state.error && (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 2.5, mb: 3.5, minWidth: 0 }}>
              {HEROES.map((h) => {
                const value = summary.totals[h.key] || 0;
                const overdue = h.overdueKey ? summary.totals[h.overdueKey] || 0 : 0;
                const Icon = h.Icon;
                return (
                  <Box key={h.key} sx={{ borderRadius: "26px", p: { xs: 2.5, md: 3.5 }, minWidth: 0, backgroundImage: h.grad, color: "#fff", boxShadow: "0 14px 36px rgba(23,28,143,0.22)", position: "relative", overflow: "hidden" }}>
                    <Icon sx={{ position: "absolute", right: -14, bottom: -18, fontSize: 132, opacity: 0.14 }} />
                    <Typography sx={{ fontSize: 15, fontWeight: 700, opacity: 0.92 }}>{h.title}</Typography>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, mt: 1, flexWrap: "wrap" }}>
                      <Typography sx={{ fontSize: { xs: 46, md: 64 }, fontWeight: 900, lineHeight: 1 }}>{value}</Typography>
                      {h.overdueKey && (
                        <Box sx={{ px: 1.5, py: 0.5, borderRadius: "999px", bgcolor: "rgba(255,255,255,0.24)", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>
                          просрочено {overdue}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 20, fontWeight: 900, color: "#171C8F" }}>
                По исполнителям · {summary.rows.length}
              </Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                колесо мыши или перетаскивание — прокрутка · всего задач: {state.meta?.totalTasks ?? state.tasks.length}
              </Typography>
            </Box>

            {summary.rows.length === 0 ? (
              <Box sx={{ ...CARD_SX, textAlign: "center", py: 6, mb: 3.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 0.5 }}>Нет задач по этому DC Office</Typography>
                <Typography sx={{ color: "text.secondary" }}>
                  {state.meta?.applied
                    ? `По префиксу «${state.meta.prefix}» найдено исполнителей: ${state.meta.peopleCount}. Ни одна задача не совпала.`
                    : "Не удалось получить список исполнителей из DcEmail."}
                </Typography>
              </Box>
            ) : (
              <Box
                ref={railRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                sx={{
                  display: "flex",
                  gap: 2.5,
                  mb: 3.5,
                  minWidth: 0,
                  width: "100%",
                  overflowX: "auto",
                  pb: 1.5,
                  cursor: "grab",
                  "&:active": { cursor: "grabbing" },
                  "&::-webkit-scrollbar": { height: 10 },
                  "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(90,103,216,0.35)", borderRadius: 5 },
                }}
              >
                {summary.rows.map((row) => {
                  const open = row.notStarted + row.inProgress;
                  const hot = row.notStartedOverdue + row.inProgressOverdue;
                  return (
                    <Tooltip key={row.key} title={<TitleSummary row={row} />} arrow>
                      <Box
                        sx={{
                          ...CARD_SX,
                          // ровно три карточки на всю ширину области
                          flex: "0 0 calc((100% - 2 * 20px) / 3)",
                          minWidth: 260,
                          borderLeft: `5px solid ${hot > 0 ? "#E53935" : "#5A67D8"}`,
                          userSelect: "none",
                        }}
                      >
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
                          <Typography sx={{ fontWeight: 900, fontSize: 17, color: "#1A1F36" }} noWrap>{row.title}</Typography>
                          <Box sx={{ px: 1.25, py: 0.4, borderRadius: "999px", bgcolor: "rgba(90,103,216,0.1)", color: "#5A67D8", fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" }}>
                            открыто {open}
                          </Box>
                        </Box>
                        <Box sx={{ display: "flex", flexWrap: "nowrap", gap: 0.5 }}>
                          {METRICS.map((m) => <Metric key={m.key} label={m.label} value={row[m.key]} color={m.color} />)}
                        </Box>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            )}

            <Box sx={CARD_SX}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 1, flexWrap: "wrap", gap: 1 }}>
                <Typography sx={{ fontWeight: 900, fontSize: 20, color: "#1A1F36" }}>
                  {`Завершено: ${ROLLING_DAYS} суток по часам`}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  всего за окно: {summary.timeline.reduce((s, p) => s + p.count, 0)} · зум: колесо или рамка, тулбар справа
                </Typography>
              </Box>
              <Chart options={chartOptions} series={chartSeries} type="bar" height={380} width="100%" />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
