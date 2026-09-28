# Architecture Current — form-sharepoint (audit Phase 0)

> Дата аудита: 2026-09-21 (ветка `arena/01a08e7b-form-sharepoint`, HEAD `07fa741`)
> Stack: React 18 / Vite 5 / JavaScript / MUI / TanStack Query 5 / axios / SharePoint 2013 REST (verbose) / SPD 2013 Workflow
> System of record: SharePoint 2013, список `Tasks` GUID `463B634E-A71A-4FEF-9A1F-B803431D8639`, корневой объект `ProblemsPallet` (связанный список pallet-проблем, Title=`8117_…`, поля `Recipient/Title`, `Recipient/SCNumberText`, `Title`, `THU`/`DC_THU`)
> Принцип: **Preserve business architecture, improve technical architecture.**

---

## 1. Текущий end-to-end flow

```
ProblemsPallet (ItemId=24785 …)
        │
        │  RelatedItems JSON: [{"ListId":"{guid}","ItemId":24785}]
        ▼
SPD 2013 Workflow (создаёт НОВУЮ Task, НЕ React)
        │
        ├─► Task #1 Type=Поиск ЕО (ContentTypeId 0x0108… , Status=Назначена/В процессе, ResultSearchTHU="")
        │         │ React: GET /items?$filter=AssignedToId eq X & $select=…RelatedItems,ContentTypeId&$expand=AssignedTo …  (poll 5m, stale 5m)
        │         │       └─► enrich: GET /web/lists(guid'ProblemsPallet')/items?$filter=(Id eq 24785) &$select=Recipient/Title… &$expand=Recipient  (батч chunk 30, глобальный кэш 10м + sessionStorage)
        │         │            └─► Recipient/Title → ТК 107, SCNumberText, THU → маппится в Task.Recipient/SCNumber/THU, кэшируется по taskId и по listId:itemId
        │         │       └─► UI: TaskCard группировка отключена, Accordion+Folder,бордер 28px, input+Paper один массив
        │         ▼
        │   Пользователь: Взять в работу → PATCH /items(id) Status=В процессе / проверка блокировки → оверлей "Беру в работу…" → celebration 1600мс
        │         │ search: inline "ЕО найдена/Не найдена" (gradient #ef5350→#c62828 / #2e7d32), без диалогов, блюр ООБ/celebration
        │         ▼
        │   Завершение: handleComplete(task, resultValue, additionalActions):
        │        1) validation (AdditionalActions required ?)
        │        2) GET .../items(id)?$select=Status,ResultSearchTHU… → проверка "уже выполнена другим"
        │        3) MERGE payload { Status:"Завершена", PercentComplete:1, <ResultField>:resultValue, Location1, AdditionalActionsRequired:"Да"/"Нет" (или Boolean fallback), AdditionalActions:{results:[…]} }
        │             — retry при type-mismatch (String vs Boolean) с flip, fallback без AdditionalActions полей при 400
        │        4) invalidate + refetchTasks (TanStack) → SPD Workflow читает завершённую Task → создаёт следующую Task связанную тем же RelatedItems
        ▼
    Task #2 Type=Завершение поиска / ЕО найдена (тот же RelatedItems[0].ItemId, другой ContentTypeId, Result поле другое — резолвится через resultField.js, см. §4)
```

React **НЕ** создаёт Task, не назначает AssignedTo, не определяет OffDepKey, не воспроизводит SPD логику. Всё это — workflow.

Ограничение: на один ProblemsPallet одновременно не более одной незавершённой Task (иначе polling+индекс вернёт первую).

---

## 2. Tasks API

**List identity**

```js
// src/tasks/config.js
TASKS_LIST_GUID = "463B634E-A71A-4FEF-9A1F-B803431D8639"
TASKS_LIST_API  = `/web/lists(guid'${GUID}')` // baseURL уже "/_api" via API_BASE_URL proxy
FULL_TASK_SELECT = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,AdditionalActionsRequired,AdditionalActions,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,RelatedItems,ContentTypeId"
HASH_POLL_SELECT = "Id,Status,PercentComplete,Modified,ResultSearchTHU,Location1,AdditionalActionsRequired,AdditionalActions"
```

- Удалённое поле `EndJob` фильтруется везде (`REMOVED_FIELDS`, stripEndJob в api.js, listQuery, fetchTasks, config) + clean cache/localStorage.
- `Recipient` в Tasks **отсутствует** как поле списка (удалено). На первом рендере `recipientField===null`, `useRecipient=false` → не добавляем `Recipient/Id` в `$select` чтобы избежать 400 "Recipient не существует". Данные `Recipient` берутся **только** через enrich (ProblemsPallet). В api.js есть `stripRecipient` + флаг `sessionStorage sp:recipientMissing` с авто-сбросом через 3с чтобы не блокировать related fetch.

**Построение запроса списка**

`src/tasks/listQuery.js: buildTaskListQuery(opts)`:

- `SELECT_BASE = "Id,Title,Body,AssignedTo/Id,AssignedTo/Title,Status,ResultSearchTHU,Location1,Created,Modified,PercentComplete,DueDate,Editor/Id,Editor/Title,ContentTypeId"` (без DueDate вариант `SELECT_BASE_NO_DUE`)
- `extraFields` динамически: `resultFieldInternalNames[]` (из resultField.js discovery), `OffDepKey`, `RelatedItems` (всегда), `AdditionalActionsRequired/AdditionalActions` (если `useAdditionalActions` и поле есть), `recipientField/Id+Title` только если `useRecipient`.
- Фильтр AssignedTo: `distribution` (DcEmail) → groupIds `Email.Id` → `AssignedTo/Id in [ids]` иначе `OffDepKey` иначе `AssignedToId eq currentUserId`. Фолбэк `AssignedToId`→`AssignedTo/Id` при нераспознанном операторе.
- Параметры: `$select=SELECT_BASE,extra`, `$expand=AssignedTo,Editor[,Recipient]`, `$filter=AssignedToId eq …`, `$orderby=Created asc`, `$top=100`, пагинация через `__next` + `normalizeNextUrl`, safety 20 страниц.

**HTTP клиент** `src/api.js`:

- axios `baseURL=API_BASE_URL` (без `/_api`), headers `Accept: application/json;odata=verbose`, `Content-Type: application/json`
- `getDigest()` → POST `/_api/contextinfo` → `FormDigestValue` TTL `timeoutSec-30`
- Interceptors: `stripEndJob(url|data)`, `stripRecipient(url)` условно, `installCacheInterceptor`, `invalidate(prefix)`, in-flight dedup, retry, digest attach для POST/MERGE.
- `sp/cache.js`: Map `inflight` + `cache` с TTL дефолт 60с, `makeKey(method, stripQuery(url))`, stats hits/miss/dedup/errors, чистка EndJob ключей при старте.

---

## 3. Content Type detection

- Поле в Task: `ContentTypeId` (string `0x01080100…` или объект `{StringValue, StringId}`) + `raw.ContentTypeId` хранится в `mapping.raw`.
- Discovery слой `src/tasks/resultField.js`:

```http
GET /_api/web/lists(guid'…')/fields?$select=InternalName,Title,TypeDisplayName,TypeShortDescription,Choices,Id,StringId,Hidden,ReadOnlyField&$top=200
GET /_api/web/lists(guid'…')/fields?$filter=TypeDisplayName eq 'Результирующий выбор' and TypeShortDescription eq 'Результат задачи'&$select=…&$top=20
GET /_api/web/lists(guid'…')/contenttypes?$select=Id,StringId,Name&$expand=FieldLinks&$top=50
```

- Критерий Result-поля: `TypeDisplayName === "Результирующий выбор"` && `TypeShortDescription === "Результат задачи"` (norm lower). Если 0 найдено → fallback на `InternalName === "ResultSearchTHU"`.
- Кэш 24ч: memory + `localStorage`/`sessionStorage` keys `sp:resultFields:meta`, `sp:resultFields:ctMap` (Map сериализуется как entries). TTL `CACHE_TTL_MS=24h`.
- `fetchContentTypeResultMap()`:
  - если 1 Result-поле → маппит **все** ContentTypes на него + `__default`
  - если N → маппит по `FieldLinks` (сравнение `Id`/`StringId` norm), `__default = fields[0]`
- Resolver `getResultFieldForTask(task, ctMap, resultFields)`:
  1) точное `ctMap.get(ctId)`
  2) префиксный поиск — дочерний CT startsWith родительского, берёт longest prefix
  3) fallback: есть значение в `raw[field.internalName]` → то поле
  4) `curVal = raw.ResultSearchTHU` содержится в `field.choices` → то поле
  5) `resultFields[0]` / `ctMap.__default`

- `getTaskResultValue(task, fieldMeta)` → `raw[internalName] ?? task[internalName] ?? task.ResultSearchTHU`.
- В `TasksView.jsx` mount `useEffect` параллельно загружает `resultFieldsMeta` + `ctMap` (forceRefresh для новых CT), `choices` прокидываются в `TaskCard` как `displayedChoices` (fresh per TaskCard для in-progress). Throttle 5м для повторного discovery на `tasksDataUpdatedAt`.

**Текущий хардкод**: `TASKS_LIST_GUID`, `RESULT_FIELD_TYPE_DISPLAY_NAME="Результирующий выбор"`, `SHORT_DESC="Результат задачи"`, fallback `ResultSearchTHU`.

---

## 4. Result

- Хранится как **Choice** поле списка Tasks, разное для разных CT (примеры из плана: `Task_SearchPallet → ResultSearchPallet`, `Task_CCTV → ResultCCTV`). В текущем репо реально используется `ResultSearchTHU` + обнаруженное динамическое имя.
- `mapping.js` маппит:

```js
dynamicResultVal = r.ResultSearchTHU || ""
if (!dynamic) for(k in r) if(k.includes("result") && typeof r[k]==="string" && k!=="ResultSearchTHU") dynamicResultVal=r[k]
return { ResultSearchTHU: dynamicResultVal, ResultValue: dynamicResultVal, Location1, ... raw }
```

- Выбор в UI:
  - Для `isInProgressStatus && !isCompleted` TaskCard рендерит choices (`displayedChoices` из свежих metadata, иначе `choices` глобальные). При `choices.length===0` показывается "Нет доступных результатов".
  - Completion валидация: `resultValue` обязателен; payload отправляет **два** ключа `{ [resultFieldName]: resultValue, ResultSearchTHU: resultValue }` для backward compat.
  - Legacy `ResultSearchTHU` choices загружаются и как глобальные `choices` в TasksView (поля `fields?$filter=InternalName eq 'ResultSearchTHU'`).
- `TaskResultDefinitions` список (план §14) — primary для UI-поведения Result-значений: `ShowAdditionalActions`, `AdditionalsActionsRequired`, `RequiresConfirm`, `Color`, `Variant`, `Gradient`. Graceful 404 → fallback на hardcoded `resultConfig.js`. Кэш 30м, storage keys v5.
- `TaskPromptFields` список (⭐ PR) — primary для произвольных promptable-полей per `(CType × ResultValue)`. Graceful 404 → fallback на `resultConfig.requiresLocation` (одно поле Location1). Резолвер с приоритетом: exact CT → prefix CT → CT wildcard `ResultValue='*'` → global wildcard → global exact. Не использует substring-match.
- BUG/debug для завершения: `ResultSearchComplete` логируется в `[DBG:mapping] has result keys but THU empty`, fetchTasks логирует `completion-type tasks` где `rawComplete = raw.ResultSearchComplete`.

---

## 5. AdditionalActions

**Смысл**: Дополнительные действия после "ЕО найдена" (multi-choice с fill-in).

**Места использования (124 вхождения, неисчерпывающий список ключевых):**

- `config.js`: константы `ADDITIONAL_ACTIONS_REQUIRED_FIELD/ADDITIONAL_ACTIONS_FIELD`, `ADDITIONAL_ACTIONS_STANDARD=["Отправить ЕО в OTM","Переместить в корректную линию","Перебрать"]`, `fetchAdditionalActionsDefault()` читает `GET .../fields/getbytitle('AdditionalActions')?$select=DefaultValue` → парсит `";#"` → кэш `sessionStorage sp:AdditionalActions:Default`.
- `listQuery.js`: добавляет `AdditionalActionsRequired,AdditionalActions` в `$select` если `useAdditionalActions && hasAdditionalFields`; retry без них при 400.
- `mapping.js`: `additionalRequiredRaw = r.AdditionalActionsRequired ?? r.AdditionalActionsRequired_x0020_ ?? ...` → нормализация `true/1→"Да", false/0→"Нет", строки "да/true/1"→"Да"`; `additionalActions = rawAA.results||rawAA||[]`.
- `TasksView.jsx`:
  - state `fieldDefaultActions` (sync из `getCachedAdditionalActionsDefaultSync` || fetch), `additionalActions` per TaskCard, `pendingAdditionalActions` для диалога hash-леммы.
  - mount effect `AdditionalActionsRequired` тип: `GET .../fields?$filter=InternalName eq 'AdditionalActionsRequired'` → `TypeAsString` contains `boolean/yes/no` → `setAdditionalRequiredIsBoolean`.
  - Отображение: chip `Доп. действия: Да/Нет`, список chips значений.
  - Interaction: `Autocomplete freeSolo multiple` (choices = `ADDITIONAL_ACTIONS_STANDARD` + fill-in), empty → `Required="Нет"` (скрывает поле), non-empty → `"Да"`.
  - Сохранение: `payload.AdditionalActionsRequired = toSPRequired("Да"/"Нет")` (String vs Boolean flip), `payload.AdditionalActions = {__metadata:{type:"Collection(Edm.String)"}, results:[…]}`. Retry при mismatch (String↔Boolean). При 400 missing field — retry без обоих полей. Аналогичные retry в обоих ветках handleComplete (take vs found/notFound).
  - `queryClient.setQueryData` rollback при ошибке сохраняет `AdditionalActions` в предыдущее snapshot.

**Текущая архитектура**: ОДНО общее поле `AdditionalActions` (MultiChoice, AllowFillIn=true по предположению) для всех CT. Отдельные поля `SearchAdditionalActions` etc. **не созданы**. Решение отложено до аудита (Phase 2.2 таблица).

**Хардкоды**: `"Отправить ЕО в OTM"` как hardcoded default (используется если cache null), `ADDITIONAL_ACTIONS_STANDARD` массив, проверка `additionalActions.length===1 && [0]==="Отправить ЕО в OTM"` для hardcode detection.

---

## 6. RelatedItems

- SharePoint поле `RelatedItems` (JSON string или `results` array) формата `[{"ListId":"{guid}","ItemId":24785}]` (бизнес: одна Task → один ProblemsPallet, но RelatedItems может содержать несколько элементов — берётся `[0]`).
- `listQuery.js`: всегда добавляет `RelatedItems` в `$select` (критично для enrich).
- `mapping.js`: `RelatedItems: r.RelatedItems || null`, `ContentTypeId` парсится.
- `enrich.js`:
  - `parseRelatedItems(string|array)` → JSON.parse tolerant.
  - `fetchRelatedElement(listId,itemId)` три фолбэка: `items(itemId)?$select=Recipient/Title,Recipient/SCNumberText,Title,THU,DC_THU&$expand=Recipient` → `?$filter=Id eq …` → минимальный select.
  - `extractRecipientAndSC(d)` → `{recipient, scNumber, thu}` из `d.Recipient.Title / SCNumberText` + `d.THU/DC_THU`.
  - `needsEnrichment(mapped)` = `(!Recipient || !SCNumber || !THU) && RelatedItems` (раньше было ограничение "Без ТК", теперь для любой без данных).
  - `groupByListId(tasks)` → `Map<listId,{itemIds[],taskIds[],taskIdToItemId}>`.
  - `fetchRelatedBatch(listId,itemIds)` chunk 30 → `GET .../items?$filter=(Id eq 1) or (Id eq 2)&$select=Id,Recipient/Title…&$expand=Recipient&$top=uncached.length` (ранее `top=c*2`, теперь точнее). Проверяет глобальный кэш `getGlobalEnrichCache` перед сетью, пишет `setGlobalEnrichCache` после успеха. `useBatch=true` по умолчанию, fallback на fan-out `runWithConcurrency(concurrency=5)`.
  - Глобальный кэш `GLOBAL_ENRICH_TTL=10м`, ключи `listId:itemId` и `task:taskId`, persist `sessionStorage sp:globalEnrichCache` (100 последних), size cap 200.
- `useTasksQuery.js`:
  - `queryFn` сначала `fetchTasks` (чистые mapped), затем **мержит** глобальный кэш по `taskId` и по `RelatedItems` → не мигает "ЕО 808… → ТК 107 • ЕО …" (stale 5м, gc 10м, placeholderData prev, structuralSharing, refetch 5м, focus/reconnect off, debounce 300мс).
  - `useEffect` на `dataUpdatedAt` → `enrichTasksWithRelated(data,{concurrency:5,useBatch:true})` → `setGlobalEnrichCacheByTaskId` + по RelatedItems → `queryClient.setQueryData` с диффом `Recipient/SCNumber/THU` только если changed (чтоб не триггерить лишние ререндеры).
- `taskIndex.js` (не перечислен в списке аудита но важен для RelatedItems): строит `Map<elementId,task>` и `byThu`, использует `extractEONumberFromTask` из `formatters.js`.
- `hashSearch.js`: `GetItems` CAML по `RelatedItems` (ItemId), `FULL_TASK_SELECT`, `HASH_CAML_ROW_LIMIT=20`.

Запрет: не менять модель `Task → RelatedItems → ProblemsPallet` без бизнес-решения; текущий батч сохраняет 1 запрос на N Tasks одного ListId (пример: ItemId 24785 для Tasks 531/532/533 — 1 запрос вместо N).

---

## 7. Completion (task lifecycle)

- Только SPD Workflow создаёт следующую Task. React делает:

```
handleComplete(task, resultValue, {additionalRequired, additionalActions, location1}):
  1. _isFound/_isNotFound флаги по cfg.requiresAdditionalActions
  2. _fieldMetaForTask = getResultFieldForTask(task, ctMap, resultFieldsMeta) || {internalName:"ResultSearchTHU"}
  3. GET .../items(task.Id)?$select=Id,Status,PercentComplete,${resultFieldName},ResultSearchTHU,Location1,AdditionalActionsRequired,AdditionalActions,Modified,ContentTypeId
  4. if server Modified/Status/Result изменился → notify "уже выполнена другим" + setQueryData rollback
  5. payload = { Status:"Завершена" || discovered completedStatusValue, PercentComplete:1, [resultFieldName]:resultValue, ResultSearchTHU:resultValue, Location1, AdditionalActionsRequired, AdditionalActions }
     — для "ЕО не найдена" очищает AdditionalActions
  6. POST .../items(task.Id) headers X-HTTP-Method:MERGE, If-Match:*
     — retry на EndJob strip, DueDate strip, AdditionalActions strip, AdditionalActionsRequired type flip (String↔Boolean), AssignedToId→AssignedTo/Id
  7. invalidate("/items"), refetchTasks() → TanStack обновляет список, SPD в фоне создаёт следующую Task → появится через polling без Refresh
```

- Statuses: строки "Назначена" (0), "В процессе выполнения" (1/2), "Завершена"/"Completed"/"Выполнена" (5/100%). Хелперы `src/tasks/status.js`: `isCompletedStatus` (percent 1/100 или includes "заверш"/"completed"), `isInProgressStatus` ("в процессе"/"в работе"/"in progress"), `isNotStartedStatus`.

---

## 8. Polling / realtime

- `useTasksQuery` (TanStack):
  - `staleTime 5m, gcTime 10m, refetchInterval 5m, refetchOnWindowFocus false, refetchOnReconnect false, placeholderData: prev => prev`
  - `queryKey = ["tasks", currentUserId, distribution?.Id||OffDepKey, taskFieldNames.join(","), recipientField, scNumberField, resultFieldInternalNames.join(",")]`
  - `enabled = !!currentUserId && !fieldsLoading` — не стартует пока не загружены entityType/choices/status/AdditionalActionsRequired/resultFieldsMeta.
- Configuration query отделена: `resultFieldsMeta/ctMap` кэшируются 24ч (`localStorage` + memory), `lastResultFieldsRefreshRef` throttle 5м и `needForce` только если появился новый `ContentTypeId` не в `ctMap`. Поэтому polling Tasks (5м) не триггерит тяжёлые `fields`, `contenttypes` запросы (исправлено в 07fa741).
- `TasksView` фоновая индикация: `isBackgroundFetching = isTasksFetching && !isTasksLoading` → `<CircularProgress size20> Обновление...` внизу списка, не блокирующий.
- Hash-navigation polling: `hashSearch.js` `fetchFullTask` + `GetItems` CAML limit 20, отдельный throttle.

---

## 9. Enrichment (см. §6, дополнительно audit)

- Цель: докачать `Recipient` (ТК номер) и `THU` (номер ЕО) из ProblemsPallet, т.к. `Recipient` отсутствует в Tasks.
- Проблемы до фикса: N задач одного pallet → N× `items(id)` → DDoS; каждый `refetch` сбрасывал Recipient → мигание ЕО→ТК.
- После `07fa741`: batch `(Id eq …) or …` chunk30, глобальный кэш 10м, `queryFn` merge до return, `useEffect` debounce 300мс + `needEnrich` check + дифф `setQueryData` только при `needNew`. Измерено: `vite build 1,416k gzip 425k`, 0 лишних `GetItems` при `dataUpdatedAt` рефетче.
- Для `ResultSearchComplete` (завершение) добавлен кросс-типовый кэш по `listId:itemId` + `taskId` (ранее был per-taskId только для поиска).
- Debug logs (`?dbg=1`) для завершения: `[DBG:fetchTasks] completion-type`, `[DBG:enrich] HIT/MISS`, `[DBG:TaskCard] render completion`.

---

## 10. Hardcoded logic & tech debt

**System constants (допустимы):**
- `TASKS_LIST_GUID`, `TASKS_LIST_API`, `RESULT_FIELD_TYPE_DISPLAY_NAME`, `RESULT_FIELD_SHORT_DESC`, `HASH_CAML_ROW_LIMIT`, `GLOBAL_ENRICH_TTL`, `CACHE_TTL_MS`.

**Configuration (должны уйти в resolver):**
- `"Отправить ЕО в OTM"` default, `ADDITIONAL_ACTIONS_STANDARD` массив, `"Да"/"Нет"` строки для AdditionalActionsRequired, `"В процессе выполнения"/"Завершена"` статусы (обнаруживаются через `fields?$filter=Status` но есть фолбэки).
- `SELECT_BASE` всегда включает `ResultSearchTHU` как fallback (нарушает §13 — должен резолвиться).

**Business rules (оставить в SPD):**
- "Для этого типа задач default Дополнительные действия = Да + [ОТМ]" (коррекция 2026-09-17), удаление последнего choice → `Required=Нет`.
- inline Найдена/Не найдена логика (`cfg.requiresLocation/AdditionalActions`), celebration/sherlock анимации, `whereFound` optional.

**Compatibility workarounds:**
- `stripEndJob`, `stripRecipient`, `EndJob` clean cache/localStorage, `AssignedToId`→`AssignedTo/Id` replace, `AdditionalActionsRequired` String↔Boolean flip, fallback без AdditionalActions полей.
- `recipientMissing` flag + 3с auto-clear, `Recipient` отсутствует → enrich only.

**Случайные tech hardcodes (кандидаты на удаление):**
- `borderRadius '28px'` на xs/sm, `Box { #f5f5f5 }` vs input `#fff`, `transform/boxShadow none`, `fieldset transparent`, `celebrate* 1600ms`, `stale 5m` магические числа.
- `if ContentTypeId` checks отсутствуют в `AdditionalActionsField` — уже универсален, но `TaskCard` всё ещё содержит `if isCompleted` ветвление.

---

## 11. Compatibility & риски

- **SPD Workflow** трогать нельзя (§6 плана): поля `AdditionalActions*`, `Result` читаются workflow — переименование без миграции сломает старые Tasks. Решение: audit таблицы `ContentType → ResultField/AdditionalActionsField` с колонками `Workflow usage` = UNKNOWN пока не проверен REST полей и выборки реальных Items.
- **Старые Tasks**: содержат `ResultSearchTHU` (заполнено) и `AdditionalActions` (одно поле). Новый `ResultSearchComplete` для завершения — другое CT, логи mapping уже ищет любой `*result*` ключ, но `listQuery` догрузит его только когда `resultFieldInternalNames` включает его (требует discovery). До discovery — `rawComplete` пусто → UI показывает "—".
- **Permissions**: AssignedTo фильтр зависит от `DcEmail` (Office/Department → groupIds). `distribution.js` резолвит через `DcEmail` list и кэширует.
- **Backward compat**: `ResultSearchTHU` остаётся fallback в `mapping`, `select` и `resultField.js fallback`. `AdditionalActions` остаётся общим пока аудит не докажет необходимость разделения (вариант B).

---

## 12. Self-check (Phase 0.1)

- [x] Найдено каждое использование `AdditionalActions` (124, `rg` + `src/tasks/config.js:71 FULL_TASK_SELECT` + `hashSearch` + `mapping` + `TasksView` 80+ мест)
- [x] Найдено каждое использование `AdditionalActionsRequired` (Choice/Boolean flip логика, 30+ мест, `fields?$filter`, `mapping` нормализация)
- [x] Найдено каждое использование `ContentTypeId` (mapping, resultField, listQuery select, TaskCard freshChoices, taskIndex)
- [x] Найден completion flow (§7, `handleComplete` строка `TasksView.jsx:1920–2446`)
- [x] Найден polling (`useTasksQuery` 5м + `queryClient` defaults, `TasksView` background indicator, `hashSearch` polling)
- [x] Найден RelatedItems mapping (§6, `enrich.js` batch + cache + `taskIndex.js`, `listQuery` always select)

**STATUS: VERIFIED** — документ отражает фактический `src/` на `07fa741`. Следующий шаг: **Phase 1 Baseline** (build/tests/manual checklist) затем **Phase 2 Content Type audit** (реальный REST к целевому SharePoint, сохранение ответа).

---

## 13. Список файлов аудита (для Phase 7)

```
src/App.jsx               — routing, QR, file drop, global dialogs (не Tasks-специфичен, будет вынесен на Phase 15)
src/TasksView.jsx         — 3300+ строк orchestration: mount effects, completion, dialogs, polling, TaskCard memo
src/api.js                — axios+digest+cache+stripEndJob/Recipient, in-flight dedup
src/tasks/config.js       — GUID, TASKS_LIST_API, AdditionalActions defaults, FULL/HASH selects, REMOVED_FIELDS
src/tasks/distribution.js — Office→DcEmail→groupIds
src/tasks/listQuery.js    — buildTaskListQuery (filter AssignedTo, select/expand, extraFields)
src/tasks/fetchTasks.js   — fetchTasks loop __next, EndJob/DueDate/Recipient retry, mapRawTask
src/tasks/useTasksQuery.js— TanStack wrapper + global enrich cache + debounce enrich effect
src/tasks/enrich.js       — RelatedItems→ProblemsPallet batch, global cache 10м, needsEnrichment, concurrency
src/tasks/mapping.js      — stripHtml, recipient fallback, SCNumber, AdditionalActions normalization, dynamic ResultSearchTHU
src/tasks/resultField.js  — fetchResultFieldsMeta/ContentTypeResultMap, getResultFieldForTask (24h cache)
src/tasks/hashSearch.js   — GetItems CAML RelatedItems, fetchFullTask, fallback OData
src/tasks/status.js       — isCompleted/isInProgress/isNotStarted
src/tasks/formatters.js   — extractEONumber, Решено за … chips
src/queryClient.js        — stale 30s/gc 5m default (переопределяется в useTasksQuery 5m/10m)
src/sp/cache.js           — request cache+inflight, TTL 60s
```
