# ADR: Multi-source задачи ООБ + доступ по Department

**Статус:** Accepted
**Дата:** 2026-10-03
**Связанный план:** `artifacts/plan.md`
**Связанный код:** `src/tasks/{sources,sourceClient,identity,multiSource}.js`, `src/features/nav/{viewMode,routeAccess,useDepartment}.js`, `src/features/tasks/hooks/{useTasksSources,useTasksTableData}.js`, `src/features/tasks/components/{TasksGrid,ViewModeToggle}.jsx`, `src/tasks/mutations/updateTaskResult.js`

---

## Контекст

Сотрудники с `Department = "Отдел обеспечения бизнеса"` (ООБ) работают с задачами из двух списков на двух семействах сайтов:

| Источник | Сайт | Список | GUID | Назначение |
|---|---|---|---|---|
| `main` | `/sites/obrazceo` | `"Tasks"` | `463B634E-A71A-4FEF-9A1F-B803431D8639` | Задачи ООБ на основном сайте |
| `dob` | `/sites/dob/doblogistic` | `"RequestsTask"` | **неизвестен на момент ADR** (TODO Этап 0) | Задачи ООБ на сайте ДОБ |
| — | `/sites/dob/doblogistic` | `"Requests"` | `21B5B544-BD98-4B06-891F-C5A137331394` | Заявки ДОБ (связанные через `RelatedItems`) |

Раньше ООБ мог смотреть **только** задачи основного сайта (cards mode в `#tasks`). Заявки ДОБ существовали отдельно в `#dob_tasks` (таблица, без карточек).

**См. также фикс**: до этого ADR в `DOB_LIST_GUID` стояло устаревшее `64DB263C-...`, что, вероятно, давало ошибки доступа к `Requests`. Заменено на корректное `21B5B544-...`.

---

## Решения

### R1. Один роут `#tasks` с переключателем cards ↔ table

Все сотрудники работают в `#tasks`. Внутри — переключатель `cards | table` (виден всем, не зависит от подразделения).

**Альтернатива, которую отвергли:** отдельные роуты `#tasks-cards` и `#tasks-table`. Причина: URL деградация, дублирование логики, роутер-сложность.

### R2. Гейт по Department управляет **только составом источников**, не UI

`useDepartment(userProfile)` → `{isOOB}`. В `useTasksSources`:
- ООБ → `sources = [main, dob]`
- Не-ООБ → `sources = [main]`

**Нет** `DepartmentGate.jsx`, **нет** `AccessDenied.jsx`, **нет** 403 на `#tasks`. Переключатель cards ↔ table доступен **всем**.

**Альтернатива, которую отвергли:** блокировать `#tasks` для не-ООБ. Причина: пользователи привыкли к роуту, нет причин прятать фичу.

### R3. Составной Id `${sourceId}:${Id}`

`Id` в двух списках **пересекаются** (нумерация per-list, начинается с 1). Без префикса источника строки бы склеились.

**Альтернатива, которую отвергли:** хранить sourceId как отдельное поле, Id — без префикса. Причина: ключи кэша React Query, ключи строк AG Grid, ключи записи — везде нужна однозначная идентификация; compositeId унифицирует.

### R4. Резолв identity по эвристике email/claim-префикса

Поле `Email` в DcEmail — множественный выбор (`AllowMultiple=true`). Содержит **и пользователей, и группы**.

Эвристика `classifyPrincipal({email, loginName, title})`:
1. SMTP-email (содержит `@`) → `user`
2. claim-префикс в `loginName` (`i:0#.f|membership|`, `i:0#.w|`) → `user`
3. `loginName` содержит `@` или `\` → `user`
4. иначе → `group`
5. иначе → `unknown`

**Митигация для mail-enabled групп:** лог таблицы резолва + ручной override через дополнительные паттерны (TODO Этап 0).

### R5. FALLBACK `ensureuser` через `POST /web/siteusers/ensureuser`

Если `getbyemail('<email>')` вернул 404 (сотрудник ещё не заходил на сайт-источник), резолвим через `ensureuser` с `loginName` (нужен digest — добавляется автоматически `dobAxios` интерцептором).

**Не сработает**, если у текущего пользователя нет прав на создание siteusers. Тогда запись пропускается, источник в `errors[]`.

### R6. Fail-soft при сбое UPS

UPS может быть недоступен (5xx, таймаут, пустой Department). Поведение:
- 1 авто-ретрай через 2с
- На 2-й неудаче → `isOOB=false` (тихий fallback)
- Маленький неблокирующий Alert: «Данные подразделения недоступны — мульти-источник отключён»

`#tasks` **никогда** не блокируется целиком — пользователь видит свои задачи (cards или single-source table).

### R7. Параллельная загрузка источников

`fetchTasksMultiSource` использует `Promise.allSettled`:
- `resolveSourceIdentity` параллельно по всем источникам
- `fetchTasksForSource` параллельно по всем источникам
- Частичная деградация: если упал один — другой показан + `errors[]`
- Если упали все → `MultiSourceError` (UI показывает full-screen error)

### R8. Override источников через localStorage

`localStorage["tasks.sources"]` (JSON) мержится поверх `DEFAULT_TASK_SOURCES`. Пример:
```json
{ "dob": { "enabled": true } }
```

`localStorage["department.override"]` ∈ `{"oob","off"}` для экстренного принудительного включения/отключения multi-source (отладка).

---

## Lesson learned (регрессия 2026-10-03)

**Симптом:** при загрузке `#tasks` все запросы уходили на `/api/api/web/lists(...)` → 404.

**Причина:** `sourceClient.js` для main-источника выставил `apiBase: "/api"`. Но `apiClient` (axios) уже имеет `baseURL: "/api"` сам по себе. `fetchTasksForSource` префиксовал URL ещё раз → задвоение `/api/api/`.

**Асимметрия:**
- `apiClient` — **имеет** `baseURL: "/api"`. URL НЕ надо префиксовать.
- `dobAxios` — **НЕ имеет** `baseURL`. URL надо префиксовать через `client.apiBase = dobApiBase()`.

**Фикс:** в `sourceClient.js` для `clientKind === "main"` теперь `apiBase: ""`. Условие `client.apiBase && ...` в `fetchTasksForSource` не срабатывает → URL передаётся в `apiClient.get()` as-is → axios сам добавляет `/api`.

**Правило для будущих источников:**
1. Если axios-инстанс **имеет** `baseURL` → `client.apiBase = ""`.
2. Если axios-инстанс **НЕ имеет** `baseURL` → `client.apiBase = sourceBaseUrl()`.
3. Перед передачей URL в `client.get` — проверять `client.apiBase` и только если truthy — префиксовать.

**См. также:** в этой же сессии был сделан ложный шаг по расширению `$select` для DcEmail (`Email/Title, Email/LoginName, Email/EMail` через `$expand=Email`) — SharePoint REST 400. Откатил на `$select=Id,OffDepKey,Email/Id`. Расширенные поля (Title/LoginName/EMail) можно добавить отдельным lazy-запросом, если понадобятся для OOB-пути.

---

## UI-решения (итерация 2026-10-03, вечер)

**1. Карточка задачи внешнего источника выглядит как обычная карточка.**
`ExternalTaskCard` больше не показывает бейдж сайта-источника и подпись «Задача другого
сайта…» — пользователь не должен видеть, что задача пришла из другого списка/сайта.
Стиль повторяет `TaskCard` (Paper 28px, цветовая полоса статуса слева, заголовок,
описание, кнопка действия, футер «Исполнитель: … • Статус: …» и «#Id»).

**2. Клик по строке таблицы ≠ переход.** Клик только **выделяет** задачу (как в
`#dob_tasks`). Переход в форму — кнопкой **«Изменить»** в тулбаре (активна при
выделенной строке) или **двойным кликом** по строке.

**3. Форма задачи внешнего источника = форма `dob_tasks/[id]`, но по списку задачи.**
`DobTaskEditView`/`dobApi` параметризованы `listGuid` (дефолт — список заявок
`21B5B544…`). Для задачи dob открывается маршрут:

```
#dob_tasks/<ItemId>?list=<listGuid источника>   // напр. 03fc1b92-… (RequestsTask ООБ)
```

`App.parseHash` читает `list=` и передаёт `listGuid` + `onBackHash="#tasks"` в форму
(заголовок «Задача #N», кнопка «К задачам»); без `list=` поведение раздела «Заявки ДОБ»
не меняется. `dobApi` защищён от вызова `queryFn`-контекстом (`normalizeListGuid`).

**4. Колонки таблицы.** «Кому назначено» = **всегда** `AssignedTo`;
«Исполнитель» = **всегда** тот, кто **взял задачу в работу**. Тонкость SharePoint:
`Editor` проставляется при СОЗДАНИИ и любом изменении, поэтому до взятия показывать
его нельзя — за это отвечает `features/tasks/lib/resolveTaker.js`:
в работе → `Editor`, завершена → `Editor` (кто выполнил), не начата → пусто.
`mapRawTask` читает lookup-поля и в verbose-формате `{ results: [{ Id, Title }] }` —
без этого у задач dob обе колонки были пустыми. Колонка «Источник» — только в debug.

**5. Взятие в работу для задач внешних источников** (`tasks/mutations/takeTaskInWork.js`):
1) свежий GET элемента (защита от повторного взятия/завершения по `Status`/`PercentComplete`);
2) выбор целевого статуса: `targetStatus` → `source.inProgressStatus`
   (`localStorage["tasks.sources"] = { "dob": { "inProgressStatus": "В работе" } }`)
   → первый подходящий choice поля `Status` списка (маркеры «в работе», «в процессе»,
   «выполняется»; «Не начата» и завершённые исключены);
3) `MERGE { Status }` через per-source клиент — SharePoint сам ставит `Editor`,
   это и есть «Исполнитель».
Кнопка «Взять в работу» — на карточке внешней задачи и в тулбаре таблицы (для выделенной
строки). Кнопка «Изменить» на карточке стала вторичной (outlined).

---

## Роут `#tasks/<id>` (фикс 2026-10-03)

**Симптом:** `#tasks/<n>` всегда отвечал «Связанная задача для элемента #n не найдена
(RelatedItems.ItemId)» — в т.ч. при клике по строке таблицы (main-задача → `#tasks/<TaskId>`).

**Причина:** роут исторически трактовал `<n>` только как Id элемента ProblemsPallet
(`#tasks/id=10` в подсказке TaskElementDialog) и искал задачу по `RelatedItems.ItemId`.
Id задачи и Id элемента — разные сущности, отсюда ложное «не найдена».

**Решение** (`src/tasks/hashRoute.js`, `resolveHashTarget`):
1. `kind="auto"` (путь `#tasks/<n>`): задача с `Id = n` в загруженном списке → карточка задачи;
2. иначе догрузка задачи по Id с сервера (`fetchFullTask`) → карточка задачи;
3. иначе — прежний элементный путь (ProblemsPallet → `RelatedItems.ItemId` → CAML-поиск).
Явные ссылки `#tasks/id=n`, `#tasks?elementid=n` и THU (17–18 цифр) сразу идут
элементным путём — обратная совместимость. Режим (`matchMode`: `task`/`element`)
влияет только на заголовки/подсказки в `TasksHashContent` и `TaskElementDialog`.

---

## Шапка таблицы: закрепление, фильтры, сортировка (фикс 2026-10-03)

**Симптом:** шапка AG Grid уезжала вместе со скроллом страницы, фильтровать и
сортировать строки было нельзя.

**Решение:**
1. `domLayout="autoHeight"` → `domLayout: "normal"`. Таблица больше не растёт по
   содержимому: у грида `height: 100%`, `minHeight: 320`, а внешний контейнер в
   `TasksView` перестал скроллить (`overflow: "hidden"` + flex-колонка) — скролл
   теперь внутри грида, поэтому шапка и строка фильтров закреплены.
2. `TASK_GRID_DEFAULT_COL_DEF` (`features/tasks/lib/taskTableColumns.js`) —
   единые настройки всех колонок: `sortable`, `filter`, `floatingFilter`
   (строка ввода под каждой колонкой), `resizable`, `suppressMovable`.
   Типы фильтров: `Id` → `agNumberColumnFilter`, `Срок`/`Изменён` →
   `agDateColumnFilter`, остальные → `agTextColumnFilter`.
3. `filterParams: { debounceMs: 300 }` — **без** кнопок `apply/reset`. Это важно:
   при `buttons: ["apply", "reset"]` AG Grid (`applyActive`) применяет фильтр из
   floating-строки только по Enter, с дебаунсом — только по мере ввода.
4. Сортировка — по клику на заголовок; AG Grid вешает обработчик на
   `.ag-header-cell-label` (не на всю ячейку) — учитывается в тестах.

**Тесты:** `TasksGrid.columns.test.js` (типы фильтров + сортируемость),
`TasksView.multisource.test.jsx` (`.ag-layout-normal` вместо `ag-layout-auto-height`,
≥8 floating-фильтров, ввод «Основная» → одна строка, клик по заголовку меняет
`aria-sort` и порядок строк). Тонкость jsdom: строки позиционируются абсолютно,
поэтому визуальный порядок читается по атрибуту `row-index`, а не по порядку в DOM.

---

## Таблица задач: поиск над таблицей вместо фильтров под заголовками (2026-10-03)

**Было:** строка фильтров (floating filter) под каждой колонкой — пользователь попросил убрать.
**Стало:**
- `TASK_GRID_DEFAULT_COL_DEF.floatingFilter = false`; фильтрация осталась в меню фильтра
  (иконка в заголовке, `agTextColumnFilter` / `agNumberColumnFilter` / `agDateColumnFilter`);
- один общий поиск **над таблицей** (`TextField` + `AgGridReact quickFilterText`) — ищет
  по всем колонкам сразу; рядом счётчик «Найдено: N из M» (`onModelUpdated`);
- ширины: «Заголовок» — узкий (170 px, без flex), «Описание задачи» — самая широкая
  (`flex: 1`, `minWidth: 360`), т.е. забирает всё свободное место.

## Кнопки действий — на строке таблицы (2026-10-03)

Требование: «Взять в работу» и «Изменить» показывать **на самой строке при клике**,
а не в тулбаре над таблицей.

Реализация (`TasksGrid` → `RowActionsCell`, колонка `rowActions`):
- колонка действий закреплена справа (`pinned: "right"`), вне сортировки, фильтров
  и быстрого поиска; ширина 232 px;
- кнопки рисуются только у выделенной строки: выделение ячейка спрашивает у самой
  строки (`params.node.isSelected()`);
- после смены выделения/начала взятия в работу грид вызывает
  `api.refreshCells({ force: true })` — ячейка перерисовывается, кнопки
  появляются/исчезают;
- колбэки (`onEditRow`, `onTakeRow`, `canTakeRow`) и `takingId` передаются через
  `context` грида, а **не** через `cellRendererParams`: AG Grid deep-merge'ит
  `cellRendererParams` (`UserComponentFactory.mergeParams` → `_mergeDeep`) и тем
  самым копирует объект, поэтому мутации в нём до ячейки не доходили;
- «Взять в работу» доступно для незавершённых задач, при этом main-задачи — только
  из статуса «Не начата» (как карточка), внешние (dob) — из любого незавершённого
  (взятие всё равно перепроверяет свежий статус в источнике). Обработчик один:
  `handleTakeTableRow` → `handleTakeInWork` для main и `handleTakeExternalTask`
  (MERGE на сайте-владельце) для dob; «Изменить» — для любой строки;
- клик по кнопкам не «доходит» до строки (`stopPropagation` в `onMouseDown`/`onClick`),
  двойной клик по ячейке действий не открывает форму (`target.closest('.tasks-row-actions')`);
- подсказка в тулбаре осталась: что выбрано / «Кликните строку — появятся кнопки…».

## Форма задачи ДОБ: кнопка «Просмотреть связанную заявку» (2026-10-03)

Задача из списка «RequestsTask» (03fc1b92-…) связана с заявкой списка заявок ДОБ
(`RelatedItems` → `{ ListId, ItemId }`). Раньше, чтобы посмотреть заявку, нужно было
уйти в раздел «Заявки ДОБ»; теперь в шапке формы `#dob_tasks/<id>?list=03fc1b92-…`
есть акцентная кнопка **«Просмотреть связанную заявку»** (янтарная, всегда видна —
шапка sticky; на узких экранах — короткий текст «Связанная заявка»).

По нажатию открывается **read-only диалог** (`components/RelatedItemDialog.jsx`):
- `getDobItemForView(itemId, listId)` тянет элемент вместе с `$expand=ContentType`
  (если тенант не умеет — тихий фолбэк на `getDobItem`);
- поля берутся из метаданных списка связанного элемента (т.е. соответствуют его типу
  контента), скрытые и системные отбрасываются, по умолчанию показываются только
  заполненные (переключатель «Показать пустые поля»);
- типы рендерятся как read-only: текст, HTML-Note (очищенный `sanitizeHtmlForView`),
  ссылки, даты, user/lookup (Title), boolean (Да/Нет), числа;
- по просьбе пользователя (2026-10-03) в диалоге **нет** чипов («Только просмотр»,
  «Тип контента: …», заголовок заявки, «Заполнено полей: N»), поясняющего Alert и
  кнопки «Открыть форму заявки» — только заголовок «Связанная заявка #N», поля,
  переключатель пустых полей, строка «Создано/Изменено» и кнопка «Закрыть».

Общие помощники полей вынесены в `features/dob/lib/dobFormFields.js`
(`isHiddenFormField`, `getODataValue`, `hasFieldValue`, `buildViewFields`,
`formatFieldValue`, `sanitizeHtmlForView`) — их использует и форма, и диалог;
резолв связи — `features/dob/lib/relatedItem.js` (`resolveRelatedRef`), с фолбэком
на lookup-поле, ссылающееся на список заявок.

---

## Структура файлов

```
src/tasks/
  sources.js          ← конфиг (DEFAULT_TASK_SOURCES, getTaskSources, getSourceById)
  sourceClient.js     ← makeSourceClient(source) → {apiBase, listApi, get, post, merge}
  identity.js         ← resolveSourceUser, resolvePrincipalOnSource, resolveSourceIdentity
  multiSource.js      ← compositeId, parseCompositeId, mergeSort, fetchTasksMultiSource
  useTasksForSources.js  ← React Query хук (multi-source)
  mutations/updateTaskResult.js  ← per-source MERGE
src/features/nav/
  viewMode.js         ← useViewMode (cards/table, localStorage)
  routeAccess.js      ← matchDepartment, resolveRouteAccess (pure)
  useDepartment.js    ← {department, isOOB, status}, fail-soft
src/features/tasks/
  hooks/useTasksSources.js    ← селектор [main, dob] vs [main]
  hooks/useTasksTableData.js  ← хук для табличного режима
  components/TasksGrid.jsx    ← read-only AG Grid Community
  components/ViewModeToggle.jsx ← ToggleButtonGroup
```

---

## Открытые вопросы / TODO Этапа 0

| Что | Кто закрывает |
|---|---|
| GUID списка `"RequestsTask"` на `/sites/dob/doblogistic` | Заказчик (SharePoint) — без этого `sources.dob.enabled = false` |
| Имя ContentType + поле результата на `"RequestsTask"` | Этап 0; `resolveUsableFields` уже параметризован, отсутствующие поля → пустые ячейки |
| Права ООБ на `"RequestsTask"` (чтение + запись) | Отдельная задача SharePoint |
| Mail-enabled группы в DcEmail (классифицируются как user) | Эвристика + лог; при необходимости — расширение через `OOB_DEPARTMENT_PATTERNS` или override |