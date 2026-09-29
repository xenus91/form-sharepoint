# Завершённые задачи: ленивая загрузка и пагинация

Завершённых задач со временем становится много, поэтому они живут отдельно от активных.

## Модель

| Что | Откуда | Когда |
|-----|--------|-------|
| Активные задачи | REST `fetchTasks` (`buildTaskListQuery`) | сразу, как раньше |
| Количество завершённых | `RenderListDataAsStream` → `RowCount` (фолбэк — REST `$inlinecount=allpages`) | сразу при открытии экрана задач |
| Карточки завершённых | `RenderListDataAsStream` порциями по 20 | при переходе на вкладку «Завершённые», дальше — кнопка «Показать ещё» |

Активные и завершённые больше не пересекаются:

- в основной запрос добавлен серверный фильтр `and (PercentComplete eq null or PercentComplete ne 1)`;
- признак завершённости в CAML зеркалит `isCompletedStatus()` из `src/tasks/status.js`:
  `PercentComplete = 1` ИЛИ `Status` содержит «Заверш» ИЛИ «Выполн».

## Файлы

| Файл | Назначение |
|------|------------|
| `src/tasks/completedTasks.js` | CAML/ViewXml, `fetchCompletedCount()`, `fetchCompletedTasksPage()`, маппинг строки → сырой REST-элемент → `toDomainTask` |
| `src/features/tasks/hooks/useCompletedTasks.js` | счётчик (React Query) + состояние страниц, `loadNext()`, `refresh()` |
| `src/TasksView.jsx` | вкладка «Завершённые» берёт данные из хука, кнопка «Показать ещё», счётчик во вкладках |
| `src/tasks/listQuery.js` | опция `excludeCompleted` — серверный фильтр основного запроса |

## Пагинация

```text
POST /_api/web/lists(guid'…')/RenderListDataAsStream
{
  "parameters": {
    "__metadata": { "type": "SP.RenderListDataParameters" },
    "ViewXml": "<View …><RowLimit Paged=\"TRUE\">20</RowLimit></View>",
    "DatesInUtc": true,
    "Paging": "Paged=TRUE&p_ID=120&PageFirstRow=21"   // только для 2+ страницы
  }
}
```

- `RowLimit Paged="TRUE"` заставляет SharePoint вернуть `NextHref`;
- `NextHref` (без ведущего `?`) передаётся как `parameters.Paging` в следующий запрос;
- сортировка — `Modified desc`;
- если поле из `ViewFields` отсутствует в списке, оно вычищается из ViewXml и запрос повторяется (до 5 попыток).

## Счётчик

1. `RenderListDataAsStream` с `RowLimit 1` → `RowCount`.
2. Если сервер не отдал `RowCount` — REST:
   `/items?$select=Id&$filter=(AssignedToId eq …) and (PercentComplete eq 1 or substringof('Заверш',Status) or substringof('Выполн',Status))&$top=1&$inlinecount=allpages`.

Счётчик считается **за всё время** (без ограничения по дате).

## Обновление

После завершения задачи вызывается `loadTasks()`, который инвалидирует основной запрос и
вызывает `completed.refresh()` — счётчик пересчитывается, загруженные страницы обновляются.

## Признак «завершена» (важно)

Одно правило на всё приложение — `isCompletedStatus()` в `src/tasks/status.js`:

```text
PercentComplete = 1  →  завершена
Status содержит «Заверш» / «Completed» → завершена
Status содержит «Выполнено» / «Выполнена» / «Выполнены» → завершена
Status содержит «В процессе» / «Выполня» / «Не начат» → НЕ завершена (проверяется первой)
```

⚠️ Нельзя определять завершённость по подстроке **«Выполн»**: статус SharePoint
**«В процессе выполнения»** (и «Выполняется») тоже её содержит — из-за этого активные задачи
попадали в вкладку «Завершённые» и в счётчик.

То же правило зеркалится в двух фильтрах:

| Место | Реализация |
|---|---|
| CAML (RenderListDataAsStream) | `COMPLETED_CAML` + `NOT_ACTIVE_CAML` в `src/tasks/completedTasks.js` — ищем «Выполнено/Выполнена» и добавляем `<Not><Contains>` для статусов «в работе» |
| REST (счётчик, фолбэк) | `buildCompletedRestFilter()` — `substringof('Заверш',Status) … and not substringof('В процессе',Status) …` |

Плюс страховка: загруженные строки дополнительно фильтруются `isCompletedStatus()` на клиенте.

**Счётчик:** основной источник — REST `$top=1&$inlinecount=allpages` (`d.__count`),
фолбэк — `RowCount` из RenderListDataAsStream.
