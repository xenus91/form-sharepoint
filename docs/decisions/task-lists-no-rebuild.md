# Decision: Без ребилда — AdditionalActions и 2 SP списка (строго по плану §14, §17, §21) — ContentTypeId полный StringValue

> Дата: 2026-09-22 — исправление левых полей + 2026-09-23 отключён TaskTypeConfiguration до аудита (нет 404)
> Статус: **IMPLEMENTED — §14 TaskResultDefinitions + §21 TaskActionDefinitions активны (graceful 404), §17 TaskTypeConfiguration ОТКЛЮЧЁН до аудита `docs/audit/content-types.md`**
> Связано: `src/services/taskResultDefinitions.js` (§14), `src/services/taskActionDefinitions.js` (§21), `src/services/taskTypeConfiguration.js` (§17 — закомментирован), `src/features/tasks/hooks/useTaskConfiguration.js`, `src/features/tasks/components/TaskCard.jsx`, `src/services/additionalActionsResolver.js` (§18)
> Принцип: *Preserve business architecture* — SPD Workflow не трогаем, UI конфигурируется списками, graceful 404 → fallback. ContentTypeId — полный `StringValue` (`0x01080100...`), не Name.

## План выдержка (точные поля)

### §14 TaskResultDefinitions
Поля списка (план):
```
Title
ContentTypeId
ResultValue
ShowAdditionalActions
AdditionalActionsRequired
SortOrder
Enabled
```
НЕ заменяет реальное Result field (FieldLinks). Описывает поведение UI для уже существующих Result values.
Пример из плана:
```
ContentTypeId | ResultValue | ShowAdditionalActions | Required
0x0108A...    | Найден      | No                   | No
0x0108A...    | Не найден   | Yes                  | Yes
0x0108A...    | Поврежден   | Yes                  | No
```

### §17 TaskTypeConfiguration
```
Title
ContentTypeId
AdditionalActionsFieldInternalName
AdditionalActionsRequired
Enabled
```
Пример:
```
ContentTypeId | AdditionalActionsFieldInternalName | Required
0x010801...   | SearchAdditionalActions            | Yes
0x010802...   | PickingAdditionalActions           | Yes
```

### §21 TaskActionDefinitions — ActionId = стабильный английский ключ
```
Title              // display label (ru)  — "Отправить ЕО в OTM"
ActionId           // stable English key — "send_eo_to_otm" (snake_case, без пробелов/кириллицы)
ContentTypeId      // ""=global или полный StringValue "0x01080100..."
SortOrder          // 10,20,30
Enabled            // Yes/No
```
`ActionId` — **английский `snake_case`/`camelCase` ключ** (например `send_eo_to_otm`, `move_to_correct_line`, `repack`), а не русский. `Title` — человекочитаемый русский label для UI. Хранится в Task `AdditionalActions` — `ActionId` (стабилен при переименовании Title), отображается `Title`. Legacy русские `ActionId` поддерживаются, но новые — только английские.
НЕ заменяет Choice metadata автоматически (план §21: если field metadata уже описывает — сначала использовать metadata). Использовать только если нужен внешний словарь без правки поля.

---

## Что было исправлено (левые поля убраны)

**До (наш предыдущий 00521c0):**
- `TaskResultDefinitions`: `Label, Color, Variant, RequiresLocation, RequiresConfirm, Gradient` — нет в плане, убраны (оставлены только для совместимости как legacy чтение, игнорируются если план-поля есть).
- `TaskActionDefinitions`: `ActionValue, Label` — заменено на `ActionId` (план), `Label` оставлен как legacy fallback.
- `TaskTypeConfiguration`: `ResultFieldInternalName, Required` (без `AdditionalActionsRequired/Enabled`) — заменено на план-поля, legacy `Required`/`ResultFieldInternalName` читаются для совместимости.

**После:**
- Все 3 сервиса читают **только план-поля** (`Title/ContentTypeId/ResultValue/ShowAdditionalActions/AdditionalActionsRequired/SortOrder/Enabled` и т.д.), legacy поля читаются дополнительно и игнорируются если план-поля заданы.

---

## Полноценное определение: как заполнять ContentTypeId (ключ — полный StringValue)

**Где взять полный StringValue:**
1. На `https://portal.lenta.com/sites/obrazceo` открой любую Task → F12 Console → вставь скрипт из `docs/audit/content-types.md` шаг 1 (CT) → `window._cts.map(c=>({Name:c.Name, StringValue:c.Id.StringValue||c.StringId}))`.
2. Скопируй `StringValue` вида `0x01080100A94D5A38B1E04A...00112233` — это ключ, не `Name` (`Поиск ЕО`) и не `0x0108`.

**Правила ContentTypeId во всех 3 списках:**
- `пусто` = **глобально для всех CT** (случай A §15, один набор). Используй пока аудит §16 не показал разные наборы.
- `полный StringValue` = **только для этого CT** (exact match). Пример: `0x01080100A94D...` → только `Task_SearchPallet`.
- **Дочерний CT наследует:** `0x01080100AA` (родитель) и `0x01080100AA001122` (child). Резолвер берёт **longest prefix**: `ctId.startsWith(key)` → самый длинный ключ побеждает. Поэтому строка с `0x01080100AA` покроет child, а с `0x01080100AA001122` — только child.
- `Enabled=Нет` или пустой `Title`/`ResultValue`/`ActionId` — строка игнорируется.
- `SortOrder` — 10,20,30 (порядок в UI), `Enabled=Да` иначе игнор.

**Когда что заполнять (сейчас — случай A, один AdditionalActions):**
- **Аудит §16 не пройден / наборы одинаковы** → `TaskResultDefinitions` и `TaskActionDefinitions` — глобальные строки (`ContentTypeId` пусто), `TaskTypeConfiguration` **не создавать** (отключён до аудита, fallback к `sharepoint-metadata` — один `AdditionalActions`). `404` в Network — норма, теперь скрыт.
- **После аудита случай B** (разные наборы) → заведи отдельные поля `SearchAdditionalActions` (`Choice Multi+FillIn`) и строки с `ContentTypeId=полный StringValue` для каждого CT + строку в `TaskTypeConfiguration`:

```
TaskTypeConfiguration:
Title=Поиск ЕО | ContentTypeId=0x01080100A94D... | AdditionalActionsFieldInternalName=SearchAdditionalActions | AdditionalActionsRequired=Да | Enabled=Да
TaskTypeConfiguration:
Title=Сборка      | ContentTypeId=0x01080100BB... | AdditionalActionsFieldInternalName=PickingAdditionalActions | AdditionalActionsRequired=Да | Enabled=Да
```

После заполнения — `sessionStorage` 30м или `sessionStorage.clear()` + `location.reload()`.

---

## Пример полного флоу (настройка без ребилда) — как работают 2 списка + AdditionalActions поле

**Исходно:** один общий `Site Column` `AdditionalActions` (`Choice MultiChoice AllowMultiple=Yes AllowFillIn=Yes`, Choices: `Отправить ЕО в OTM` etc., `DefaultValue` пусто) + пустые списки (404 → fallback). После настройки — без `npm run build`.

### Шаг 1 — Админ заводит действия (без кода)

`Site Contents → TaskActionDefinitions → New` (3 строки, глобально):

| Title | ActionId | ContentTypeId | SortOrder | Enabled |
|---|---|---|---|---|
| Отправить ЕО в OTM | `send_eo_to_otm` | *(пусто)* | 10 | Да |
| Переместить в корректную линию | `move_to_correct_line` | *(пусто)* | 20 | Да |
| Перебрать | `repack` | *(пусто)* | 30 | Да |

Хочет для CT `Сборка` (`0x01080100BB...`) особый набор — добавляет:

| Title | ActionId | ContentTypeId | SortOrder |
|---|---|---|---|
| Проверить документы | `check_documents` | `0x01080100BB...` | 10 |

`useTaskConfiguration` → `resolveActionChoices("0x01080100BB...", defs)` → берёт per-CT (exact→prefix) → `["check_documents"]` + уникальные из поля. Для других CT → глобальные 3. `AdditionalActionsField` (`freeSolo`) сразу показывает новые `Title` как `label`, хранит `ActionId`.

### Шаг 2 — Админ заводит поведение Result (без кода)

`TaskResultDefinitions` → глобальные строки (ContentTypeId пусто):

| Title | ContentTypeId | ResultValue | ShowAdditionalActions | AdditionalActionsRequired | SortOrder | Enabled |
|---|---|---|---|---|---|---|
| Найдена | "" | `Найдена` | Да | Да | 10 | Да |
| Найден | "" | `Найден` | Да | Да | 11 | Да |
| Не найдена | "" | `Не найдена` | Нет | Нет | 20 | Да |
| Не найден | "" | `Не найден` | Нет | Нет | 21 | Да |

Хочет для CT `Поиск ЕО` (`0x01080100AA...`) чтобы `Поврежден` тоже требовал действия — добавляет строку `ContentTypeId=0x01080100AA... | ResultValue=Поврежден | Show=Да | Required=Нет`.

### Шаг 3 — Пользователь открывает Task `Сборка` (CT `0x01080100BB...`, Status `Назначена`)

`TasksView → useTaskConfiguration` (30м кэш) → `ctConfigMap.get("0x01080100BB...")`:
- `resultField` из `FieldLinks` (например `ResultSearchPallet` с `Choices: [Найдена, Не найдена, Поврежден]` — из discovery `resultField.js`)
- `additionalActionsField`: `InternalName=AdditionalActions`, `choices` = `resolveActionChoices` → `["check_documents"]` (т.к. per-CT) + `AllowFillIn=true`

`TaskCard` рендерит `choicesForButtons = ["Найдена","Не найдена","Поврежден"]` + `getResultDef("Поврежден")` → `Show=Да` → кнопка `Поврежден` считается `foundChoice` (требует AA).

### Шаг 4 — Пользователь жмёт `Найдена`

`TaskCard` → `setFoundInputMode(true)` → показывает:
- `Location1` (`TextField` "Где найдена? (необязательно)")
- `AdditionalActionsField` с `choices=[{value:"check_documents", label:"Проверить документы"}]` (из `TaskActionDefinitions` per-CT), `value=["send_eo_to_otm"]` дефолт? Нет, для этого CT дефолт `check_documents`, но `AdditionalActionsField` `value` берёт из `fieldDefaultActions` (поле `DefaultValue`) + `sessionStorage` — админ может задать `DefaultValue` в поле `AdditionalActions` как `check_documents` без ребилда.

Пользователь выбирает `Проверить документы` + вводит `проверить упаковку` (fill-in, `AllowFillIn=Yes`).

### Шаг 5 — Сохранение (план §18, §23)

`User changes selection → local state → additionalActionsResolver`:

```
Task {ContentTypeId:0x01080100BB...}
  → resolveTaskTypeConfig (отключён, fallback) → fieldInternalName="AdditionalActions"
  → field metadata (Choices, AllowFillIn, Multi)
  → normalized config {fieldInternalName:"AdditionalActions", choices:[{check_documents...}], allowFillIn:true}
```

`TasksView.handleComplete(task, "Найдена", "Зона 5", "Да", ["check_documents","проверить упаковку"])`:

```js
payload = {
  Status:"Завершена", PercentComplete:1,
  [resultFieldName]:"Найдена", // dynamic result field via getResultFieldForTask
  AdditionalActions: ["check_documents","проверить упаковку"], // ActionId английские, fill-in тоже
  AdditionalActionsRequired:"Да", // из TaskTypeConfiguration.AdditionalActionsRequired || length>0
  Location1:"Зона 5"
}
// POST /web/lists(guid'...')/items(123) X-HTTP-Method:MERGE If-Match:*
// Если поле другое (случай B, SearchAdditionalActions) — отправит {SearchAdditionalActions:[...]} , а не универсально AdditionalActions
```

`field Choices` **не меняется** (план §20: fill-in не меняет metadata, проверяется отдельным `GET .../fields/getbytitle` до/после — `Choices` остаются `["check_documents"]`, fill-in хранится только в Task item).

Другая Task `Task_SearchPallet` (CT `0x01080100AA...`) с тем же `Result=Не найдена` → `resolveTaskResultDefinition("Не найдена", "0x01080100AA...", defs)` → `Show=Нет` → `AdditionalActionsField` скрыт, `payload AdditionalActions=[]`, `Required=Нет`.

**Итог:** новый `ActionId`/`ResultValue` → строка в SP списке → 30м (или `sessionStorage.clear()`) → UI без `npm run build`. `ContentTypeId` — полный `StringValue` (audit) пусто=global, exact→prefix, `Enabled`/`SortOrder` управляют видимостью/порядком.

---

## Реализация (без ребилда, TaskTypeConfiguration отключён до аудита)

### TaskResultDefinitions (§14)
`src/services/taskResultDefinitions.js`
```js
GET /_api/web/lists/getbytitle('TaskResultDefinitions')/items?$select=Id,Title,ContentTypeId,ResultValue,ShowAdditionalActions,AdditionalActionsRequired,SortOrder,Enabled&$top=200&$orderby=SortOrder asc
→ {global: Map<norm, cfg>, byCt: Map<ctId, Map<norm,cfg>>} // TTL 30м
```
`resolveTaskResultDefinition(resultValue, contentTypeId, defs)` → `{showAdditionalActions, additionalActionsRequired}` (per-CT exact→prefix→global→substring).
`TaskCard.jsx`:
```js
const getResultDef = useCallback(v => resolveTaskResultDefinition(v, ctId, taskConfig.taskResultDefinitions), [ctId, defs])
foundChoice = choices.find(ch => {
  const def = getResultDef(ch);
  if(def) return def.showAdditionalActions;
  return getUiConfig(ch).requiresLocation || getUiConfig(ch).requiresAdditionalActions; // fallback
})
```
`resolveResultUiConfig` остаётся для цвета/варианта (hardcoded fallback), но Show-логика теперь из списка.

### TaskActionDefinitions (§21)
```js
GET /_api/web/lists/getbytitle('TaskActionDefinitions')/items?$select=Id,Title,ActionId,ContentTypeId,SortOrder,Enabled
→ {global: Array, byCt: Map}
```
`resolveActionChoices(ctId, defs, fallbackFieldChoices)` — если `defs==null` (404) → сразу `fallbackFieldChoices` (план: "если metadata достаточно — использовать metadata"). Иначе `per-CT → prefix → global → fallback`.

`useTaskConfiguration.js`:
```js
[resultFields, ctMap, taskTypeMap, resultDefs, actionDefs] = Promise.all([...])
// merge в ctConfigMap.additionalActionsField.choices:
defChoices = resolveActionChoices(ctId, actionDefs, null) // без fallback
merged = defChoices.length ? [...defChoices, ...uniqueBaseFieldChoices] : baseFieldChoices
```
`AdditionalActionsField.jsx` универсален (`multiple freeSolo`) — получает уже смерженные `choices` из `taskConfig.ctConfigMap`.

### TaskTypeConfiguration (§17)
```js
GET /_api/web/lists/getbytitle('TaskTypeConfiguration')/items?$select=Id,Title,ContentTypeId,AdditionalActionsFieldInternalName,AdditionalActionsRequired,Enabled&$top=100
→ Map<ctId, {additionalActionsFieldInternalName, additionalActionsRequired, enabled}>
```
`additionalActionsResolver.js` (§18):
```
Task → ContentTypeId → TaskTypeConfiguration → fieldInternalName → field metadata → {enabled, required, choices}
```
Если `Enabled=false` → `enabled:false` (контрол отсутствует). Если `AdditionalActionsRequired` задан → `required` из него, иначе из `task.AdditionalActionsRequired`.

`useTaskConfiguration.js` также мержит `additionalActionsFieldInternalName` (разные поля на §15 случай B: `SearchAdditionalActions` etc., каждое `Choice AllowMultiple+FillIn`).

Все 3 списка — `graceful 404` → fallback (поле / hardcoded `resultConfig.js` / `ADDITIONAL_ACTIONS_STANDARD`), поэтому tenant может создавать поэтапно без лома.

---

## Как создать списки (UI, без кода)

**TaskResultDefinitions** → Site Contents → New List → Custom List → Columns:
- `Title` (Single line, required) — пример `Найден`
- `ContentTypeId` (Single line) — `0x01080100...` или пусто=глобально
- `ResultValue` (Single line) — `Найден` (если пусто → Title)
- `ShowAdditionalActions` (Yes/No) — `No` для `Найден`, `Yes` для `Не найден`
- `AdditionalActionsRequired` (Yes/No) — `No`/`Yes`
- `SortOrder` (Number) — `10,20`
- `Enabled` (Yes/No) — `Yes`

**TaskActionDefinitions** → Columns `Title (ru label), ActionId (en key snake_case), ContentTypeId, SortOrder, Enabled` (ActionId `send_eo_to_otm`, `move_to_correct_line`, `repack`; если пусто → `Title`).

**TaskTypeConfiguration** → Columns `Title, ContentTypeId, AdditionalActionsFieldInternalName, AdditionalActionsRequired, Enabled` (последнее `Yes/No`) — **отключён до аудита §16**, создавать только для случая B.

Пример данных (план + текущий флоу — ActionId английский):
```
TaskResultDefinitions: 0x0108 | Найдена | Show=Yes Required=Yes  (AdditionalActionsField виден, Required)
TaskResultDefinitions: 0x0108 | Не найдена | Show=No Required=No
TaskActionDefinitions: Title="Отправить ЕО в OTM" | ActionId=send_eo_to_otm | ContentTypeId="" (global) | SortOrder=10
TaskActionDefinitions: Title="Переместить в корректную линию" | ActionId=move_to_correct_line | ContentTypeId="" | SortOrder=20
TaskActionDefinitions: Title="Перебрать" | ActionId=repack | ContentTypeId="" | SortOrder=30
TaskActionDefinitions (per-CT пример): Title="Проверить документы" | ActionId=check_documents | ContentTypeId=0x01080100BB... | SortOrder=10
TaskTypeConfiguration (случай B, после аудита): ContentTypeId=0x01080100AA... | SearchAdditionalActions | AdditionalActionsRequired=Да
```

После заполнения — `sessionStorage` 30м или `invalidateQueries(['task-configuration'])` без ребилда.

---

## Self-check (план)

- [ ] `GET .../TaskResultDefinitions` 404 → TaskCard как раньше (Show из hardcoded fallback)
- [ ] Создать строку `ResultValue=не найдена, Show=Yes, Required=Yes` → `AdditionalActionsField` появляется без ребилда (`?dbg` → `_source: task-result-definitions-*`)
- [ ] `TaskActionDefinitions` 404 → `AdditionalActionsField` берёт `choices` из поля `AdditionalActions` (field metadata) — план §21
- [ ] Добавить строку `ActionId=Тест без ребилда` → появляется в `Autocomplete` через 30м
- [ ] `TaskTypeConfiguration` `Enabled=No` → контрол `AdditionalActionsField` отсутствует (enabled false)
- [ ] Polling Tasks не делает N+1 `fields` запросов (отдельный `task-configuration` 30м)
- [ ] `npm run build` PASS (1158 → 1,434k)
