# Decision: Без ребилда — AdditionalActions + 2 SP списка (TaskResultDefinitions, TaskActionDefinitions)

> Дата: 2026-09-22 — исправление после ревью (было hardcoded `resultConfig.js`/`ADDITIONAL_ACTIONS_STANDARD`)
> Статус: **IMPLEMENTED — без ребилда**
> Связано: `src/services/taskResultDefinitions.js`, `src/services/taskActionDefinitions.js`, `src/services/taskTypeConfiguration.js`, `src/features/tasks/hooks/useTaskConfiguration.js`, `src/features/tasks/components/TaskCard.jsx`, `src/tasks/resultConfig.js` (fallback), `src/tasks/config.js` (fallback)
> Принцип: *Preserve business architecture, improve technical architecture* — SPD Workflow не трогаем, UI конфигурируется списками.

## Проблема

До `870062a` UI поведение (`color/gradient/requiresLocation/requiresAdditionalActions/confirm`) и список `Дополнительные действия` были зашиты в код:
- `src/tasks/resultConfig.js` `RESULT_UI_CONFIG` (найдена/не найдена + `_default`)
- `src/tasks/config.js` `ADDITIONAL_ACTIONS_STANDARD = ["Отправить ЕО в OTM", …]` (3 строки)

Добавление нового Result-значения или нового действия требовало правки кода + `npm run build` + деплой — недопустимо для оперативных изменений.

## Решение

**Оставить поле `AdditionalActions` (Site Column, `MultiChoice AllowMultiple+FillIn`) + завести 2 SharePoint-списка для динамики без ребилда.** Все 3 источника — с `graceful 404` → fallback к hardcoded, поэтому tenant может внедрять поэтапно.

### 1) `TaskResultDefinitions` — UI поведение Result-значений

**Назначение:** Каждое Result-значение (`Найдена`, `Не найдена`, новые `Выполнено`, `Отклонено`…) — отдельная строка, без привязки к типу задачи или с привязкой к `ContentTypeId`.

| Внутреннее имя | Тип (SP) | Обязат. | Пример | Описание |
|---|---|---|---|---|
| `Title` | Single line text | да | `Найдена` | Человекочитаемый label (если `ResultValue` пусто — берётся Title) |
| `ResultValue` | Single line text | нет | `найдена` | Значение из поля Result (если пусто — Title). Нормализуется `lowerCase` для матчинга |
| `ContentTypeId` | Single line text | нет | `0x01080100ABC...` или пусто | Если пусто — глобально для всех CT. Если `0x0108…` — только для этого CT (prefix-match для дочерних) |
| `Label` | Single line text | нет | `Найдена` | Переопределяет отображение кнопки (если пусто — Title) |
| `Color` | Choice (`success`/`error`/`warning`/`info`) | нет | `success` | MUI color |
| `Variant` | Choice (`contained`/`outlined`) | нет | `contained` | MUI variant |
| `RequiresLocation` | Yes/No (или `Да`/`Нет` text) | нет | `Да` | Нужен ли `Location1` |
| `RequiresAdditionalActions` | Yes/No | нет | `Да` | Нужен ли `AdditionalActions` (`"Да"` → хотя бы одно) |
| `RequiresConfirm` | Yes/No | нет | `Нет` | Показывать ли экран подтверждения (как `Не найдена`) |
| `Gradient` | Single line text (long) | нет | `linear-gradient(180deg, #2e7d32...)` | CSS gradient, если пусто — берётся из `color` |
| `SortOrder` | Number | нет | `10` | Порядок отображения (используется для сортировки, но выбор кнопок идёт по `Choices` поля) |
| `IsActive` | Yes/No | нет | `Да` | `Нет` — строка игнорируется |

**REST:**
```
GET /_api/web/lists/getbytitle('TaskResultDefinitions')/items?$select=Id,Title,ResultValue,ContentTypeId,Label,Color,Variant,RequiresLocation,RequiresAdditionalActions,RequiresConfirm,Gradient,SortOrder,IsActive&$top=200&$orderby=SortOrder asc
→ Map<norm, cfg> + Map<ctId, Map<norm,cfg>> (кэш 30м, sessionStorage)
```

**Логика UI (src/services/taskResultDefinitions.js → TaskCard.jsx):**
```js
resolveResultUiConfig(choice, contentTypeId, definitions)
// 1) per-CT definitions (точное ctId → prefix longest)
// 2) global definitions
// 3) substring match (найдена (в зоне) → найдена)
// 4) fallback hardcoded RESULT_UI_CONFIG
// 5) _default зелёная
```
`TaskCard.jsx` теперь `getUiConfig = useCallback( (v)=> definitions ? resolveResultUiConfig(v, ctId, defs) : getResultUiConfig(v) )`

### 2) `TaskActionDefinitions` — список Дополнительных действий

**Назначение:** Каждое действие — строка. Админ добавляет `Отправить в 1С`, `Связаться с клиентом` без правки поля `AdditionalActions`.

| Внутреннее имя | Тип | Пример | Описание |
|---|---|---|---|
| `Title` | Single line | `Отправить ЕО в OTM` | Label |
| `ActionValue` | Single line | `Отправить ЕО в OTM` | Значение (если пусто — Title) |
| `ContentTypeId` | Single line | пусто или `0x0108…` | Пусто — глобально, иначе только для CT (prefix) |
| `Label` | Single line | `Отправить ЕО в OTM` | Отображение (если пусто — Title) |
| `SortOrder` | Number | `10` | Порядок |
| `IsActive` | Yes/No | `Да` | `Нет` — скрыть |

**REST:**
```
GET /_api/web/lists/getbytitle('TaskActionDefinitions')/items?$select=Id,Title,ActionValue,ContentTypeId,Label,SortOrder,IsActive&$top=200&$orderby=SortOrder asc
→ {global: Array, byCt: Map<ctId,Array>}
```

**Логика choices (src/services/taskActionDefinitions.js → useTaskConfiguration.js):**
```js
resolveActionChoices(ctId, defs, fallbackFieldChoices)
// 1) per-CT defs (exact → prefix)
// 2) global defs
// 3) fallback fallbackFieldChoices (из поля AdditionalActions)
// Merge в useTaskConfiguration: defChoices + уникальные из поля (dedup lowerCase) → ctConfigMap.additionalActionsField.choices
// Если defs==null (404) → только поле + ADDITIONAL_ACTIONS_STANDARD fallback
// Fallback цепочка: TaskActionDefinitions → поле AdditionalActions → ADDITIONAL_ACTIONS_STANDARD
```

`AdditionalActionsField.jsx` остаётся универсальным (`multiple freeSolo`), получает `choices` из `taskConfig.ctConfigMap.get(ctId).additionalActionsField.choices` — уже с учётом списка, без `if ContentType`.

### 3) `TaskTypeConfiguration` (уже был, теперь вместе)

Карта `ContentTypeId → {ResultFieldInternalName, AdditionalActionsFieldInternalName}` (если нужны разные поля per CT). Вместе с двумя новыми списками — полный без-реилд.

## Как создать списки на tenant (без кода)

**Вариант A — UI (SharePoint → Site Contents → New → List):**
1. Создать Custom List `TaskResultDefinitions` → List Settings → Create Column (см. таблицу).
2. Аналогично `TaskActionDefinitions`.
3. Заполнить строки (пример ниже) → Save.

**Вариант B — REST (в DevTools, залогинен):**
```js
const base="/_api/web/lists";
// 1) создать список
await fetch(base, {method:"POST", headers:{"Accept":"application/json;odata=verbose","Content-Type":"application/json;odata=verbose","X-RequestDigest":document.getElementById("__REQUESTDIGEST")?.value}, body: JSON.stringify({__metadata:{type:"SP.List"}, Title:"TaskResultDefinitions", BaseTemplate:100, Description:"UI поведение Result без ребилда"}), credentials:"same-origin"});
// 2) добавить поле (пример RequiresLocation)
await fetch(base+"/getbytitle('TaskResultDefinitions')/fields", {method:"POST", headers:{"Accept":"application/json;odata=verbose","Content-Type":"application/json;odata=verbose","X-RequestDigest":document.getElementById("__REQUESTDIGEST").value}, body: JSON.stringify({__metadata:{type:"SP.FieldChoice"}, Title:"Color", FieldTypeKind:6, Choices:{results:["success","error","warning","info"]}}), credentials:"same-origin"});
// повторить для всех колонок (см. таблицу) — проще через UI
```

**Пример данных (после создания):**

`TaskResultDefinitions`
| Title | ResultValue | ContentTypeId | Label | Color | Variant | RequiresLocation | RequiresAdditionalActions | RequiresConfirm | SortOrder |
|---|---|---|---|---|---|---|---|---|---|
| Найдена | найдена | (пусто) | Найдена | success | contained | Да | Да | Нет | 10 |
| Не найдена | не найдена | (пусто) | Не найдена | error | contained | Нет | Нет | Да | 20 |
| Выполнено | выполнено | 0x01080100XYZ | Выполнено | success | contained | Нет | Нет | Нет | 10 |

`TaskActionDefinitions`
| Title | ActionValue | ContentTypeId | Label | SortOrder |
|---|---|---|---|---|
| Отправить ЕО в OTM | Отправить ЕО в OTM | (пусто) | Отправить ЕО в OTM | 10 |
| Переместить в корректную линию | — | (пусто) | — | 20 |
| Связаться с клиентом | связаться с клиентом | 0x01080100ABC | Связаться с клиентом | 30 |

После заполнения — `sessionStorage` 30м, затем `refetch` без ребилда.

## Код изменений (Phase 17)

- `src/services/taskResultDefinitions.js` — fetch + Map + `resolveResultUiConfig` + `graceful 404`
- `src/services/taskActionDefinitions.js` — fetch + `resolveActionChoices`
- `src/features/tasks/hooks/useTaskConfiguration.js` — `Promise.all` 5 источников (`resultFields`, `ctMap`, `taskTypeMap`, `resultDefs`, `actionDefs`) + merge `additionalActionsField.choices` (dedup) + expose `taskResultDefinitions`/`taskActionDefinitions` в `ctConfigMap`/`data`
- `src/features/tasks/components/TaskCard.jsx` — `import {resolveResultUiConfig}`, `getUiConfig = useCallback(... taskConfig.taskResultDefinitions ...)`, 5× `getResultUiConfig → getUiConfig`
- `src/tasks/resultConfig.js` и `src/tasks/config.js` — остаются как **fallback** (если списки 404), не удалены для обратной совместимости + первое открытие без списков.
- Кэш `task-configuration` 30м, `gc 4ч`, `refetchOnWindowFocus false` — polling Tasks (5м) не триггерит списки.

## Self-check

- [ ] `GET .../TaskResultDefinitions` 404 → TaskCard рендерит как раньше (зелёная/красная через hardcoded)
- [ ] Создать `TaskResultDefinitions` одну строку `не найдена` → `RequiresConfirm` меняется без ребилда (проверить `?dbg=1` `_source: task-result-definitions-global`)
- [ ] `TaskActionDefinitions` 404 → `AdditionalActionsField` берёт `choices` из поля `AdditionalActions` + `ADDITIONAL_ACTIONS_STANDARD`
- [ ] Добавить в `TaskActionDefinitions` новое значение `Тест без ребилда` → появляется в `Autocomplete` через 30м (или `invalidateQueries(['task-configuration'])`)
- [ ] Polling `tasks` не делает N+1 `TaskResultDefinitions` запросов (отдельный `task-configuration` 30м)
- [ ] `npm run build` PASS (1158 modules → 1,431k)

## Дальше

- `App.jsx`/`queryClient` декомпозиция и `TaskDetails`/`TaskResult`/`TaskActions` — каждый отдельным PR (как требовалось), теперь без hardcoded — достаточно завести строки в списках.
