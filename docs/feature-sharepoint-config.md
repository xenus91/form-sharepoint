# Инструкция: гибкая настройка UI через SharePoint (TaskResultDefinitions + TaskPromptFields + Additional Actions)

> **Аудитория:** SharePoint-администратор, настраивающий UI без участия разработчика.
> **Объём:** две новые сущности (`TaskResultDefinitions` расширен, `TaskPromptFields` новый), интеграция с уже существующим `TaskActionDefinitions` для Additional Actions.

---

## 1. Что нового

До этого PR-а в UI были **захардкожены** две вещи:

1. **Цвета/стили кнопки результата** (green для «Найдена», red для «Не найдена» и т. д.) — лежали в `src/tasks/resultConfig.js`.
2. **Список полей для заполнения** при выборе результата — ровно одно поле `Location1` для ключа «найдена»/«найден».

После этого PR-а:

| Что | Где настраивается |
|---|---|
| Цвет/вариант/градиент кнопки результата | `TaskResultDefinitions` (поля `Color`, `Variant`, `Gradient`) |
| Показывать ли confirm-модалку перед submit | `TaskResultDefinitions` (поле `RequiresConfirm`) |
| **Произвольный список полей** для заполнения по `(ContentType × ResultValue)` | **`TaskPromptFields`** (новый список) |
| Видимость и обязательность Additional Actions | `TaskResultDefinitions` (поля `ShowAdditionalActions`, `AdditionalsActionsRequired`) — без изменений |
| Список Additional Actions (что доступно) | `TaskActionDefinitions` — без изменений |

Всё настраивается **через стандартный SharePoint UI** (list view + Edit Properties) либо через PnP PowerShell — никакой правки React-кода.

---

## 2. Архитектура (быстро)

### 2.1. Списки SharePoint

| Список | Назначение | Заголовок |
|---|---|---|
| `TaskResultDefinitions` | Стили result-кнопки, флаги поведения per `(CType × ResultValue)` | (уже существует) |
| `TaskActionDefinitions` | Список Additional Actions + `Default` per `(CType × ActionValue)` | (уже существует) |
| **`TaskPromptFields`** ⭐ NEW | Произвольные поля для заполнения per `(CType × ResultValue)` | создать вручную или через PnP |

### 2.2. Резолвер и приоритеты

Для одного `(ContentTypeId, ResultValue)` резолвер ищет в порядке (от точного к общему):

1. **exact** `(CType, ResultValue)` в списке.
2. **prefix** CT (родительский ContentType, например ребёнок `0x0108...AAA01` → родитель `0x0108...AAA`).
3. **wildcard** `(CType, ResultValue="*")` — дефолт для конкретного CT.
4. **global wildcard** `(CType="", ResultValue="*")` — глобальный дефолт для всех CT и всех Result values.
5. **global exact** `(CType="", ResultValue="X")` — глобальное правило для одного Result value.

> ❗ Никакого substring-match (в отличие от `TaskResultDefinitions` где «найдена» матчится через «найдена»). Если CT для кастомного Result value не описан явно — поля НЕ покажутся.

### 2.3. Graceful fallback

| Сценарий | Поведение |
|---|---|
| `TaskPromptFields` 404 / отсутствует | Inline-mode в карточке для ключа «найдена» показывает **одно** поле `Location1` (legacy). Banner при `?configWarn=1`. |
| `TaskResultDefinitions` 404 / отсутствует | `getResultUiConfig(choice)` возвращает hardcoded конфиг из `src/tasks/resultConfig.js`. |
| Оба списка 404 | Banner при `?configWarn=1`. |
| `FieldInternalName` ссылается на несуществующее поле Tasks | SP вернёт 400 при MERGE. Админ должен следить за корректностью internal-имени. |
| `Required=Да` поле не заполнено | Submit блокируется, ошибка «Заполните обязательные поля: …». |

---

## 3. Список `TaskPromptFields` — детальная настройка

### 3.1. Создание списка

**Через SharePoint UI:** Site contents → New → List → имя `TaskPromptFields`.

**Через PnP PowerShell** (рекомендую):

```powershell
Connect-PnPOnline -Url "https://tenant.sharepoint.com/sites/yoursite" -Interactive

New-PnPList -Title "TaskPromptFields" -Template GenericList -Url "Lists/TaskPromptFields"

Add-PnPField -List "TaskPromptFields" -DisplayName "CType" -InternalName "CType" -Type Text -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "ResultValue" -InternalName "ResultValue" -Type Text -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "FieldInternalName" -InternalName "FieldInternalName" -Type Text -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "FieldTitle" -InternalName "FieldTitle" -Type Text -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "FieldType" -InternalName "FieldType" -Type Text -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "Required" -InternalName "Required" -Type Boolean -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "SortOrder" -InternalName "SortOrder" -Type Number -AddToDefaultView
Add-PnPField -List "TaskPromptFields" -DisplayName "Enabled" -InternalName "Enabled" -Type Boolean -AddToDefaultView
```

### 3.2. Описание колонок

| Колонка | Тип SP | Что писать | Пример |
|---|---|---|---|
| `Title` | Text | Человеко-итаемое имя (опц.) | `Найдена → Location1 (req)` |
| `CType` | Text (full `0x0108...`) | ContentTypeId из существующего CT. Пусто = global default | `0x0108003365C4474CAE8C42BCE396314E88E51F0001A4ABEEA9CB93478EEBA71D023E4D0700E86894FD720BCD49A61B7F23B3CFB36E` |
| `ResultValue` | Text | Нормализованный choice из Result-поле (lowercase). `*` = wildcard | `Найдена` / `Не найдена` / `*` |
| `FieldInternalName` | Text | Внутреннее имя поля в списке Tasks. Должно существовать! | `Location1` / `Comment` / `ScanCode` |
| `FieldTitle` | Text | Заголовок, который увидит пользователь | `Где найдена ЕО?` |
| `FieldType` | Text | `text` (default) или `multiline` | `multiline` |
| `Required` | Yes/No | Обязательное ли поле | `Да` |
| `SortOrder` | Number | Порядок отрисовки (ASC) | `10`, `20`, `30` |
| `Enabled` | Yes/No | Включено ли (фильтр) | `Да` |

### 3.3. Примеры конфигов

**Пример 1: для задачи «Поиск ЕО» (CT=A), результат «Найдена» — два поля**

| CType | ResultValue | FieldInternalName | FieldTitle | FieldType | Required | SortOrder | Enabled |
|---|---|---|---|---|---|---|---|
| `0x010800...AAA` | `Найдена` | `Location1` | Где найдена ЕО? | multiline | Да | 10 | Да |
| `0x010800...AAA` | `Найдена` | `Comment` | Комментарий | text | Нет | 20 | Да |

Что увидит пользователь: при клике «Найдена» появляется inline-форма с **обязательным** многострочным `Location1` и **необязательным** `Comment`. Submit не пройдёт без `Location1`.

**Пример 2: для всех CT и результатов — дефолтное поле**

| CType | ResultValue | FieldInternalName | FieldTitle | FieldType | Required | SortOrder | Enabled |
|---|---|---|---|---|---|---|---|
| *(пусто)* | `*` | `Location1` | Местоположение (default) | text | Нет | 10 | Да |

Применяется ко всем парам `(CT, ResultValue)` для которых нет per-CT правила.

**Пример 3: per-CT «Не найдена» с обязательной причиной**

| CType | ResultValue | FieldInternalName | FieldTitle | FieldType | Required | SortOrder | Enabled |
|---|---|---|---|---|---|---|---|
| `0x010800...BBB` | `Не найдена` | `Reason` | Причина отсутствия | multiline | Да | 10 | Да |

### 3.4. Дедупликация

Если в списке случайно два item с одинаковой тройкой `(CType, ResultValue, FieldInternalName)` — выигрывает тот, у которого **больше `SortOrder`**. Это сделано чтобы админ мог переопределить настройку, добавив новую запись с тем же ключом и более высоким SortOrder. Дубли с **одинаковым** SortOrder — последний по позиции в ответе сервера выигрывает.

---

## 4. Список `TaskResultDefinitions` — расширение

`TaskResultDefinitions` уже использовался для управления Additional Actions (поля `ShowAdditionalActions`, `AdditionalsActionsRequired`). Теперь он дополнительно контролирует:

### 4.1. Новые и переведённые в primary поля

| Колонка | Тип SP | Назначение | Статус |
|---|---|---|---|
| `Color` | Text | MUI color name: `success`/`error`/`warning`/`primary`/`inherit`/`info` | legacy → **primary** |
| `Variant` | Text | MUI variant: `contained`/`outlined`/`text` | legacy → **primary** |
| `Gradient` | Text (multi-line) | CSS `linear-gradient(...)` | legacy → **primary** |
| **`RequiresConfirm`** | Yes/No | Показать confirm-модалку перед submit | **новое** |

### 4.2. Graceful degradation

Если в существующем tenant-списке нет колонок `RequiresConfirm` / `Color` / `Variant` / `Gradient` — код автоматически сделает fallback `$select` без них (graceful 400 → упрощённый запрос). Списку ничего не сломается.

### 4.3. Пример: расширенная запись

| CType | ResultValue | ShowAdditionalActions | AdditionalsActionsRequired | **RequiresConfirm** | **Color** | **Gradient** | SortOrder | Enabled |
|---|---|---|---|---|---|---|---|---|
| `0x010800...A` | `Не найдена` | Нет | Нет | **Да** | error | `linear-gradient(180deg, #e53935 0%, #b71c1c 100%)` | 10 | Да |
| `0x010800...A` | `Найдена` | Да | Нет | Нет | success | `linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)` | 20 | Да |

### 4.4. Тонкий момент: `RequiresConfirm` авторитетен

Если в SP выставлено `RequiresConfirm=Нет` — это **отключает** confirm-модалку для этого `(CType, ResultValue)`, даже если в `resultConfig.js` для строки `не найдена` стоит `confirm: true`. То же для `RequiresLocation` через inline-режим. Явные значения из SP имеют приоритет над hardcoded fallback.

> Поле `RequiresLocation` в самом `TaskResultDefinitions` намеренно **не добавлено**: вся логика promptable-полей ушла в `TaskPromptFields`, чтобы не дублировать.

---

## 5. Список `TaskActionDefinitions` — Additional Actions (без изменений)

### 5.1. Напоминание: что он делает

`TaskActionDefinitions` управляет **списком доступных Additional Actions** и их **значением по умолчанию** per `(ContentType × ActionValue)`. Не путать с `TaskResultDefinitions` (которая решает **когда** показывать поле Additional Actions).

### 5.2. Структура (уже существующая)

| Колонка | Тип | Назначение |
|---|---|---|
| Title | Text | Человеко-итаемое имя (используется как value для MultiChoice) |
| CType | Text | ContentTypeId. Пусто = global default |
| ActionId | Text | Внутренний идентификатор (legacy) |
| Default | Yes/No | Pre-selected по умолчанию для этого CT |
| SortOrder | Number | Порядок отрисовки в multiselect |
| Enabled | Yes/No | Фильтр |

### 5.3. Полный flow Additional Actions (как работает сейчас)

```
1. TaskCard inline-mode открывается по клику на результат
   ↓
2. TaskResultDefinitions для (CT, ResultValue):
   - ShowAdditionalActions=Да → показать поле AdditionalActionsField
   - ShowAdditionalActions=Нет → скрыть поле (если Да=false или поле отсутствует)
   ↓
3. TaskActionDefinitions для CT:
   - Если есть записи → choices берутся ОТСЮДА, без field-defaults
   - Если пусто → choices берутся из поля AdditionalActions списка Tasks
   ↓
4. TaskActionDefinitions.Default=Да для CT → preselect в AdditionalActionsField
   ↓
5. На submit:
   - Если хоть один action выбран → AdditionalsActionsRequired=Да (boolean или string в зависимости от типа)
   - Если ни один → AdditionalsActionsRequired=Нет
   ↓
6. Полезная нагрузка payload:
   - payload.AdditionalsActionsRequired = boolean/string
   - payload.AdditionalActions = { __metadata: Collection(Edm.String), results: [...] }
```

### 5.4. Пример: «Отправить ЕО в OTM» как default для Поиска ЕО

| CType | Title | ActionId | Default | SortOrder | Enabled |
|---|---|---|---|---|---|
| `0x010800...AAA` | Отправить ЕО в OTM | send_eo_to_otm | Да | 10 | Да |
| `0x010800...AAA` | Перебрать | repack | Нет | 20 | Да |
| `0x010800...AAA` | Исправить ошибку | fix_failure | Нет | 30 | Да |

При открытии задачи этого CT пользователь увидит поле «Дополнительные действия» с тремя вариантами, причём «Отправить ЕО в OTM» будет автоматически выбран.

### 5.5. Связка трёх списков: практический кейс

**Кейс: «Админ хочет для задачи Поиск ЕО при результате “Найдена” показывать поле Location1 (обязательное) и список Additional Actions с “Отправить ЕО в OTM” pre-selected».**

Настройки:

**TaskResultDefinitions** — одна запись:

| CType | ResultValue | ShowAdditionalActions | AdditionalsActionsRequired | Color | Gradient |
|---|---|---|---|---|---|
| `0x010800...AAA` | `Найдена` | Да | Нет | success | `linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)` |

**TaskPromptFields** — две записи:

| CType | ResultValue | FieldInternalName | FieldTitle | FieldType | Required | SortOrder |
|---|---|---|---|---|---|---|
| `0x010800...AAA` | `Найдена` | `Location1` | Где найдена ЕО? | multiline | Да | 10 |

**TaskActionDefinitions** — записи с `Default=Да`:

| CType | Title | ActionId | Default | SortOrder |
|---|---|---|---|---|
| `0x010800...AAA` | Отправить ЕО в OTM | send_eo_to_otm | Да | 10 |

**Результат:** пользователь видит:
- Inline-форму с Location1 (обязательное, multiline)
- Поле Additional Actions со списком choices из TaskActionDefinitions + «Отправить ЕО в OTM» pre-selected
- Кнопку «Сохранить — Найдена» с зелёным градиентом

Submit отправляет:
```json
{
  "[ResultField]": "Найдена",
  "ResultSearchTHU": "Найдена",
  "Location1": "<введённое пользователем>",
  "AdditionalsActionsRequired": false,
  "AdditionalActions": { "results": ["Отправить ЕО в OTM"] },
  "Status": "Завершена",
  "PercentComplete": 1
}
```

---

## 6. Диагностика

### 6.1. Проверить, что SP-списки существуют

В браузере: `https://tenant.sharepoint.com/sites/yoursite/_api/web/lists/getbytitle('TaskPromptFields')/items?$top=1`

Если 404 — список не создан. Если 200 — список есть, items пустой.

### 6.2. Диагностические команды в консоли браузера

```javascript
// Поля списка TaskPromptFields
window.__debugTaskPromptFields().then(() => {})

// Поля списка TaskResultDefinitions
window.__debugTaskResultDefs().then(() => {})

// Поля списка TaskActionDefinitions (через UI: settings UI TaskCard chrome)
window.__debugTaskActionDefinitions && window.__debugTaskActionDefinitions()
```

### 6.3. Debug-флаги в URL

| Флаг | Что делает |
|---|---|
| `?dbg=1` | Расширенные console.log (resolvePromptFields, fetch, merge логика) |
| `?configWarn=1` | Показать `ConfigFallbackBanner` если оба SP-списка вернули 404 |
| `localStorage.setItem('dbg', '1')` | То же что `?dbg=1`, persistent |

### 6.4. Очистить кэш конфигурации

```javascript
// В консоли браузера
sessionStorage.removeItem('sp:taskPromptFields:map:v1');
sessionStorage.removeItem('sp:taskPromptFields:at:v1');
sessionStorage.removeItem('sp:taskResultDefs:map:v5');
sessionStorage.removeItem('sp:taskResultDefs:at:v5');
location.reload();
```

Кэш живёт 30 минут, версионируется ключом (`v1`, `v5`). При изменении схемы списка нужно бампнуть ключ в коде или очистить вручную.

---

## 7. Типичные сценарии

### 7.1. Добавить новое promptable-поле без правки кода

Задача: для задачи «Доставка» (CT=D), результат «Доставлено», попросить пользователя ввести номер накладной.

1. Убедиться, что в списке Tasks есть колонка `WaybillNumber` (если нет — создать site column через SP UI).
2. В `TaskPromptFields` создать запись:
   - `CType = 0x010800...DDD`
   - `ResultValue = Доставлено`
   - `FieldInternalName = WaybillNumber`
   - `FieldTitle = Номер накладной`
   - `FieldType = text`
   - `Required = Да`
   - `SortOrder = 10`
3. Готово. Без перезапуска приложения — после reload (или автоматически через 30м кэш обновится).

### 7.2. Сделать результат обязательным с подтверждением

Задача: для «Отклонено» показывать confirm-модалку «Вы уверены, что хотите отклонить?»

В `TaskResultDefinitions`:
- `CType = 0x010800...AAA`
- `ResultValue = Отклонено`
- `RequiresConfirm = Да`

### 7.3. Отключить показ Location1 для кастомного ResultValue

Задача: для CT=B результат «Найдена в зоне» НЕ показывать Location1 (потому что location уже был введён ранее).

В `TaskPromptFields`: НЕ создавать запись для `(CT=B, ResultValue=Найдена в зоне)`. Если есть wildcard `ResultValue=*` — он применится, но только если нет per-CT правила.

Лучше: в `TaskPromptFields` создать явную запись с `Enabled=Нет`:
- `CType = 0x010800...BBB`
- `ResultValue = Найдена в зоне`
- `FieldInternalName = _none_`
- `Enabled = Нет`

Или просто убедиться, что для `(CT=B, ResultValue=Найдена в зоне)` нет записей и wildcard тоже не описан.

### 7.4. Переопределить default actions per CT

Задача: для CT=A pre-select «Исправить ошибку» вместо «Отправить ЕО в OTM».

В `TaskActionDefinitions`:
- Все записи для этого CT с `Default=Нет`
- Одна запись с `(CType=A, Title=Исправить ошибку, Default=Да, SortOrder=10)`

### 7.5. Использовать кастомное поле в Additional Actions

Если нужен **отдельный** MultiChoice field (например, для CT=B должно использоваться `SearchAdditionalActions` вместо `AdditionalActions`):

> ⚠ Это пока **НЕ** реализовано в этом PR-е. `TaskTypeConfiguration` (план §17) DISABLED до аудита. Документация для этой фичи появится после решения по `docs/audit/content-types.md`.

---

## 8. Acceptance criteria для развёртывания

### 8.1. Перед мерджем

- [ ] Список `TaskPromptFields` создан с правильными колонками (см. §3.1).
- [ ] Если раньше `TaskResultDefinitions` уже использовался, **бэкап** существующих записей (особенно если в нём были `Color` / `Variant` / `Gradient`).
- [ ] `FieldInternalName` в `TaskPromptFields` — это валидное поле в списке Tasks. Проверка: `https://tenant.sharepoint.com/sites/yoursite/_api/web/lists/getbytitle('Tasks')/fields?$filter=InternalName eq 'WAYBILLNUMBER'`.

### 8.2. Smoke-тест после мерджа

1. Открыть задачу CT=A, in-progress.
2. Нажать «Найдена».
3. Должна появиться inline-форма с Location1 (если в `TaskPromptFields` есть запись `(CT=A, ResultValue=Найдена, FieldInternalName=Location1)`).
4. Submit без заполнения Location1 → ошибка «Заполните обязательные поля».
5. Submit с заполненным Location1 → задача завершается, в payload виден `Location1: "..."`.
6. Открыть задачу CT=B (другой CT) → inline-форма **не** показывает Location1 (если per-CT правила нет), либо показывает по другим правилам.

### 8.3. Проверка graceful fallback

1. Удалить (или скрыть) список `TaskPromptFields` в tenant.
2. Reload приложения с `?configWarn=1`.
3. Должен появиться banner «⚠ Конфигурация UI из SharePoint не загружена».
4. Legacy поведение: для ключа «найдена» показывается **одно** поле Location1.

### 8.4. Проверка override-семантики

1. Создать запись в `TaskResultDefinitions`: `(CT=A, ResultValue=Найдена, RequiresConfirm=Нет)`.
2. В `resultConfig.js` оставить `requiresLocation: true` для «найдена».
3. Завершить задачу CT=A с результатом «Найдена» → Location1 inline показывается (не LocationDialog), `RequiresConfirm=Нет` honored.

---

## 9. Что НЕ реализовано в этом PR-е

| Что | Где задокументировано | Когда делать |
|---|---|---|
| Кастомные `Total Actions` поля per-CT (например, `SearchAdditionalActions`) | `TaskTypeConfiguration` (план §17) | После аудита `docs/audit/content-types.md` |
| Произвольные типы полей (date / user / lookup) | `TaskPromptFields.FieldType` | Отдельный PR — расширение enum |
| Визуальный editor для gradient/colors | — | Out of scope |
| 3 action-кнопки (Take/Save/NotFound) хардкоженные градиенты | `TaskCard.jsx` | User решение — оставлено |
| Bulk import через CSV | — | Out of scope (admin вручную или через PnP) |
| Inline-режим vs LocationDialog унификация | — | Отдельный PR |

---

## 10. Контакты

При проблемах:

1. Проверить `?dbg=1` в браузере → смотреть `[DBG:taskPromptFields:fetch]`, `[DBG:TaskCard:showAA]`, `[DBG:TaskCard:resolvedFields]`.
2. Проверить `Network` в DevTools → фильтр `TaskPromptFields` / `TaskResultDefinitions` → смотреть URL запроса.
3. Если ошибка 400 — смотреть тело ответа, там будет указано какое поле не существует.
4. Если ошибка 404 — список не создан в tenant.
5. Если ошибка 401 — нет прав на чтение списка (нужен SharePoint reader permission для текущего пользователя).