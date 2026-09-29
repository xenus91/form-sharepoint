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

## Диагностика завершённых задач

Включить: **`?dbg=1`** в адресе (или `localStorage.dbg = "1"` / `localStorage.dbg_tasks = "1"`).
Ошибки и предупреждения пишутся в консоль **всегда**, без флага.

| Метка | Когда | Что показывает |
|---|---|---|
| `[completedTasks] request` | перед запросом (при `?dbg=1`) | URL, `Paging`, полный `ViewXml` |
| `[completedTasks] response` | ответ получен (при `?dbg=1`) | `RowCount`, число строк, `NextHref` |
| `[completedTasks:page:result]` | страница разобрана (`?dbg=1`) | сколько строк, сколько задач, сколько отсеяно, Id |
| `[completedTasks:page:filtered]` | **всегда** (warn) | строки «в работе», отсеянные клиентом: `{ Id, Status, PercentComplete }` |
| `[completedTasks:badField]` | **всегда** (warn) | «поле X отсутствует в списке — убираю из ViewXml» |
| `[completedTasks:failed]` | **всегда** (error) | URL, HTTP-статус, текст SharePoint, имя «плохого» поля, ViewXml, сырой ответ |
| `[completedTasks:count:request]` / `count:result` | счётчик (`?dbg=1`) | REST-URL с фильтром и посчитанное число |
| `[completedTasks:count:failed]` | **всегда** (error) | почему REST-счётчик не сработал |
| `[useCompletedTasks] loadNext failed` | **всегда** (error) | статус и краткий текст для UI |

В интерфейсе при ошибке показывается **реальная причина от SharePoint**
(например, `HTTP 400 · Column 'Location1' does not exist…`) вместо общей фразы про поля.

Живая проверка логов на стенде:

```bash
npx vite build --config preview/vite.config.js --ssr log-check.mjs --outDir .ssrout --logLevel error
TAG="completedTasks" node preview/.ssrout/log-check.mjs
```

## Устойчивость к «битым» полям списка

Реальные списки SharePoint иногда содержат поля с неправильным типом. Тогда:

* `RenderListDataAsStream` → **500 «Один или несколько типов полей установлены неправильно…»**
  (имя поля сервер **не называет**);
* REST-фильтр с `substringof('…',Status)` по Choice-полю → **400 «Value does not fall within the expected range»**.

Оба случая обрабатываются автоматически.

### 1. Поиск рабочего набора полей (ViewFields)

`fetchCompletedTasksPage()` при ошибке без имени поля:

1. пробует базовый набор `CORE_FIELDS = ID, Title, Status, PercentComplete, Modified, AssignedTo, ContentTypeId`;
2. добавляет остальные поля половинками (деление пополам), отбрасывая те, на которых запрос падает;
3. найденный набор запоминается в памяти и в `localStorage.completedTasks.usableFields.<listGuid>`
   — повторных переборов не будет.

Если сервер **называет** поле (`Column 'X' does not exist`) — поле просто убирается из `ViewXml`,
запрос повторяется (до 5 раз).

### 2. Счётчик

Порядок источников:

1. `RenderListDataAsStream` с **минимальным** `ViewFields` (только `ID`) → `RowCount`.
   Минимум полей — чтобы «битое» поле не ломало подсчёт.
2. REST `$top=1&$inlinecount=allpages` — фильтры перебираются по очереди:
   * `PercentComplete eq 1 or Status eq 'Завершена' or …` (точное сравнение, **без** `substringof`);
   * `PercentComplete eq 1`;
   * только статусы.

### 3. REST-фолбэк самой вкладки

Если CAML не сработал совсем, страница завершённых грузится обычным REST
(`$filter` по тем же eq-фильтрам, `$orderby=Modified desc`, пейджинг через `$skiptoken`).
В логе это видно как `[completedTasks] page:rest:request` / `page:rest:result`, `source: "REST"`.

### Как посмотреть

```bash
npx vite build --config preview/vite.config.js --ssr completed-check.mjs --outDir .ssrout --logLevel error
node preview/.ssrout/completed-check.mjs
```

Мок (`preview/mockApi.js`) эмулирует оба прод-сбоя: 500 при `RelatedItems` в `ViewFields`
и 400 на `substringof` — проверка должна показать самовосстановление и загрузку завершённых.

## CAML: одно условие — `Status = Завершена`

`RenderListDataAsStream` на части списков падает:

```text
HTTP 500 · Один или несколько типов полей установлены неправильно.
Перейдите на страницу параметров списка и удалите эти поля.
```

Причина — конструкции `<Contains>` и `<Not><Contains>` по полю `Status` (тип Choice),
а также лишние условия. Поэтому фильтр максимально простой — **одно условие**:

```xml
<Where>
  <And>
    <Eq><FieldRef Name="AssignedTo" LookupId="TRUE" /><Value Type="Integer">10</Value></Eq>
    <Eq><FieldRef Name="Status" /><Value Type="Text">Завершена</Value></Eq>
  </And>
</Where>
```

Никакого `PercentComplete`, никаких `<Or>`, `<Contains>`, `<Not>`.
Точное сравнение заодно решает старую проблему: «В процессе выполнения» и «Выполняется»
больше не попадают в завершённые (раньше матчились по подстроке «Выполн»).

REST-фильтр — такой же:

```text
$filter=(AssignedToId eq 10) and Status eq 'Завершена'
```

### Свой статус (без пересборки)

```js
localStorage.setItem("completedTasks.statuses", JSON.stringify(["Завершена"]));
```

Можно несколько — тогда условия объединятся через `or` (в CAML — через `<Or>`).
Если ключ задан, используются **только** перечисленные значения.
