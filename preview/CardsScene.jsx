// preview/CardsScene.jsx — сцена предпросмотра (используется и в браузере, и в SSR-проверке).
import React from "react";
import { Box, Typography } from "@mui/material";
import TaskCard from "../src/features/tasks/components/TaskCard";

const CT_ID = "0x0100PALLET";
// Тип контента завершённых задач: своей записи в TaskBehaviour нет — должна сработать общая («*»).
const CT_ID_DONE = "0x0100DONE";

const behaviour = {
  _default: {
    rf: [
      { f: "THU", ti: "ЕО" },
      { f: "Recipient/SCNumberText", ti: "Получатель" },
      { f: "DC_THU", ti: "РЦ" },
      { f: "Location1", ti: "Местоположение", z: "body" },
    ],
  },
  "Исправлено": {
    p: [],
    c: false,
    aa: false,
    aar: false,
    anim: { type: "celebrate", title: "Паллет исправлен", text: "Отличная работа!", emoji: "🎉" },
  },
  "Не исправлено": {
    p: [{ f: "CommentResult", ti: "Причина", t: "text", r: true }],
    c: true,
    aa: false,
    aar: false,
    ct: "Подтверждение результата",
    cm: "Вы уверены, что хотите завершить задачу как «Не исправлено»?",
    ok: "Подтвердить «Не исправлено»",
    no: "Отмена",
    anim: "none",
  },
};

const behaviourRecord = {
  id: 1,
  title: "Паллет",
  description: "",
  behaviour: JSON.stringify(behaviour),
  styling: JSON.stringify({
    "Исправлено": { bg: "linear-gradient(180deg,#2e7d32 0%,#1b5e20 100%)", variant: "contained" },
    "Не исправлено": { bg: "linear-gradient(180deg,#e53935 0%,#b71c1c 100%)", variant: "contained" },
  }),
  stylingActions: "",
  enabled: true,
  modified: "",
};

// Общая запись-фолбэк для типов контента без своей настройки (завершённые задачи).
const fallbackRecord = {
  id: 2,
  title: "*",
  description: "",
  behaviour: JSON.stringify(behaviour),
  styling: JSON.stringify({
    "Исправлено": { bg: "linear-gradient(180deg,#2e7d32 0%,#1b5e20 100%)", c: "#ffffff" },
    "Не исправлено": { bg: "linear-gradient(180deg,#e53935 0%,#b71c1c 100%)", c: "#ffffff" },
  }),
  stylingActions: "",
  enabled: true,
  modified: "",
};

export const taskConfig = {
  taskBehaviour: new Map([[1, behaviourRecord], [2, fallbackRecord]]),
  ctMetaMap: new Map([
    [CT_ID, { id: CT_ID, name: "Паллет" }],
    [CT_ID_DONE, { id: CT_ID_DONE, name: "Завершение поиска ЕО" }],
  ]),
  ctConfigMap: new Map(),
};

const BODY_1 =
  "<div><b>Устранить проблемы&amp;#58;</b><br>Товар не примотан к поддону, доступ к ТМЦ затруднён.<br>Паллет стоит в проходе ряда B.</div>";
const BODY_2 = "<div>Проверить комплектность отгрузки по накладной, сверить маркировку и пересчитать места.</div>";

const mkTask = (id, itemId, { title, body, status, dueDate, overdue = false, ctId = CT_ID, result = "" }) => ({
  Id: id,
  Title: title,
  Body: body,
  BodyRaw: body,
  AssignedTo: "Иванов И.И.",
  EditorTitle: "Иванов И.И.",
  Status: status,
  ResultSearchTHU: result,
  ResultValue: result,
  Location1: "",
  AdditionalActions: [],
  Created: new Date().toISOString(),
  Modified: new Date().toISOString(),
  PercentComplete: 0,
  DueDate: dueDate,
  Recipient: "",
  SCNumber: "",
  RelatedItems: JSON.stringify([{ ListId: "LIST-A", ItemId: itemId }]),
  ContentTypeId: ctId,
  contentTypeId: ctId,
  raw: { ContentTypeId: ctId },
  overdue,
});

const now = Date.now();
export const tasks = [
  mkTask(1, 101, {
    title: "Устранить проблемы:",
    body: BODY_1,
    status: "В процессе",
    dueDate: new Date(now + 3 * 3600 * 1000).toISOString(),
  }),
  mkTask(2, 102, {
    title: "Проверить комплектность",
    body: BODY_2,
    status: "Не начата",
    dueDate: new Date(now - 2 * 3600 * 1000).toISOString(),
    overdue: true,
  }),
  mkTask(3, 103, {
    title: "Исправление проблемной ЕО",
    body: BODY_1,
    status: "Завершена",
    dueDate: new Date(now - 26 * 3600 * 1000).toISOString(),
    ctId: CT_ID_DONE,
    result: "Исправлено",
  }),
];

export default function CardsScene() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f6fb", p: 3, fontFamily: "'Poppins','Inter',sans-serif" }}>
      <Typography sx={{ fontWeight: 800, mb: 0.5, color: "#171c8f" }}>Предпросмотр карточек задач</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
        Мок-данные: поля в шапке заданы через Behaviour.rf (THU, Recipient/SCNumberText, DC_THU)
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))", xl: "repeat(3, minmax(0,1fr))" },
        }}
      >
        {tasks.map((t) => (
          <Box key={t.Id}>
            <TaskCard
              task={t}
              isCompleted={String(t.Status).toLowerCase().includes("заверш")}
              isOverdue={!!t.overdue}
              fieldDefaultActions={[]}
              choices={["Исправлено", "Не исправлено"]}
              updatingId={null}
              updatingAction={null}
              onResultClick={() => {}}
              onTakeInWork={() => {}}
              onComplete={() => {}}
              currentUserId={1}
              currentUserTitle="Иванов И.И."
              initialAction={null}
              taskConfig={taskConfig}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
