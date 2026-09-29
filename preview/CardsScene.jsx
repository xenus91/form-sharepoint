// preview/CardsScene.jsx — сцена предпросмотра на РЕАЛЬНЫХ данных пользователя
// (кэш sp:taskBehaviour / sp:resultFields:ctMap / sp:resultFields:ctMeta).
import React from "react";
import { Box, Typography } from "@mui/material";
import TaskCard from "../src/features/tasks/components/TaskCard";

// ── Content types (из sp:resultFields:ctMeta / ctMap) ───────────────────────────
const CT_SEARCH = "0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E"; // Результат поиска ЕО
const CT_FOUND = "0x0108003365C4474CAE8C42BCE396314E88E51F006FF64E44A1862D4A9352DF89A0C6859D00A254821BF214AE4BB1365418833D1479"; // Результат задачи найденной ЕО
const CT_FIX = "0x0108003365C4474CAE8C42BCE396314E88E51F008DE7E6A51CADB449AD082BE301AEB160001EA3FD7A60054A43B9375B07848DB0D7"; // Задача исправления проблемной ЕО

const CT_NAMES = {
  [CT_SEARCH]: "Результат поиска ЕО",
  [CT_FOUND]: "Результат задачи найденной ЕО",
  // ⚠️ В проде тип контента называется именно так, а запись TaskBehaviour — «Задача исправления проблемной ЕО».
  // Проверяем, что конфиг всё равно находитcя (частичное совпадение).
  [CT_FIX]: "Исправление проблемной ЕО",
};

// ── TaskBehaviour (из sp:taskBehaviour:map:v2) ─────────────────────────────────
// Запись есть только для «Задача исправления проблемной ЕО».
const BEHAVIOUR_FIX = `{
  "_default": {
    "rf": [
      { "f": "THU", "ti": "ЕО" },
      { "f": "Recipient/SCNumberText", "ti": "Получатель" },
      { "f": "Location1", "ti": "Местоположение", "z": "body" }
    ]
  },
  "Исправлено": { "p": [], "c": false, "aa": false, "aar": false,
    "anim": { "type": "celebrate", "title": "Паллет исправлен", "text": "Отличная работа!", "emoji": "🎉" } },
  "Не исправлено": { "p": [{ "f": "CommentResult", "ti": "Причина", "t": "text", "r": true }],
    "c": true, "ct": "Подтверждение результата",
    "cm": "Вы уверены, что хотите завершить задачу как «Не исправлено»?",
    "ok": "Подтвердить «Не исправлено»", "no": "Отмена", "anim": "none" }
}`;

const STYLING_FIX = `{
  "_default": { "bg": "linear-gradient(180deg, #5a67d8 0%, #434190 100%)", "c": "#ffffff", "v": "ctd" },
  "Исправлено": { "bg": "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", "c": "#ffffff", "v": "ctd", "i": "checkcircle" },
  "Не исправлено": { "bg": "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", "c": "#ffffff", "v": "ctd", "i": "cancel" }
}`;

const STYLING_ACTIONS_FIX = `{
  "_default": { "v": "ctd" },
  "takeInWork": { "bg": "linear-gradient(180deg, #7b84ff 0%, #5a67d8 100%)", "c": "#ffffff", "v": "ctd", "i": "playarrow" },
  "confirm": { "bg": "#2e7d32", "c": "#ffffff", "v": "ctd", "i": "done" },
  "cancel": { "bg": "#ffffff", "c": "#5f6368", "v": "out", "i": "close" },
  "promptSubmit": { "bg": "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", "c": "#ffffff", "v": "ctd", "i": "save" },
  "promptCancel": { "bg": "#ffffff", "c": "#5f6368", "v": "out", "i": "close" }
}`;

const behaviourRecord = {
  id: 1,
  title: "Задача исправления проблемной ЕО",
  description: "",
  behaviour: BEHAVIOUR_FIX,
  styling: STYLING_FIX,
  stylingActions: STYLING_ACTIONS_FIX,
  enabled: true,
  modified: "2026-09-28T18:32:22Z",
};

export const taskConfig = {
  taskBehaviour: new Map([[1, behaviourRecord]]),
  ctMetaMap: new Map(Object.entries(CT_NAMES).map(([id, name]) => [id, { id, name, stringId: id }])),
  ctConfigMap: new Map(),
};

// ── Задачи ────────────────────────────────────────────────────────────────────
const BODY = "<div>Устранить проблемы:<br>Товар не примотан к поддону, доступ к ТМЦ</div>";

const mkTask = ({ id, itemId, ctId, title, body, status, choices, result = "", overdue = false }) => ({
  Id: id,
  Title: title,
  Body: body,
  BodyRaw: body,
  AssignedTo: "Поршаков Сергей",
  AssignedToId: 42,
  EditorTitle: "Поршаков Сергей",
  Status: status,
  ResultSearchTHU: result,
  ResultValue: result,
  Location1: "",
  AdditionalActions: [],
  Created: new Date().toISOString(),
  Modified: new Date().toISOString(),
  PercentComplete: 0,
  DueDate: new Date(Date.now() + (overdue ? -2 : 3) * 3600 * 1000).toISOString(),
  Recipient: "",
  SCNumber: "",
  RelatedItems: JSON.stringify([{ ListId: "67291e1a-7ad5-4c65-8c2c-4a414bb3cd3d", ItemId: itemId }]),
  ContentTypeId: ctId,
  contentTypeId: ctId,
  raw: { ContentTypeId: ctId },
  overdue,
});

// Задача без настроек, но с собственными полями ТК/ЕО: шапка должна быть ПУСТОЙ (без legacy-подстановки).
const unconfigured = mkTask({
  id: 654, itemId: 24924, ctId: CT_SEARCH,
  title: "Поиск ЕО", body: "Проверить ЕО 808117004021471765 для ТК 150 в зоне отгрузки", status: "Не начата",
  choices: ["Найдена", "Не найдена"],
});
unconfigured.THU = "808117004021471765";
unconfigured.SCNumber = "150";
unconfigured.SCNumberText = "150";

// ⭐ Прод-кейс: у задачи ПУСТОЙ RelatedItems (связь не читается), но enrich.js уже положил
// в саму задачу THU / Recipient / SCNumber. Плитки из rf должны появиться из полей задачи.
const prodCase = mkTask({
  id: 655, itemId: 0, ctId: CT_FIX,
  title: "Устранить проблемы:", body: "Устранить проблемы:\nДоступ к ТМЦ,Превышение допустимой высоты", status: "В процессе выполнения",
  choices: ["Исправлено", "Не исправлено"],
});
prodCase.RelatedItems = "";
prodCase.THU = "808117004021471765";
prodCase.SCNumber = "150";
prodCase.SCNumberText = "150";
prodCase.Recipient = "Center";
prodCase.DC_THU = "1050";

export const tasks = [
  // 1) «Результат поиска ЕО» — Behaviour НЕ настроен → кнопки просто завершают задачу
  mkTask({
    id: 651, itemId: 24922, ctId: CT_SEARCH,
    title: "Найти ЕО", body: BODY, status: "В процессе",
    choices: ["Найдена", "Не найдена"],
  }),
  // 2) «Задача исправления проблемной ЕО» — Behaviour настроен (rf + anim + confirm)
  mkTask({
    id: 652, itemId: 24923, ctId: CT_FIX,
    title: "Устранить проблемы:", body: BODY, status: "В процессе",
    choices: ["Исправлено", "Не исправлено"],
  }),
  unconfigured,
  prodCase,
  // 3) «Результат задачи найденной ЕО» — Behaviour НЕ настроен, один результат «Выполнено»
  mkTask({
    id: 653, itemId: 24923, ctId: CT_FOUND,
    title: "Завершить поиск", body: BODY, status: "В процессе",
    choices: ["Выполнено"],
  }),
];

export const choicesByTask = {
  655: ["Исправлено", "Не исправлено"],
  651: ["Найдена", "Не найдена"],
  652: ["Исправлено", "Не исправлено"],
  653: ["Выполнено"],
  654: ["Найдена", "Не найдена"],
};

export const CT = { CT_SEARCH, CT_FOUND, CT_FIX };

export default function CardsScene({ onResultClick, onComplete, updatingId = null, updatingAction = null }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f6fb", p: 3, fontFamily: "'Poppins','Inter',sans-serif" }}>
      <Typography sx={{ fontWeight: 800, mb: 0.5, color: "#171c8f" }}>Предпросмотр карточек задач</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
        Данные из реального кэша: запись TaskBehaviour есть только для «Задача исправления проблемной ЕО»
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))", xl: "repeat(3, minmax(0,1fr))" } }}>
        {tasks.map((t) => (
          <Box key={t.Id}>
            <TaskCard
              task={t}
              isCompleted={false}
              isOverdue={!!t.overdue}
              fieldDefaultActions={[]}
              choices={choicesByTask[t.Id]}
              updatingId={updatingId}
              updatingAction={updatingAction}
              onResultClick={onResultClick || (() => {})}
              onTakeInWork={() => {}}
              onComplete={onComplete || (() => {})}
              currentUserId={1}
              currentUserTitle="Поршаков Сергей"
              initialAction={null}
              taskConfig={taskConfig}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
