// preview/TableScene.jsx — сцена предпросмотра табличного режима #tasks на мок-данных.
//
// Зачем: проверить «на глаз» закреплённую шапку AG Grid (заголовки + строка
// floating-фильтров), фильтрацию и сортировку — без SharePoint и без авторизации.
// Рендерится той же компонентой, что и в приложении: src/features/tasks/components/TasksGrid.
//
// Запуск: npm run preview:cards -- --open   →   http://localhost:5180/?scene=table

import { useMemo, useState } from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import TasksGrid from "../src/features/tasks/components/TasksGrid";

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
        Шапка закреплена: прокрутите список — заголовки и строка фильтров останутся на месте.
        Клик по заголовку — сортировка, ввод под заголовком — фильтр, клик по строке — выделение,
        двойной клик — «изменить».
      </Typography>

      <Paper variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary">
          {selectedRow
            ? `Выделена задача #${selectedRow.Id} — ${selectedRow.Title}`
            : "Строка не выделена"}
        </Typography>
        <Button
          size="small"
          variant="contained"
          disabled={!selectedRow}
          onClick={() => setMessage(`Открытие формы задачи #${selectedRow?.Id} (в приложении — #dob_tasks/<id>?list=… или карточка задачи)`)}
        >
          Изменить
        </Button>
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
        />
      </Box>
    </Box>
  );
}
