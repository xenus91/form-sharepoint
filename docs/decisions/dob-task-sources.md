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

**4. Колонки таблицы.** «Кому назначено» = `AssignedTo`, «Исполнитель» = `Editor`
(кто взял в работу) с фолбэком на `AssignedTo`. `mapRawTask` теперь читает lookup-поля
и в verbose-формате `{ results: [{ Id, Title }] }` — без этого у задач dob обе колонки
были пустыми («поле исполнитель не заполнено»). Колонка «Источник» — только в debug
(`?dbg=1`).

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