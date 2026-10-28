// src/features/dashboard/DashboardView.jsx
// Сводный дашборд по задачам Office текущего пользователя: плитки статусов,
// карточки по AssignedTo и роллинг-таймлайн завершённых за 7 дней.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { fetchDashboardData, summarizeTasks, ROLLING_DAYS } from "./dashboardData";

const CARD_SX = {
  borderRadius: "18px",
  p: 2,
  bgcolor: "#fff",
  boxShadow: "0 2px 12px rgba(23,28,143,0.08)",
  border: "1px solid rgba(23,28,143,0.08)",
};

const HEROES = [
  { key: "notStarted", title: "Не начато", overdueKey: "notStartedOverdue", grad: "linear-gradient(135deg, #7B84FF 0%, #5A67D8 100%)" },
  { key: "inProgress", title: "В работе", overdueKey: "inProgressOverdue", grad: "linear-gradient(135deg, #22C1A4 0%, #0E9C86 100%)" },
  { key: "completedToday", title: "Завершено сегодня", overdueKey: null, grad: "linear-gradient(135deg, #FFB74D 0%, #F57C00 100%)" },
];

const METRICS = [
  { key: "notStarted", label: "Не начато", color: "#5A67D8" },
  { key: "notStartedOverdue", label: "Просрочено", color: "#E53935" },
  { key: "inProgress", label: "В работе", color: "#0E9C86" },
  { key: "inProgressOverdue", label: "Просрочено", color: "#E53935" },
  { key: "completedToday", label: "За сегодня", color: "#F57C00" },
];

function Metric({ label, value, color }) {
  const hot = value > 0;
  return (
    <Box sx={{ flex: 1, minWidth: 84, textAlign: "center" }}>
      <Typography sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: hot ? color : "rgba(0,0,0,0.28)" }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>{label}</Typography>
    </Box>
  );
}

export default function DashboardView({ office, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, data: null, officeApplied: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const res = await fetchDashboardData(office);
        if (cancelled) return;
        setState({ loading: false, error: null, data: res.tasks, officeApplied: res.officeApplied });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, error: String(e?.response?.data?.error?.message?.value || e?.message || e), data: null, officeApplied: false });
      }
    })();
    return () => { cancelled = true; };
  }, [office, tick]);

  const summary = useMemo(
    () => summarizeTasks(state.data || []),
    [state.data],
  );
  const maxCount = useMemo(
    () => Math.max(1, ...summary.timeline.map((p) => p.count)),
    [summary.timeline],
  );

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F4F6FB", pb: 6 }}>
      <Box sx={{ maxWidth: 1180, mx: "auto", px: 2, pt: 3 }}>
        {/* Шапка */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5, flexWrap: "wrap", gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: "#171C8F" }}>Дашборд задач</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {office ? `Office: ${office}` : "Office не определён — показаны все задачи"}
              {state.officeApplied ? "" : office ? "" : " (фильтр по Office не применён)"}
              {` · окно таймлайна ${ROLLING_DAYS} дней`}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={refresh} startIcon={<RefreshRoundedIcon />} sx={{ borderRadius: "12px", textTransform: "none" }}>
              Обновить
            </Button>
            {typeof onBack === "function" && (
              <Button onClick={onBack} sx={{ borderRadius: "12px", textTransform: "none" }}>Назад</Button>
            )}
          </Box>
        </Box>

        {state.loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#5A67D8" }} />
          </Box>
        )}

        {!state.loading && state.error && (
          <Box sx={{ ...CARD_SX, border: "1px solid rgba(229,57,53,0.4)" }}>
            <Typography sx={{ fontWeight: 700, color: "#c62828" }}>Не удалось загрузить задачи</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>{state.error}</Typography>
          </Box>
        )}

        {!state.loading && !state.error && (
          <>
            {/* Плитки статусов */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2, mb: 3 }}>
              {HEROES.map((h) => {
                const value = summary.totals[h.key] || 0;
                const overdue = h.overdueKey ? summary.totals[h.overdueKey] || 0 : 0;
                return (
                  <Box key={h.key} sx={{ borderRadius: "20px", p: 2.5, backgroundImage: h.grad, color: "#fff", boxShadow: "0 8px 24px rgba(23,28,143,0.18)" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>{h.title}</Typography>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mt: 0.5 }}>
                      <Typography sx={{ fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{value}</Typography>
                      {h.overdueKey && (
                        <Box sx={{ px: 1, py: 0.25, borderRadius: "999px", bgcolor: "rgba(255,255,255,0.22)", fontSize: 12, fontWeight: 700 }}>
                          просрочено {overdue}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>

            {/* Карточки по AssignedTo */}
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#171C8F", mb: 1.5 }}>
              По исполнителям ({summary.rows.length})
            </Typography>
            {summary.rows.length === 0 ? (
              <Box sx={{ ...CARD_SX, textAlign: "center", py: 4 }}>
                <Typography sx={{ color: "text.secondary" }}>Открытых задач нет</Typography>
              </Box>
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2, mb: 3 }}>
                {summary.rows.map((row) => {
                  const open = row.notStarted + row.inProgress;
                  return (
                    <Box key={row.key} sx={{ ...CARD_SX, transition: "transform .15s", "&:hover": { transform: "translateY(-2px)" } }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 15, color: "#1A1F36" }} noWrap>{row.title}</Typography>
                        <Box sx={{ px: 1, py: 0.25, borderRadius: "999px", bgcolor: "rgba(90,103,216,0.1)", color: "#5A67D8", fontSize: 12, fontWeight: 800 }}>
                          открыто {open}
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        {METRICS.map((m) => (
                          <Metric key={m.key} label={m.label} value={row[m.key]} color={m.color} />
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}

            {/* Итого */}
            <Box sx={{ ...CARD_SX, display: "flex", gap: 0.5, mb: 3 }}>
              <Box sx={{ flex: 1, minWidth: 84 }} />
              {METRICS.map((m) => (
                <Metric key={m.key} label={m.label} value={summary.totals[m.key] || 0} color={m.color} />
              ))}
            </Box>

            {/* Роллинг-таймлайн завершённых */}
            <Box sx={CARD_SX}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: "#1A1F36", mb: 1.5 }}>
                {`Завершено за ${ROLLING_DAYS} дней`}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 148 }}>
                {summary.timeline.map((p) => (
                  <Box key={p.key} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: p.isToday ? "#5A67D8" : "text.secondary" }}>
                      {p.count}
                    </Typography>
                    <Box sx={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                      <Box
                        sx={{
                          width: "100%",
                          borderRadius: "8px 8px 4px 4px",
                          minHeight: 4,
                          height: `${Math.max(4, (p.count / maxCount) * 100)}%`,
                          backgroundImage: p.isToday
                            ? "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)"
                            : "linear-gradient(180deg, rgba(123,132,255,0.55) 0%, rgba(90,103,216,0.55) 100%)",
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>{p.label}</Typography>
                    <Typography sx={{ fontSize: 11, color: p.isToday ? "#5A67D8" : "rgba(0,0,0,0.4)", fontWeight: p.isToday ? 800 : 500 }}>
                      {p.day}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
