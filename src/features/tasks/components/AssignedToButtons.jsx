/* eslint-disable react/prop-types */
// src/features/tasks/components/AssignedToButtons.jsx
//
// «Кому назначено» (AssignedTo) во ВСЕХ интерфейсах: кнопка с иконкой —
// человек (PersonIcon) или группа (GroupsIcon). Клик открывает карточку
// принципала: тип, имя, учётная запись, почта.
//
// Тип принципала в самом задании не приходит (только Id и/или Title), поэтому
// уточняем его ленивым запросом к SharePoint (tasks/principalDetails.js, кэш в
// sessionStorage + дедуп «в полёте»). Иконка меняется сама, как только тип
// выяснен: сначала человек, группа — после ответа.

import { useEffect, useMemo, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import GroupsIcon from "@mui/icons-material/Groups";
import { parseAssignees, resolveAssigneeCached } from "../lib/assignees";

const KIND_LABEL = { user: "Пользователь", group: "Группа", unknown: "Тип не определён" };

function KindIcon({ kind, fontSize = "small" }) {
  if (kind === "group") return <GroupsIcon fontSize={fontSize} />;
  return <PersonIcon fontSize={fontSize} />;
}

/** Карточка принципала: кто это — человек или группа, и как с ним связаться. */
export function PrincipalInfoDialog({ open = false, task = null, assignee = null, onClose = () => {} }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !assignee) return undefined;
    let alive = true;
    setLoading(true);
    setInfo({ id: assignee.id ?? null, kind: "unknown", title: assignee.title || "", loginName: null, email: null });
    resolveAssigneeCached(task, assignee)
      .then((next) => { if (alive) setInfo(next); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, task, assignee]);

  const kind = info?.kind || "unknown";
  const rows = [
    ["Тип", KIND_LABEL[kind]],
    ["Имя", info?.title || assignee?.title || "—"],
    ["Учётная запись", info?.loginName || "—"],
    ["Почта", info?.email || "—"],
    ["Id", info?.id ?? assignee?.id ?? "—"],
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="principal-info-dialog">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 800 }}>
        <KindIcon kind={kind} />
        {kind === "group" ? "Группа" : kind === "user" ? "Пользователь" : "Кому назначено"}
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">Уточняю данные…</Typography>
          </Stack>
        ) : (
          <Stack spacing={0.75}>
            {rows.map(([label, value]) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{String(value)}</Typography>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" data-testid="principal-info-close">Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Кнопки «Кому назначено». Обычно принципал один, но колонка может быть
 * многозначной — тогда кнопка на каждого.
 *
 * @param {object} props
 * @param {object} props.task — задача (AssignedTo / AssignedToId)
 * @param {"small"|"medium"} [props.size]
 * @param {object} [props.sx]
 * @param {string} [props.emptyText]
 */
export default function AssignedToButtons({
  task = null,
  size = "small",
  sx = null,
  emptyText = "—",
  onOpenPrincipal = null,
}) {
  const assignees = useMemo(() => parseAssignees(task), [task]);
  const [kinds, setKinds] = useState({});
  const [open, setOpen] = useState(null);

  // Тип принципала (человек/группа) — по Id, с кэшем и дедупом запросов.
  useEffect(() => {
    let alive = true;
    for (const person of assignees) {
      if (!person.id) continue;
      resolveAssigneeCached(task, person).then((info) => {
        if (!alive || !info) return;
        setKinds((prev) => (prev[person.id] === info.kind ? prev : { ...prev, [person.id]: info.kind }));
      });
    }
    return () => { alive = false; };
  }, [assignees, task]);

  if (assignees.length === 0) {
    return (
      <Typography component="span" variant="caption" color="text.secondary" data-testid="assigned-to-empty">
        {emptyText}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "inline-flex", flexWrap: "wrap", gap: 0.25, alignItems: "center", minWidth: 0, maxWidth: "100%" }}>
      {assignees.map((person, i) => {
        const kind = kinds[person.id] || "unknown";
        return (
          <Button
            key={`${person.id ?? "no-id"}:${person.title || i}`}
            size={size}
            variant="text"
            data-testid="assigned-to-button"
            data-principal-id={person.id ?? ""}
            data-principal-kind={kind}
            title="Кому назначено — нажмите, чтобы посмотреть"
            // Клик перехватываем В ФАЗЕ ПОГРУЖЕНИЯ и гасим событие: строка
            // таблицы (AG Grid) слушает клик на своём контейнере, а React
            // навешивает обработчики на корень — обычный stopPropagation в
            // onClick сработал бы уже ПОСЛЕ того, как грид открыл поповер.
            onClickCapture={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen(person);
              onOpenPrincipal?.(person);
            }}
            startIcon={<KindIcon kind={kind} />}
            sx={{
              // Серый и компактный — как подписи в карточке, а не как действие.
              textTransform: "none",
              fontWeight: 500,
              fontSize: "0.72rem",
              lineHeight: 1.25,
              letterSpacing: 0,
              px: 0.5,
              py: 0,
              minWidth: 0,
              minHeight: 22,
              maxWidth: "100%",
              color: "#6b7280",
              borderRadius: 1,
              bgcolor: "transparent",
              "&:hover": { bgcolor: "rgba(23,28,143,0.06)", color: "#171c8f" },
              "& .MuiButton-startIcon": { mr: 0.25, minWidth: 0, "& > svg": { fontSize: 14 } },
              "& .MuiButton-label, & > span": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              ...(sx || {}),
            }}
          >
            {person.title || `Id ${person.id}`}
          </Button>
        );
      })}
      <PrincipalInfoDialog
        open={!!open}
        task={task}
        assignee={open}
        onClose={() => setOpen(null)}
      />
    </Box>
  );
}

/** Ячейка AG Grid «Кому назначено» — та же кнопка с иконкой человека/группы. */
export function AssignedToCell({ data }) {
  return <AssignedToButtons task={data} />;
}
