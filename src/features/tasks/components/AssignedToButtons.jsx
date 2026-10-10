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
import { parseAssignees, parseEditors, resolveAssigneeCached } from "../lib/assignees";

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
 * Кнопка(и) принципала: иконка «человек/группа» + имя, клик открывает карточку
 * принципала. ОДИН компонент на два поля — «Кому назначено» (AssignedTo) и
 * «Исполнитель» (Editor): вид и поведение должны совпадать (требование
 * 2026-10-10), различаются только тем, откуда берётся список людей.
 *
 * @param {object} props
 * @param {object} props.task — задача (нужна, чтобы понять САЙТ принципала)
 * @param {Array<{title:string,id:number|null}>} props.people — кого показать
 * @param {string} [props.testId] — data-testid кнопки
 * @param {"small"|"medium"} [props.size]
 * @param {object} [props.sx]
 * @param {string} [props.emptyText]
 */
export function PrincipalButtons({
  task = null,
  people = [],
  testId = "assigned-to-button",
  emptyTestId = "assigned-to-empty",
  buttonTitle = "Кому назначено — нажмите, чтобы посмотреть",
  size = "small",
  sx = null,
  emptyText = "—",
  onOpenPrincipal = null,
}) {
  const assignees = people;
  // Уточнённые данные принципала по Id: { [id]: { kind, title } }.
  // Кроме типа (человек/группа) держим и ИМЯ: задача нередко приходит только с
  // AssignedToId (CAML-кандидат без $expand, 401/403 на fetchFullTask, внешние
  // источники) — тогда в карточке и таблице вместо ФИО рисовалось «Id 10».
  const [infos, setInfos] = useState({});
  const [open, setOpen] = useState(null);

  // Тип принципала (человек/группа) и его имя — по Id, с кэшем и дедупом запросов.
  useEffect(() => {
    let alive = true;
    for (const person of assignees) {
      if (!person.id) continue;
      resolveAssigneeCached(task, person).then((info) => {
        if (!alive || !info) return;
        setInfos((prev) => {
          const known = prev[person.id];
          if (known && known.kind === info.kind && known.title === (info.title || "")) return prev;
          return { ...prev, [person.id]: { kind: info.kind, title: info.title || "" } };
        });
      });
    }
    return () => { alive = false; };
  }, [assignees, task]);

  if (assignees.length === 0) {
    return (
      <Typography component="span" variant="caption" color="text.secondary" data-testid={emptyTestId}>
        {emptyText}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "inline-flex", flexWrap: "wrap", gap: 0.25, alignItems: "center", minWidth: 0, maxWidth: "100%" }}>
      {assignees.map((person, i) => {
        const info = infos[person.id];
        const kind = info?.kind || "unknown";
        // Имя — из задачи, иначе из уточнения по Id. «Id 10» остаётся только
        // как последний вариант (нет ни имени, ни доступа к SharePoint).
        const label = person.title || info?.title || (person.id ? `Id ${person.id}` : "—");
        return (
          <Button
            key={`${person.id ?? "no-id"}:${person.title || i}`}
            size={size}
            variant="text"
            data-testid={testId}
            // Общий признак «это кнопка принципала»: по нему строка таблицы
            // понимает, что клик был НЕ по строке (не открывать поповер действий).
            data-principal-button="true"
            data-principal-id={person.id ?? ""}
            data-principal-kind={kind}
            title={buttonTitle}
            // Клик перехватываем В ФАЗЕ ПОГРУЖЕНИЯ и гасим событие: строка
            // таблицы (AG Grid) слушает клик на своём контейнере, а React
            // навешивает обработчики на корень — обычный stopPropagation в
            // onClick сработал бы уже ПОСЛЕ того, как грид открыл поповер.
            onClickCapture={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // В диалог отдаём уже уточнённое имя (иначе там на мгновение
              // показался бы пустой «Имя», пока идёт запрос).
              setOpen({ ...person, title: person.title || info?.title || "" });
              onOpenPrincipal?.(person);
            }}
            startIcon={<KindIcon kind={kind} />}
            sx={{
              // Серый и компактный — как подписи в карточке, а не как действие.
              textTransform: "none",
              fontWeight: 500,
              fontSize: "0.72rem",
              // Высота строки — КАК У СОСЕДНЕГО ТЕКСТА: inherit-ом забираем
              // line-height подписи, поэтому базовая линия внутри кнопки
              // совпадает с базовой линией «Исполнитель:» и «• Статус:».
              lineHeight: "inherit",
              letterSpacing: 0,
              // inline-flex по умолчанию садится на baseline своей иконки (у
              // <svg> baseline = нижний край) — из-за этого подписи вокруг
              // кнопки и «ехали лесенкой». Держим кнопку по центру строки и не
              // даём ей быть выше соседнего текста (min-height MUI = 30 px).
              display: "inline-flex",
              verticalAlign: "middle",
              alignItems: "center",
              height: "auto",
              minHeight: 0,
              px: 0.5,
              py: 0,
              minWidth: 0,
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
            {label}
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

/**
 * Кнопки «Кому назначено» (AssignedTo). Обычно принципал один, но колонка может
 * быть многозначной — тогда кнопка на каждого.
 */
export default function AssignedToButtons({ task = null, ...rest }) {
  const people = useMemo(() => parseAssignees(task), [task]);
  return <PrincipalButtons task={task} people={people} {...rest} />;
}

/**
 * Кнопка «Исполнитель» (Editor — тот, кто ВЗЯЛ задачу в работу). Требование
 * 2026-10-10: вид и поведение — как у «Кому назначено» (иконка человек/группа,
 * клик открывает карточку принципала). Пока задачу не взяли — прочерк: Editor
 * у SharePoint проставляется и при создании, показывать автора нельзя.
 */
export function TakerButtons({ task = null, ...rest }) {
  const people = useMemo(() => parseEditors(task), [task]);
  return (
    <PrincipalButtons
      task={task}
      people={people}
      testId="taker-button"
      emptyTestId="taker-empty"
      buttonTitle="Исполнитель — нажмите, чтобы посмотреть"
      {...rest}
    />
  );
}

/** Ячейка AG Grid «Кому назначено» — та же кнопка с иконкой человека/группы. */
export function AssignedToCell({ data }) {
  return <AssignedToButtons task={data} />;
}

/** Ячейка AG Grid «Исполнитель» — та же кнопка, что и «Кому назначено». */
export function TakerCell({ data }) {
  return <TakerButtons task={data} />;
}
