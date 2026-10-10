// preview/TableScene.jsx — сцена предпросмотра табличного режима #tasks на мок-данных.
//
// Зачем: проверить «на глаз» закреплённую шапку AG Grid (заголовки + строка
// floating-фильтров), фильтрацию и сортировку — без SharePoint и без авторизации.
// Рендерится той же компонентой, что и в приложении: src/features/tasks/components/TasksGrid.
//
// Запуск: npm run preview:cards -- --open   →   http://localhost:5180/?scene=table

import { createElement, useMemo, useState } from "react";
import { Box, Paper, Typography } from "@mui/material";
import TasksGrid from "../src/features/tasks/components/TasksGrid";
import ViewModeToggle from "../src/features/tasks/components/ViewModeToggle";
import { buildRowActions } from "../src/features/tasks/lib/rowActions";
import { renderStylingIcon } from "../src/services/stylingIcons";
import { isNotStartedStatus, isInProgressStatus } from "../src/tasks/status";

const DESCRIPTIONS = [
  "<p>Просмотр видеоархива за смену</p>",
  "<p>Найти проблемную ЕО и зафиксировать результат поиска: <b>ТН № 456</b></p>",
  "<p>Проверить комплектность и отсканировать ШК получателя</p>",
  "<p>Сверить остатки по ТКН и передать данные в смену</p>",
];

// Значения поля результата для main-задач «в работе» (в приложении — по типу контента).
const CHOICES_BY_CT = { main: ["Найдена", "Не найдена"] };

// Стили и иконки — ровно в той форме, которую отдаёт Behaviour-пайплайн
// (src/services/stylingConfig.js: background + hover + color + variant; «i» → иконка).
// Таблица обязана рисовать их ТАК ЖЕ, как карточка — это и проверяем глазами.
const STYLE_BY_CHOICE = {
  "Найдена": {
    background: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)",
    color: "#fff",
    variant: "contained",
    "&:hover": { filter: "brightness(1.1)" },
  },
  "Не найдена": {
    background: "#c62828",
    color: "#fff",
    variant: "contained",
    "&:hover": { filter: "brightness(1.1)" },
  },
};
const ICON_BY_CHOICE = { "Найдена": "done", "Не найдена": "searchoff" };

// Id принципалов: у одного и того же человека на разных сайтах Id РАЗНЫЙ.
const ASSIGNEE_IDS = { "Поршаков Сергей": 207, "Иванов Пётр": 305, "Смирнова Анна": 411, "Группа ООБ": 33 };
// «Я» — Поршаков: на main его Id 207, на сайте ДОБ — 42 (как в жизни).
const CURRENT_USER_IDS = { main: 207, dob: 42 };
const CURRENT_USER_TITLE = "Поршаков Сергей";
const ME = "Поршаков Сергей";

// Сценарии, которые должно быть видно «на глаз» (требования 2026-10-10):
//   • заливка строки по статусу: не начата — без заливки, в работе — оранжевая,
//     завершена — зелёная, просрочена и не закрыта — красная;
//   • «Срок» — как в карточке: «Осталось 3д 4ч» / «Просрочено 2д 5ч назад»;
//   • фильтр «Я исполнитель» — только те, что у меня в работе или закрыты мной
//     (назначение в «Кому назначено» больше не считается);
//   • «Кому назначено» без имени в задаче (только Id) — имя доуточняется с сервера.
const SCENES = [
  { title: "Проверить паллету на складе", status: "Не начата", assignee: ME, taker: null, dueIn: 4 },
  { title: "Просмотр видеоархива", status: "В процессе выполнения", assignee: "Группа ООБ", taker: ME, dueIn: 3 },
  // Словарь статусов у источников свой: основной список — «В процессе выполнения»,
  // другие — «В работе». В таблице оба должны краситься одинаково.
  { title: "Основная задача ООБ (в работе)", status: "В работе", assignee: "Группа ООБ", taker: ME, dueIn: 1 },
  { title: "Заявка ООБ", status: "В процессе выполнения", assignee: "Группа ООБ", taker: "Иванов Пётр", dueIn: 5 },
  { title: "Согласовать выдачу ТМЦ", status: "В процессе выполнения", assignee: ME, taker: ME, dueIn: -2 },
  { title: "Найти проблемную ЕО (ТН № 456)", status: "Завершена", assignee: "Группа ООБ", taker: ME, dueIn: 6 },
  { title: "Инвентаризация зоны комплектации", status: "Завершена", assignee: "Смирнова Анна", taker: "Иванов Пётр", dueIn: -5 },
  { title: "Проверить целостность упаковки", status: "Не начата", assignee: "Иванов Пётр", taker: null, dueIn: -1 },
  // «Кому назначено» пришло только Id — имя дорисуется из SharePoint (mockApi).
  { title: "Основная задача ООБ (только Id исполнителя)", status: "Не начата", assignee: "", assigneeId: 207, taker: null, dueIn: 7 },
  { title: "Заявка ООБ (на группу)", status: "В процессе выполнения", assignee: "Группа ООБ", taker: ME, dueIn: -6, dob: true },
  { title: "Переместить паллет", status: "Завершена", assignee: "Группа ООБ", taker: ME, dueIn: 2, dob: true },
];

const isoInDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

function buildRows() {
  const rows = [];
  // Три «экрана» тех же сценариев — чтобы таблицу можно было прокрутить.
  for (let round = 0; round < 3; round += 1) {
    SCENES.forEach((scene, i) => {
      const n = round * SCENES.length + i + 1;
      const sourceId = scene.dob ? "dob" : "main";
      // На сайте ДОБ у «меня» ДРУГОЙ Id — как в жизни (см. CURRENT_USER_IDS).
      const takerId = scene.taker == null
        ? null
        : (scene.dob && scene.taker === ME ? 42 : ASSIGNEE_IDS[scene.taker] ?? null);
      const assigneeId = scene.assigneeId ?? (scene.assignee ? ASSIGNEE_IDS[scene.assignee] ?? null : null);
      const completed = scene.status === "Завершена";
      rows.push({
        compositeId: `${sourceId}:${n}`,
        sourceId,
        sourceLabel: scene.dob ? "DOB Logistic" : "Main",
        Id: n,
        Title: round === 0 ? scene.title : `${scene.title} №${n}`,
        Body: DESCRIPTIONS[i % DESCRIPTIONS.length],
        Status: scene.status,
        PercentComplete: completed ? 1 : 0,
        AssignedTo: scene.assignee,
        AssignedToId: assigneeId,
        // Кто взял задачу: Editor (до взятия — автор, исполнителем не считается).
        EditorTitle: scene.taker || "Автор задачи",
        EditorId: takerId,
        DueDate: isoInDays(scene.dueIn),
        // Дата создания растёт вместе с порядком сценария: таблица по умолчанию
        // отсортирована «от самых старых к самым новым» (Created asc), поэтому
        // сценарии остаются в задуманном порядке — все случаи видны на первом
        // экране. Заодно это время решения для завершённых («Решено за …»).
        Created: isoInDays(n - 40),
        Modified: isoInDays(scene.dueIn - 1),
      });
    });
  }
  return rows;
}

export default function TableScene() {
  const rows = useMemo(buildRows, []);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("table"); // переключатель — только для предпросмотра

  const selectedRow = rows.find((r) => r.compositeId === selected) || null;

  return (
    <Box sx={{ p: 2, height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
          Таблица задач — предпросмотр (мок-данные)
        </Typography>
        {/* Тот же переключатель, что в #tasks: на узком экране (<900 px) он скрыт. */}
        <ViewModeToggle value={mode} onChange={setMode} />
      </Box>
      <Typography variant="body2" color="text.secondary">
        Заливка строк — по статусу задачи: <b>без заливки</b> «Не начата»,
        <b> оранжевая</b> «В процессе выполнения», <b>зелёная</b> «Завершена»,
        <b> красная</b> просроченная и не закрытая. «Срок» показан как в карточке —
        «Осталось …» / «Просрочено … назад» (точная дата — в подсказке).
        Кнопка «Я исполнитель» оставляет только задачи, которые у меня в работе
        или завершены мной: «Поршаков Сергей» (Id 207 на main, 42 на сайте ДОБ).
        Клик по строке — выделение и меню действий в точке клика, двойной клик — форма.
      </Typography>

      <Paper variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary">
          {selectedRow
            ? `Выделена задача #${selectedRow.Id} — действия открываются в точке клика`
            : "Кликните строку — действия по задаче появятся в точке клика"}
        </Typography>
        {message && (
          <Typography variant="caption" color="primary">
            {message}
          </Typography>
        )}
      </Paper>

      {/* Контейнер как в TasksView: скролл — внутри грида (overflow: hidden) */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <TasksGrid
          rows={rows}
          currentUserIds={CURRENT_USER_IDS}
          // ФИО нужно фильтру «Я исполнитель»: Editor в строках часто приходит
          // только строкой, без Id.
          currentUserTitle={CURRENT_USER_TITLE}
          onSelectRow={setSelected}
          onRowOpen={(compositeId) => {
            const row = rows.find((r) => r.compositeId === compositeId);
            setMessage(`Открытие формы задачи #${row?.Id}`);
          }}
          // Набор действий — тем же сборщиком, что и в приложении (rowActions.js):
          // для «в работе» это кнопки результатов по типу контента задачи.
          getRowActions={(row) => buildRowActions(row, {
            canTake: isNotStartedStatus(row.Status),
            choices: isInProgressStatus(row.Status)
              ? (row.sourceId === "main" ? CHOICES_BY_CT.main : [])
              : [],
            resolveStyling: (choice) => STYLE_BY_CHOICE[choice] || null,
            resolveIcon: (choice) => renderStylingIcon(ICON_BY_CHOICE[choice] || null, createElement),
            onTake: () => setMessage(`Взять в работу задачу #${row.Id} (в приложении — MERGE статуса: main-список или сайт источника)`),
            onResult: (choice) => setMessage(`Результат «${choice}» по задаче #${row.Id} (в приложении — тот же поток, что в карточке)`),
            onEdit: () => setMessage(`Изменить задачу #${row.Id} (в приложении — форма задачи: #tasks/<Id> или форма источника)`),
          })}
          takingId={null}
        />
      </Box>
    </Box>
  );
}
