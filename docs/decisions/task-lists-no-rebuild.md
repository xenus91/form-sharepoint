# Decision: Без ребилда — AdditionalActions и 2 SP списка (строго по плану §14, §17, §21)

> Дата: 2026-09-22 — исправление (было левые поля Label/Color/Variant/Gradient/RequiresLocation)
> Статус: **IMPLEMENTED — строго по плану, без левых полей**
> Связано: `src/services/taskResultDefinitions.js` (§14), `src/services/taskActionDefinitions.js` (§21), `src/services/taskTypeConfiguration.js` (§17), `src/features/tasks/hooks/useTaskConfiguration.js`, `src/features/tasks/components/TaskCard.jsx`, `src/services/additionalActionsResolver.js` (§18)
> Принцип: *Preserve business architecture* — SPD Workflow не трогаем, UI конфигурируется списками, graceful 404 → fallback.

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

### §21 TaskActionDefinitions
```
Title
ActionId
ContentTypeId
SortOrder
Enabled
```
НЕ заменяет Choice metadata автоматически (план §21: если field metadata уже описывает — сначала использовать metadata). Использовать только если реально нужен внешний словарь.

---

## Что было исправлено (левые поля убраны)

**До (наш предыдущий 00521c0):**
- `TaskResultDefinitions`: `Label, Color, Variant, RequiresLocation, RequiresConfirm, Gradient` — нет в плане, убраны (оставлены только для совместимости как legacy чтение, игнорируются если план-поля есть).
- `TaskActionDefinitions`: `ActionValue, Label` — заменено на `ActionId` (план), `Label` оставлен как legacy fallback.
- `TaskTypeConfiguration`: `ResultFieldInternalName, Required` (без `AdditionalActionsRequired/Enabled`) — заменено на план-поля, legacy `Required`/`ResultFieldInternalName` читаются для совместимости.

**После:**
- Все 3 сервиса читают **только план-поля** (`Title/ContentTypeId/ResultValue/ShowAdditionalActions/AdditionalActionsRequired/SortOrder/Enabled` и т.д.), legacy поля читаются дополнительно и игнорируются если план-поля заданы.

---

## Реализация (без ребилда)

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

**TaskActionDefinitions** → Columns `Title, ActionId, ContentTypeId, SortOrder, Enabled` (ActionId если пусто → Title).

**TaskTypeConfiguration** → Columns `Title, ContentTypeId, AdditionalActionsFieldInternalName, AdditionalActionsRequired, Enabled` (последнее `Yes/No`).

Пример данных (план):
```
TaskResultDefinitions: 0x0108A | Найден | No | No
TaskResultDefinitions: 0x0108A | Не найден | Yes | Yes
TaskTypeConfiguration: 0x010801 | SearchAdditionalActions | Yes
TaskActionDefinitions: Title=Переместить, ActionId=Переместить, ContentTypeId=0x010801, SortOrder=10
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
