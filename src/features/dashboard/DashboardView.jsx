// src/features/dashboard/DashboardView.jsx
// Сводный дашборд: плитки статусов, карточки по исполнителям и почасовой
// роллинг-таймлайн завершённых на recharts (адаптивный, с тултипом).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ReferenceLine, ReferenceArea, Brush,
} from "recharts";
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

function Metric({ label, value, color, big }) {
  return (
    <Box sx={{ flex: "1 1 64px", minWidth: 0, textAlign: "center" }}>
      <Typography sx={{ fontSize: big ? 34 : 28, fontWeight: 800, lineHeight: 1.05, color: value > 0 ? color : "rgba(0,0,0,0.22)" }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: 12 }}>{label}</Typography>
    </Box>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: "rgba(26,31,54,0.94)", color: "#fff", borderRadius: "10px", px: 1.25, py: 0.75, fontSize: 12 }}>
      <Box sx={{ fontWeight: 800 }}>{label}</Box>
      <Box>завершено: {payload[0].value}</Box>
    </Box>
  );
}

export default function DashboardView({ office, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, meta: null, tasks: [] });
  const [tick, setTick] = useState(0);
  // Зум таймлайна: сколько последних часов показываем.
  const [zoomHours, setZoomHours] = useState(ROLLING_DAYS * 24);

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

  const summary = useMemo(() => summarizeTasks(state.tasks), [state.tasks]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // Окно зума — последние zoomHours корзин.
  const chartData = useMemo(
    () => summary.timeline.slice(Math.max(0, summary.timeline.length - zoomHours)).map((p) => ({
      ...p,
      t: `${p.dayKey}_${p.label}`,
    })),
    [summary.timeline, zoomHours],
  );

  // Разделители и подсветка суток внутри видимого окна.
  const dayBands = useMemo(() => {
    const out = [];
    let cur = null;
    for (const p of chartData) {
      if (!cur || cur.dayKey !== p.dayKey) {
        cur = { dayKey: p.dayKey, x1: p.t, x2: p.t, label: `${p.dayLabel} ${String(p.day).padStart(2, "0")}`, isToday: p.isToday };
        out.push(cur);
      } else {
        cur.x2 = p.t;
      }
    }
    return out.map((b, i) => ({ ...b, alt: i % 2 === 1 }));
  }, [chartData]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F3F5FB", pb: 8 }}>
      <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 2, md: 4 }, pt: { xs: 8, md: 4 }, minWidth: 0, overflowX: "hidden" }}>
        <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 1.5 }}>
          <Box>
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
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, mt: 1 }}>
                      <Typography sx={{ fontSize: 64, fontWeight: 900, lineHeight: 1 }}>{value}</Typography>
                      {h.overdueKey && (
                        <Box sx={{ px: 1.5, py: 0.5, borderRadius: "999px", bgcolor: "rgba(255,255,255,0.24)", fontSize: 13, fontWeight: 800 }}>
                          просрочено {overdue}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 900, color: "#171C8F" }}>
                По исполнителям · {summary.rows.length}
              </Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                всего задач в выборке: {state.meta?.totalTasks ?? state.tasks.length}
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
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2.5, mb: 3.5, minWidth: 0 }}>
                {summary.rows.map((row) => {
                  const open = row.notStarted + row.inProgress;
                  const hot = row.notStartedOverdue + row.inProgressOverdue;
                  return (
                    <Box key={row.key} sx={{ ...CARD_SX, borderLeft: `5px solid ${hot > 0 ? "#E53935" : "#5A67D8"}`, transition: "transform .15s, box-shadow .15s", "&:hover": { transform: "translateY(-3px)", boxShadow: "0 12px 36px rgba(23,28,143,0.16)" } }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
                        <Tooltip title={row.email || row.title}>
                          <Typography sx={{ fontWeight: 900, fontSize: 17, color: "#1A1F36" }} noWrap>{row.title}</Typography>
                        </Tooltip>
                        <Box sx={{ px: 1.25, py: 0.4, borderRadius: "999px", bgcolor: "rgba(90,103,216,0.1)", color: "#5A67D8", fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" }}>
                          открыто {open}
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {METRICS.map((m) => <Metric key={m.key} label={m.label} value={row[m.key]} color={m.color} />)}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}

            <Box sx={{ ...CARD_SX, display: "flex", flexWrap: "wrap", gap: 1, mb: 3.5, minWidth: 0 }}>
              <Box sx={{ flex: 1, minWidth: 96, display: "flex", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 900, fontSize: 16, color: "#171C8F" }}>Итого</Typography>
              </Box>
              {METRICS.map((m) => <Metric key={m.key} label={m.label} value={summary.totals[m.key] || 0} color={m.color} big />)}
            </Box>

            <Box sx={CARD_SX}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 2 }}>
                <Typography sx={{ fontWeight: 900, fontSize: 20, color: "#1A1F36" }}>
                  {`Завершено: ${ROLLING_DAYS} суток по часам`}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  всего за окно: {summary.timeline.reduce((s, p) => s + p.count, 0)}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                {[24, 72, ROLLING_DAYS * 24].map((h) => (
                  <Button
                    key={h}
                    size="small"
                    variant={zoomHours === h ? "contained" : "outlined"}
                    onClick={() => setZoomHours(h)}
                    sx={{ borderRadius: "10px", textTransform: "none", fontWeight: 700, minWidth: 0, px: 1.5 }}
                  >
                    {h >= 24 ? `${h / 24} сут` : `${h} ч`}
                  </Button>
                ))}
              </Box>
              <Box sx={{ width: "100%", height: { xs: 300, md: 380 } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7B84FF" />
                        <stop offset="100%" stopColor="#5A67D8" stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(23,28,143,0.08)" vertical={false} />
                    {/* Подсветка суток — чередуем фон, чтобы дни читались без сетки */}
                    {dayBands.map((b) => (
                      <ReferenceArea key={`a_${b.dayKey}`} x1={b.x1} x2={b.x2} fill={b.isToday ? "rgba(90,103,216,0.09)" : (b.alt ? "rgba(90,103,216,0.04)" : "transparent")} fillOpacity={1} ifOverflow="extendDomain" />
                    ))}
                    {/* Пунктир на границе суток + подпись даты сверху */}
                    {dayBands.map((b) => (
                      <ReferenceLine key={`l_${b.dayKey}`} x={b.x1} stroke="#5A67D8" strokeDasharray="4 4" strokeOpacity={b.isToday ? 0.85 : 0.4}
                        label={{ value: b.label, position: "top", fill: b.isToday ? "#5A67D8" : "#8A90A6", fontSize: 11, fontWeight: b.isToday ? 800 : 600 }} />
                    ))}
                    <XAxis dataKey="t" tickFormatter={(v) => (String(v).endsWith("_00:00") || String(v).endsWith("_06:00") || String(v).endsWith("_12:00") || String(v).endsWith("_18:00") ? String(v).slice(-5) : "")}
                      tick={{ fontSize: 11, fill: "#7A8194" }} tickLine={false} axisLine={{ stroke: "rgba(23,28,143,0.12)" }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#7A8194" }} tickLine={false} axisLine={false} width={44} />
                    <RTooltip content={<ChartTip />} cursor={{ fill: "rgba(90,103,216,0.07)" }} />
                    <Bar dataKey="count" name="Завершено" fill="url(#dashBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    {/* Тонкий зум/панорама внутри выбранного окна */}
                    <Brush dataKey="t" height={22} travellerWidth={8} stroke="#5A67D8" fill="#fff" tickFormatter={() => ""} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
