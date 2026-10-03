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
import { buildRowActions } from "../src/features/tasks/lib/rowActions";
import { renderStylingIcon } from "../src/services/stylingIcons";

const TITLES = [
  "Заявка ООБ",
  "Основная задача ООБ",
  "Заявка ООБ (на группу)",
  "Проверить паллету на складе",
  "Просмотр видеоархива",
  "Согласовать выдачу ТМЦ",
  "Инвентаризация зоны комплектации",
  "Проверить целостность упаковки",
];

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

const STATUSES = ["Не начата", "В работе", "Завершена", "Отменена"];
const ASSIGNEES = ["Поршаков Сергей", "Иванов Пётр", "Смирнова Анна", "Группа ООБ"];
const TAKERS = ["Поршаков Сергей", "Иванов Пётр"];

function buildRows() {
  return Array.from({ length: 30 }, (_, i) => {
    const status = STATUSES[i % STATUSES.length];
    const isDob = i % 3 === 0;
    const sourceId = isDob ? "dob" : "main";
    const taken = status === "В работе" || status === "Завершена";
    const day = String(((i * 3) % 28) + 1).padStart(2, "0");
    return {
      compositeId: `${sourceId}:${i + 1}`,
      sourceId,
      sourceLabel: isDob ? "DOB Logistic" : "Main",
      Id: i + 1,
      Title: `${TITLES[i % TITLES.length]}${i >= TITLES.length ? ` №${i + 1}` : ""}`,
      Body: DESCRIPTIONS[i % DESCRIPTIONS.length],
      Status: status,
      PercentComplete: status === "Завершена" ? 1 : 0,
      AssignedTo: ASSIGNEES[i % ASSIGNEES.length],
      EditorTitle: taken ? TAKERS[i % TAKERS.length] : "Автор задачи",
      DueDate: `2026-10-${day}T12:00:00Z`,
      Modified: `2026-09-${day}T09:30:00Z`,
    };
  });
}

export default function TableScene() {
  const rows = useMemo(buildRows, []);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  const selectedRow = rows.find((r) => r.compositeId === selected) || null;

  return (
    <Box sx={{ p: 2, height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Таблица задач — предпросмотр (мок-данные)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Шапка закреплена: прокрутите список — заголовки останутся на месте.
        Поиск над таблицей ищет по всем полям сразу, клик по заголовку — сортировка.
        Клик по строке — выделение, а в ТОЧКЕ КЛИКА открывается меню действий по задаче:
        «Взять в работу», результаты (как кнопки в карточке) и «Изменить»;
        двойной клик по строке — тоже «изменить».
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
          onSelectRow={setSelected}
          onRowOpen={(compositeId) => {
            const row = rows.find((r) => r.compositeId === compositeId);
            setMessage(`Открытие формы задачи #${row?.Id}`);
          }}
          // Набор действий — тем же сборщиком, что и в приложении (rowActions.js):
          // для «в работе» это кнопки результатов по типу контента задачи.
          getRowActions={(row) => buildRowActions(row, {
            canTake: row.Status === "Не начата",
            choices: row.Status === "В работе"
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
