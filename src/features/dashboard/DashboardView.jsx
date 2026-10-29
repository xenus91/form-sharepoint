// src/features/dashboard/DashboardView.jsx
// Сводный дашборд: плитки статусов, лента карточек исполнителей (3 в ряд,
// скролл колесом и перетаскиванием) и почасовой таймлайн на ApexCharts.

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Popover from "@mui/material/Popover";
import IconButton from "@mui/material/IconButton";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import Chart from "react-apexcharts";
import { keyframes } from "@mui/system";
import { fetchDashboardData, summarizeTasks, ROLLING_DAYS } from "./dashboardData";
import { formatTimelineXLabel } from "./timelineLabels";

const CARD_SX = {
  borderRadius: "22px",
  p: 3,
  bgcolor: "#fff",
  boxShadow: "0 6px 28px rgba(23,28,143,0.09)",
  border: "1px solid rgba(23,28,143,0.07)",
};

const dashboardRiseIn = keyframes`
  from { opacity: 0; translate: 0 12px; }
  to { opacity: 1; translate: 0 0; }
`;

const overdueBadgePopIn = keyframes`
  0% { opacity: 0; scale: 0.72; translate: 4px -2px; }
  72% { opacity: 1; scale: 1.08; translate: -1px 0; }
  100% { opacity: 1; scale: 1; translate: 0 0; }
`;

const REDUCED_MOTION_SX = {
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none !important",
    transition: "none !important",
    "&:hover": { transform: "none" },
  },
};

const HEROES = [
  { key: "notStarted", title: "Не начато", overdueKey: "notStartedOverdue", Icon: PendingActionsRoundedIcon, grad: "linear-gradient(135deg,#8E97FF 0%,#5A67D8 100%)" },
  { key: "inProgress", title: "В работе", overdueKey: "inProgressOverdue", Icon: PlayCircleOutlineRoundedIcon, grad: "linear-gradient(135deg,#FFC46B 0%,#F57C00 100%)" },
  { key: "completedToday", title: "Завершено сегодня", overdueKey: null, Icon: TaskAltRoundedIcon, grad: "linear-gradient(135deg,#2FD3B0 0%,#0E9C86 100%)" },
];

const METRICS = [
  {
    key: "notStarted",
    label: "Не начато",
    countsKey: "notStartedCounts",
    overdueKey: "notStartedOverdue",
    overdueCountsKey: "notStartedOverdueCounts",
    overdueBreakdownTitle: "Просрочено · не начато",
    color: "#5A67D8",
  },
  {
    key: "inProgress",
    label: "В работе",
    countsKey: "inProgressCounts",
    overdueKey: "inProgressOverdue",
    overdueCountsKey: "inProgressOverdueCounts",
    overdueBreakdownTitle: "Просрочено · в работе",
    color: "#F57C00",
  },
  { key: "completedToday", label: "Завершено", countsKey: "completedTodayCounts", color: "#0E9C86" },
];


function Metric({
  label,
  ariaLabel = label,
  value,
  color,
  onClick,
  overdueValue,
  overdueAriaLabel = "Просрочено",
  onOverdueClick,
}) {
  const handleKeyDown = (handler) => (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler?.(event);
    }
  };
  const digits = String(value).length;
  const valueFontSize = digits >= 4
    ? { xs: 18, sm: 24 }
    : digits === 3
      ? { xs: 20, sm: 26 }
      : { xs: 22, sm: 28 };

  return (
    <Box sx={{ flex: "1 1 64px", minWidth: 64, minHeight: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box sx={{ width: "100%", minHeight: 34, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <Box data-testid="metric-count-cluster" sx={{ position: "relative", display: "inline-flex", alignItems: "flex-start", justifyContent: "center" }}>
          <Box
            role="button"
            tabIndex={0}
            aria-label={`${ariaLabel}: ${value}; показать разбивку по названиям`}
            onClick={onClick}
            onKeyDown={handleKeyDown(onClick)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              px: 0.25,
              borderRadius: "10px",
              cursor: "pointer",
              transition: "background-color 180ms ease, transform 220ms cubic-bezier(.2,.8,.2,1)",
              "&:hover": { bgcolor: "rgba(90,103,216,0.08)", transform: "translateY(-1px) scale(1.035)" },
              "&:active": { transform: "translateY(0) scale(.97)" },
              "&:focus-visible": { outline: "2px solid #5A67D8", outlineOffset: 1 },
              ...REDUCED_MOTION_SX,
            }}
          >
            <Typography sx={{ fontSize: valueFontSize, fontWeight: 800, lineHeight: 1.05, color: value > 0 ? color : "rgba(0,0,0,0.22)" }}>
              {value}
            </Typography>
          </Box>
          {overdueValue != null && (
            <Box
              role="button"
              tabIndex={0}
              aria-label={`${overdueAriaLabel}: ${overdueValue}; показать разбивку по названиям`}
              onClick={onOverdueClick}
              onKeyDown={handleKeyDown(onOverdueClick)}
              sx={{
                position: "absolute",
                top: 0,
                left: "calc(100% + 4px)",
                zIndex: 1,
                boxSizing: "border-box",
                minWidth: 24,
                height: 18,
                px: 0.25,
                borderRadius: "999px",
                bgcolor: overdueValue > 0 ? "#FDE8E7" : "rgba(0,0,0,0.06)",
                color: overdueValue > 0 ? "#C62828" : "#8A8F9C",
                border: overdueValue > 0 ? "1px solid rgba(229,57,53,0.18)" : "1px solid transparent",
                fontSize: 10,
                fontWeight: 900,
                lineHeight: "16px",
                textAlign: "center",
                cursor: "pointer",
                animation: `${overdueBadgePopIn} 420ms cubic-bezier(.2,.8,.2,1) both`,
                transition: "background-color 180ms ease, transform 180ms cubic-bezier(.2,.8,.2,1)",
                "&:hover": { bgcolor: "#FAD7D5", transform: "translateY(-1px) scale(1.06)" },
                "&:active": { transform: "scale(.94)" },
                "&:focus-visible": { outline: "2px solid #E53935", outlineOffset: 1 },
                ...REDUCED_MOTION_SX,
              }}
            >
              {overdueValue}
            </Box>
          )}
        </Box>
      </Box>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: 12, whiteSpace: "nowrap" }}>{label}</Typography>
    </Box>
  );
}

Metric.propTypes = {
  label: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string,
  value: PropTypes.number.isRequired,
  color: PropTypes.string,
  onClick: PropTypes.func,
  overdueValue: PropTypes.number,
  overdueAriaLabel: PropTypes.string,
  onOverdueClick: PropTypes.func,
};

function TaskTitleBreakdown({ counts, emptyMessage = "Задач нет." }) {
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  if (!entries.length) {
    return <Typography sx={{ px: 0.5, py: 1, color: "text.secondary", fontSize: 13 }}>{emptyMessage}</Typography>;
  }
  return (
    <Box sx={{ display: "grid", gap: 0.75, maxHeight: 310, overflowY: "auto", pr: 0.5 }}>
      {entries.map(([title, count]) => (
        <Box key={title} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 1.25, py: 0.9, borderRadius: "12px", bgcolor: "#F6F7FC" }}>
          <Typography sx={{ minWidth: 0, fontSize: 13, fontWeight: 650, color: "#27304A", overflowWrap: "anywhere" }}>{title}</Typography>
          <Box sx={{ flex: "0 0 auto", minWidth: 30, px: 1, py: 0.25, borderRadius: "999px", bgcolor: "rgba(90,103,216,0.12)", color: "#4653C4", textAlign: "center", fontSize: 13, fontWeight: 900 }}>{count}</Box>
        </Box>
      ))}
    </Box>
  );
}

TaskTitleBreakdown.propTypes = {
  counts: PropTypes.object,
  emptyMessage: PropTypes.string,
};

/** Сводка по названиям: «• Брак упаковки — 3», по убыванию количества. */
function TitleSummary({ row }) {
  const lines = (obj) => Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .map(([title, count]) => <Box key={title}>• {title} — {count}</Box>);
  const hasOpen = Object.keys(row.openCounts || {}).length > 0;
  const hasDone = Object.keys(row.doneCounts || {}).length > 0;
  if (!hasOpen && !hasDone) return row.title;
  return (
    <Box sx={{ fontSize: 12, maxWidth: 380 }}>
      {hasOpen ? <><Box sx={{ fontWeight: 800, mb: 0.5 }}>Открытые:</Box>{lines(row.openCounts)}</> : null}
      {hasDone ? <><Box sx={{ fontWeight: 800, mt: 1, mb: 0.5 }}>Завершённые:</Box>{lines(row.doneCounts)}</> : null}
    </Box>
  );
}

TitleSummary.propTypes = {
  row: PropTypes.shape({
    title: PropTypes.string,
    openCounts: PropTypes.object,
    doneCounts: PropTypes.object,
  }).isRequired,
};

function TaskBreakdownPopover({ breakdown, onClose }) {
  const category = breakdown?.metric?.breakdownTitle || breakdown?.metric?.label || "Задачи";
  return (
    <Popover
      open={Boolean(breakdown)}
      anchorEl={breakdown?.anchorEl || null}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      PaperProps={{ sx: { borderRadius: "18px", boxShadow: "0 18px 54px rgba(23,28,143,0.2)", border: "1px solid rgba(23,28,143,0.08)" } }}
    >
      {breakdown && (
        <Box sx={{ width: { xs: "calc(100vw - 32px)", sm: 360 }, maxWidth: 380, maxHeight: "min(70vh, 480px)", overflowY: "auto", p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ color: "#69718A", fontSize: 10, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase" }}>
                Разбивка · {category}
              </Typography>
              <Typography sx={{ color: "#171C8F", fontSize: 17, fontWeight: 900, overflowWrap: "anywhere" }}>
                {breakdown.row.title}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small" aria-label="Закрыть разбивку"><CloseRoundedIcon fontSize="small" /></IconButton>
          </Box>
          <TaskTitleBreakdown
            counts={breakdown.row[breakdown.metric.countsKey]}
            emptyMessage={`Нет задач в категории «${category.toLowerCase()}».`}
          />
        </Box>
      )}
    </Popover>
  );
}

TaskBreakdownPopover.propTypes = {
  breakdown: PropTypes.shape({
    anchorEl: PropTypes.object,
    row: PropTypes.object.isRequired,
    metric: PropTypes.shape({
      label: PropTypes.string,
      breakdownTitle: PropTypes.string,
      countsKey: PropTypes.string.isRequired,
    }).isRequired,
  }),
  onClose: PropTypes.func.isRequired,
};

export default function DashboardView({ office, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, meta: null, tasks: [] });
  const [tick, setTick] = useState(0);
  const railRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const dragRef = useRef({ active: false, x: 0, left: 0, moved: false, captureTarget: null, captured: false });

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
    if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Do not capture on pointerdown: a normal click must keep its original
    // target so card/count click handlers can open their detail/popover.
    const target = e.target?.closest?.('[role="button"]') || el;
    dragRef.current = {
      active: true,
      x: e.clientX,
      left: el.scrollLeft,
      moved: false,
      captureTarget: target,
      captured: false,
    };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    const el = railRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) {
      d.moved = true;
      if (!d.captured) {
        try {
          d.captureTarget?.setPointerCapture?.(e.pointerId);
          d.captured = true;
        } catch {
          // Browsers without Pointer Capture still scroll while the pointer is over the rail.
        }
      }
      e.preventDefault();
      el.scrollLeft = d.left - dx;
    }
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    try {
      if (d.captured && d.captureTarget?.hasPointerCapture?.(e.pointerId)) {
        d.captureTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Pointer may already have been released by the browser.
    }
    d.active = false;
  };

  const openBreakdown = (event, row, metric) => {
    event.stopPropagation();
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      event.preventDefault?.();
      return;
    }
    setBreakdown({ anchorEl: event.currentTarget, row, metric });
  };

  // ---- ApexCharts: почасовой роллинг-таймлайн ----
  const { chartOptions, chartSeries } = useMemo(() => {
    const tl = summary.timeline;
    const firstTime = tl[0]?.timestamp;
    const endTime = (tl[tl.length - 1]?.timestamp ?? 0) + 3600000;

    return {
      chartSeries: [{ name: "Завершено", data: tl.map((p) => ({ x: p.timestamp, y: p.count })) }],
      chartOptions: {
        chart: {
          type: "bar",
          height: 380,
          fontFamily: "inherit",
          redrawOnWindowResize: true,
          redrawOnParentResize: true,
          toolbar: {
            show: true,
            autoSelected: "zoom",
            tools: {
              download: false,
              selection: false,
              zoom: true,
              zoomin: true,
              zoomout: true,
              pan: true,
              reset: true,
            },
          },
          // Реальная datetime-ось как в ApexCharts timeline demo: drag, колесо,
          // pinch и zoom-кнопки работают на непрерывном временном диапазоне.
          zoom: {
            enabled: true,
            type: "x",
            autoScaleYaxis: true,
            allowMouseWheelZoom: true,
            pinch: true,
            resetControl: "auto",
            zoomedArea: {
              fill: { color: "#5A67D8", opacity: 0.16 },
              stroke: { color: "#5A67D8", opacity: 0.55, width: 1 },
            },
          },
          pan: { inertia: true, friction: 0.9 },
          animations: { enabled: false },
        },
        plotOptions: { bar: { borderRadius: 3, columnWidth: "72%" } },
        dataLabels: { enabled: false },
        fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.2, opacityFrom: 1, opacityTo: 0.6, stops: [0, 100] } },
        colors: ["#5A67D8"],
        grid: { borderColor: "rgba(23,28,143,0.08)", strokeDashArray: 0, yaxis: { lines: { show: true } }, xaxis: { lines: { show: false } } },
        xaxis: {
          type: "datetime",
          min: firstTime,
          max: endTime,
          tickAmount: 28,
          labels: {
            rotate: 0,
            hideOverlappingLabels: true,
            datetimeUTC: false,
            // Reserve a second line for the date. Apex's default height estimate
            // measures one formatter tick, which can otherwise clip multiline labels.
            minHeight: 48,
            maxHeight: 60,
            style: { fontSize: "11px", colors: "#7A8194" },
            formatter: (value, timestamp, opts) => formatTimelineXLabel(value, timestamp, opts),
          },
          axisBorder: { show: true, color: "rgba(23,28,143,0.12)" },
          axisTicks: { show: false },
        },
        yaxis: { allowDecimals: false, labels: { style: { fontSize: "11px", colors: "#7A8194" } } },
        tooltip: {
          y: { title: { formatter: () => "Завершено" } },
          x: {
            formatter: (value) => {
              const time = Number(value);
              if (!Number.isFinite(time)) return String(value).replace("T", " ").slice(0, 16);
              const d = new Date(time);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
            },
          },
        },
        responsive: [
          {
            breakpoint: 700,
            options: {
              xaxis: {
                tickAmount: 7,
                labels: {
                  minHeight: 48,
                  maxHeight: 60,
                  style: { fontSize: "9px" },
                  formatter: (value, timestamp, opts) => formatTimelineXLabel(value, timestamp, opts),
                },
              },
            },
          },
        ],
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
              {HEROES.map((h, index) => {
                const value = summary.totals[h.key] || 0;
                const overdue = h.overdueKey ? summary.totals[h.overdueKey] || 0 : 0;
                const Icon = h.Icon;
                return (
                  <Box
                    key={h.key}
                    sx={{
                      borderRadius: "26px",
                      p: { xs: 2.5, md: 3.5 },
                      minWidth: 0,
                      backgroundImage: h.grad,
                      color: "#fff",
                      boxShadow: "0 14px 36px rgba(23,28,143,0.22)",
                      position: "relative",
                      overflow: "hidden",
                      animation: `${dashboardRiseIn} 560ms cubic-bezier(.2,.8,.2,1) both`,
                      animationDelay: `${index * 75}ms`,
                      transition: "transform 280ms cubic-bezier(.2,.8,.2,1), box-shadow 280ms cubic-bezier(.2,.8,.2,1)",
                      "&:hover": { transform: "translateY(-4px)", boxShadow: "0 20px 46px rgba(23,28,143,0.28)" },
                      "&:active": { transform: "translateY(-1px) scale(.998)" },
                      ...REDUCED_MOTION_SX,
                    }}
                  >
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
                {summary.rows.map((row, rowIndex) => {
                  const open = row.notStarted + row.inProgress;
                  const hot = row.notStartedOverdue + row.inProgressOverdue;
                  return (
                    <Box
                      key={row.key}
                      onClick={(event) => {
                        if (dragRef.current.moved) {
                          dragRef.current.moved = false;
                          event.preventDefault();
                          return;
                        }
                        setDetail(row);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setDetail(row); }}
                      sx={{
                        ...CARD_SX,
                        // ровно три карточки на всю ширину области
                        flex: "0 0 calc((100% - 2 * 20px) / 3)",
                        minWidth: 260,
                        cursor: "pointer",
                        borderLeft: `5px solid ${hot > 0 ? "#E53935" : "#5A67D8"}`,
                        userSelect: "none",
                        animation: `${dashboardRiseIn} 520ms cubic-bezier(.2,.8,.2,1) both`,
                        animationDelay: `${Math.min(rowIndex * 55, 385)}ms`,
                        transition: "transform 280ms cubic-bezier(.2,.8,.2,1), box-shadow 280ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease",
                        "&:hover": { transform: "translateY(-5px) scale(1.006)", boxShadow: "0 18px 46px rgba(23,28,143,0.2)" },
                        ...REDUCED_MOTION_SX,
                      }}
                    >
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
                          <Typography sx={{ fontWeight: 900, fontSize: 17, color: "#1A1F36" }} noWrap>{row.title}</Typography>
                          <Box
                            role="button"
                            tabIndex={0}
                            aria-label={`Открытые задачи: ${open}; показать разбивку по названиям`}
                            onClick={(event) => openBreakdown(event, row, { label: "Открытые", countsKey: "openCounts", color: "#5A67D8" })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openBreakdown(event, row, { label: "Открытые", countsKey: "openCounts", color: "#5A67D8" });
                              }
                            }}
                            sx={{ px: 1.25, py: 0.4, borderRadius: "999px", bgcolor: "rgba(90,103,216,0.1)", color: "#5A67D8", fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", cursor: "pointer", "&:hover": { bgcolor: "rgba(90,103,216,0.17)" } }}
                          >
                            открыто {open}
                          </Box>
                        </Box>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                          {METRICS.map((m) => (
                            <Metric
                              key={m.key}
                              label={m.label}
                              ariaLabel={m.label}
                              value={row[m.key]}
                              color={m.color}
                              onClick={(event) => openBreakdown(event, row, m)}
                              overdueValue={m.overdueKey ? row[m.overdueKey] : undefined}
                              overdueAriaLabel={m.overdueBreakdownTitle}
                              onOverdueClick={m.overdueKey
                                ? (event) => openBreakdown(event, row, { label: m.overdueBreakdownTitle, countsKey: m.overdueCountsKey })
                                : undefined}
                            />
                          ))}
                        </Box>
                      </Box>
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
                  всего за окно: {summary.timeline.reduce((s, p) => s + p.count, 0)} · масштаб: колесо или выделение области; сброс — кнопка справа
                </Typography>
              </Box>
              <Chart options={chartOptions} series={chartSeries} type="bar" height={380} width="100%" />
            </Box>
          </>
        )}
      </Box>

      {/* Разбивка открывается прямо от нажатого числа, а не hover-tooltip. */}
      <TaskBreakdownPopover breakdown={breakdown} onClose={() => setBreakdown(null)} />

      {/* Полная сводка исполнителя по нажатию на карточку. */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: "22px", p: 0.5 } }}>
        {detail && (
          <DialogContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 22, fontWeight: 900, color: "#171C8F" }} noWrap>{detail.title}</Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>{detail.email || "—"}</Typography>
              </Box>
              <IconButton onClick={() => setDetail(null)} size="small" aria-label="Закрыть"><CloseRoundedIcon /></IconButton>
            </Box>
            <Box sx={{ display: "flex", gap: 1, mb: 2.5, flexWrap: "wrap" }}>
              {METRICS.map((m) => (
                <Box key={m.key} sx={{ flex: "1 1 92px", minWidth: 92, textAlign: "center", borderRadius: "14px", pt: 1.5, pb: 1, bgcolor: "rgba(23,28,143,0.04)" }}>
                  <Box data-testid="dialog-metric-count-cluster" sx={{ minHeight: 32, display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 0.5 }}>
                    <Typography sx={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, color: detail[m.key] > 0 ? m.color : "rgba(0,0,0,0.25)" }}>{detail[m.key]}</Typography>
                    {m.overdueKey && (
                      <Box
                        component="span"
                        aria-label={`${m.overdueBreakdownTitle}: ${detail[m.overdueKey]}`}
                        sx={{
                          mt: 0.25,
                          boxSizing: "border-box",
                          minWidth: 24,
                          height: 18,
                          px: 0.25,
                          borderRadius: "999px",
                          bgcolor: detail[m.overdueKey] > 0 ? "#FDE8E7" : "rgba(0,0,0,0.06)",
                          color: detail[m.overdueKey] > 0 ? "#C62828" : "#8A8F9C",
                          fontSize: 11,
                          fontWeight: 900,
                          lineHeight: "18px",
                        }}
                      >
                        {detail[m.overdueKey]}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>{m.label}</Typography>
                </Box>
              ))}
            </Box>
            <TitleSummary row={detail} />
          </DialogContent>
        )}
      </Dialog>
    </Box>
  );
}

DashboardView.propTypes = {
  office: PropTypes.string,
  onBack: PropTypes.func,
};
