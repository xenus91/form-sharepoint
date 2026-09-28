# `TaskBehaviour` — настройка поведения Result-кнопок через SharePoint

> Версия: 2026-09-28 (v8+: defaults-политика ужесточена). Шпаргалка для админа.

## Что это такое

`TaskBehaviour` — список SharePoint, в котором админ хранит **компактный JSON** для каждого типа задач. Резолвер в `TaskCard.jsx` маппит **`ContentType.Name` → `TaskBehaviour.Title`** (нормализованно: trim + lowercase), без участия lookup-полей — SharePoint не позволяет задать default-значение для lookup на ContentType, поэтому архитектура — по имени.

## Принцип defaults (ужесточён в v8+)

Если в `TaskBehaviour` для CT × choice ничего не настроено:
- `foundChoice` matcher срабатывает **только** если `Behaviour.promptFields.length > 0` или `Behaviour.aa = true`, либо если в `TaskResultDefinitions.ShowAdditionalActions = true` для этого choice (legacy для `AdditionalActions`)
- `notFoundChoice` matcher срабатывает **только** если `Behaviour.c = true`
- Цвета кнопки — **plain MUI defaults** (`variant=contained`, `color=primary`, без gradient). Никаких цветов из `TaskResultDefinitions.Color/Variant/Gradient`, никаких хардкодов из `resultConfig.js`
- Анимация при submit — **flow default** (для foundChoice — `celebrate`, для notFoundChoice — `sherlock`, для extras — none)

Если настройки нет — отображается plain MUI Button с прямым submit, никаких кастомов сверх исходного legacy-поведения. Любая прошлая запись в `TaskResultDefinitions.Color/Variant/Gradient` или захардкоженная реакция "не найдена" → confirm=true **больше не применяется** без явной настройки в `TaskBehaviour`.

## Схема списка `TaskBehaviour`

| Поле | Тип | Что хранит |
|------|------|-----------|
| `Title` | Single line of text | Имя конфига; **должно совпадать с `ContentType.Name`** (например «Исправление проблемной ЕО») |
| `Behaviour` | Multiple lines of text (unlimited) | Компактный JSON с правилами per choice |
| `StylingResultButton` | Multiple lines of text (unlimited) | Компактный JSON со стилями MUI-кнопок |
| `Description` | Single line of text (опц.) | Комментарий |
| `Enabled` | Yes/No | Включён ли конфиг (если Нет — фолбэк на plain MUI) |

Создать список + поля идемпотентно одной командой:
```
node scripts/grant-task-behaviour-list.cjs
```

Lookup-поле на CT **не нужно** — оно не работает с default-значением. Маппинг через Name достаточно.

## Что остаётся в legacy (источник для отдельных аспектов)

| Аспект | Источник | Когда применяется |
|--------|---------|-------------------|
| Prompt-поля по choice | `TaskBehaviour.behaviour` (p) | ВСЕГДА через Behaviour |
| Цвета кнопки | `TaskBehaviour.styling` | ВСЕГДА через Behaviour |
| Confirm-модалка перед submit | `TaskBehaviour.behaviour.c` | ВСЕГДА через Behaviour |
| Анимация при submit | `TaskBehaviour.behaviour.anim` | ВСЕГДА через Behaviour |
| AdditionalActions (`showAdditionalActions` / `additionalActionsRequired`) | `TaskResultDefinitions` | Если Behaviour.aa не задан — legacy fallback (ваше решение) |
| Поля результата задачи (ResultSearchTHU/ResultFixingProblems/etc.) | `resultField.js` | Определяются динамически по ContentType |

## Как заводится запись для CT

1. Откройте SP UI → `TaskBehaviour` → New item
2. **Title** — точное имя CT (например `Исправление проблемной ЕО`). Можно скопировать из списка CT: `Tasks → List Settings → Content types → Имя_CT`
3. **Behaviour / StylingResultButton** — JSON (см. ниже)
4. Save → после истечения cache TTL (30 минут) или ручного `window.__taskBehaviourForceRefresh()` конфигурация загрузится заново. При обычной работе список запрашивается один раз и берётся из sessionStorage-кэша.

Если CT был переименован в SP — нужно переименовать и `Title` записи `TaskBehaviour`, иначе маппинг перестанет работать.

## Схема JSON `Behaviour`

Ключи — однобуквенные сокращения. Ключ `_default` — правила для любого choice, не описанного явно. Ключ `*` — явный wildcard.

```jsonc
{
  "_default": {},
  "Исправлено": {
    "p": [
      { "f": "CommentResult", "ti": "Комментарий", "t": "text", "r": false }
    ],
    "c": false,
    "aa": false,
    "aar": false
  },
  "Не исправлено": {
    "p": [
      { "f": "CommentResult", "ti": "Комментарий по неисправлению", "t": "text", "r": true }
    ],
    "c": true
  }
}
```

> ⚠️ Включайте в `Behaviour` только те choice, для которых хотите нестандартное поведение. Если вам НЕ нужен prompt для «Исправлено» — просто не пишите `"Исправлено"` в JSON. Не задавайте правила «на всякий случай».

### Ключи внутри одного choice

| Ключ | Что делает | Дефолт |
|------|------------|--------|
| `p` | Массив prompt-полей, которые запросить inline | `[]` |
| `c` | Показать confirm-модалку перед submit (`RequiresConfirmed`) | `false` |
| `aa` | Показать `AdditionalActionsField` inline | `false` |
| `aar` | Сделать `AdditionalActions` обязательным | `false` |
| `anim` | Анимация при submit (см. ниже) | flow default |
| `ct` | Заголовок confirm-модалки (при `c: true`) | «Подтверждение» |
| `cm` | Текст confirm-модалки | «Вы уверены, что хотите завершить задачу #N как «X»? …» |
| `ok` | Текст кнопки подтверждения | «Подтвердить» |
| `no` | Текст кнопки отмены | «Отмена» |

### Поля из связанного элемента (`rf`)

`rf` — список полей **связанного элемента** (`RelatedItems` → элемент ProblemsPallet), которые нужно
показать в карточке задачи под текстом (Body). Правило берётся из `_default` (или `*` / `_card`) —
это карточная настройка, она не зависит от выбранного результата.

```jsonc
"_default": {
  "rf": [
    { "f": "THU", "ti": "ЕО" },
    { "f": "Recipient/SCNumberText", "ti": "Получатель" },
    { "f": "Location1", "ti": "Место" }
  ]
}
```

Короткая запись — массивом строк (тогда подпись = имя поля):

```jsonc
"_default": { "rf": ["THU", "DC_THU"] }
```

| Ключ | Что делает |
|------|------------|
| `f` | Путь к полю: `THU` или lookup `Recipient/SCNumberText` (для lookup автоматически добавляется `$expand`) |
| `ti` | Подпись в карточке (по умолчанию = `f`) |

Как это работает (расположение в карточке):

- значения выводятся **в шапке карточки** — плитками «подпись + значение» («ЕО: 123…», «Получатель: SC-001»);
- ниже шапки идут **заголовок** (Title) и **описание** (Body); если Body начинается с Title, дубль убирается;
- если `rf` не задан, в шапке остаётся прежняя строка «ТК … • ЕО …».

Как это работает (загрузка):

- значение берётся из первого элемента `RelatedItems` задачи;
- пустые значения не показываются;
- запросы склеиваются в батч (до 30 Id в одном `$filter`) и кэшируются на 5 минут;
- если поле не существует в списке, оно просто не отображается — остальные поля продолжают работать.

### Анимация при submit (`anim`)

Если ключ `anim` не задан в Behaviour, используется plain submit без анимации. Для `celebrate` можно настроить текст и emoji объектом:

```json
"Исправлено": {
  "p": [],
  "c": false,
  "anim": {
    "type": "celebrate",
    "title": "Задача исправлена",
    "text": "Результат сохранён",
    "emoji": "🎉"
  }
}
```

| Значение | Поведение |
|----------|-----------|
| `"celebrate"` | Зеленая круговая анимация с текстом «Задача исправлена» и «Результат сохранён» (1.6с) |
| `"sherlock"` | Красная анимация; использовать только если она явно нужна |
| `"none"` | submit без анимации и без задержки |

У объекта `anim` поддерживаются поля `type` (или `a`), `title`, `text` (или `message`/`subtitle`) и `emoji`.

### Тексты confirm-модалки (`ct` / `cm` / `ok` / `no`)

Работают только вместе с `"c": true` — именно `c` открывает диалог перед submit:

```json
"Не исправлено": {
  "c": true,
  "ct": "Подтверждение результата",
  "cm": "Вы уверены, что хотите завершить задачу как «Не исправлено»?",
  "ok": "Подтвердить «Не исправлено»",
  "no": "Отмена"
}
```

Если какой-то из ключей не задан — используется дефолтный текст.

### Ключи внутри одного promptField

| Ключ | Что делает | Обязательно |
|------|------------|-------------|
| `f` | Internal name поля в списке Tasks | да |
| `ti` | Заголовок поля в UI | нет (по умолчанию = `f`) |
| `t` | Тип: `text` / `multiline` / `number` / `choice` | нет (по умолчанию `text`) |
| `r` | Обязательное | нет (по умолчанию `false`) |

> Примечание: для `AdditionalActions` (`ShowAdditionalActions` / `AdditionalsActionsRequired`) **по умолчанию правка в `TaskResultList`** (решение от 28.09.2026). Поля `aa` / `aar` в `Behaviour` — override, если задать их здесь, `Behaviour` побеждает.

## Схема JSON `StylingResultButton`

Ключ `_default` — стиль для любого choice, не описанного явно.

```jsonc
{
  "_default": { "bg": "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", "c": "#fff", "v": "ctd" },
  "Исправлено":     { "bg": "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)", "c": "#fff" },
  "Не исправлено":  { "bg": "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)", "c": "#fff" }
}
```

### Ключи

| Ключ | Что делает | Дефолт |
|------|------------|--------|
| `bg` | CSS background / background-image / gradient | нет |
| `c` | Цвет текста (CSS color) | нет |
| `v` | MUI variant: `ctd`=contained / `out`=outlined / `tx`=text | `ctd` |
| `i` | Имя MUI-иконки (на будущее; сейчас не рендерится) | нет |

Если `bg` задан — фон + автоматический hover `brightness(1.1)`. Никакого HTML — JSON парсится в JS, рендер через MUI `sx`.

## Проверка

1. Откройте `http://localhost:5173/#tasks`
2. Для временной диагностики откройте страницу с `?dbg=1` или установите `localStorage.dbg_tasks = "1"`. В Console появятся только сообщения TaskBehaviour:
   ```
   [TaskBehaviour] loaded { request: "...Enabled eq 1...", count: N, cache: "sessionStorage" }
   [TaskBehaviour] resolved { contentTypeName: "...", title: "...", id: N, behaviourOk: true, stylingOk: true }
   ```
   Без debug-флага приложение не пишет диагностические сообщения в Console.
3. На задаче нужного CT нажмите Result-кнопку → должно появиться inline-поле с типом из `Behaviour.p`
4. Если `Behaviour.c=true` — перед submit появится confirm-модалка

## Миграция с legacy

```
node scripts/migrate-ct-behaviour.cjs --dry-run    # посмотреть, что сгенерируется
node scripts/migrate-ct-behaviour.cjs --apply      # создать записи в TaskBehaviour (Title === "<CT.Id> — поведение (миграция)")
```

После `--apply` запись создаётся в `TaskBehaviour`, но `Title` будет в формате `0x010800… — поведение (миграция)` — это **не совпадёт** с `ContentType.Name`. Переименуйте вручную через SP UI (или скриптом), чтобы `Title` стал равен `ContentType.Name` — только тогда маппинг сработает.

## Если что-то сломалось

- `Behaviour` JSON битый → запись игнорируется для поведения, используется plain MUI UI
- `TaskBehaviour` отсутствует (404) → используется plain MUI UI
- список запрашивается одним GET; повторные компоненты используют React Query и sessionStorage-кэш
- `Title` не совпадает с `ContentType.Name` → legacy UI
- Запись `Enabled = Нет` → legacy UI
- `__taskBehaviourForceRefresh()` в DevTools console — мгновенный refresh без ожидания TTL

## Что остаётся в legacy

- `TaskResultList` — управляет `AdditionalActions` (`ShowAdditionalActions` / `AdditionalsActionsRequired`). Это единственный legacy-источник, который **продолжает действовать** как fallback. Все остальные legacy-источники (`TaskResultDefinitions.Color/Variant/Gradient`, `RequiresConfirmed`, захардкоженный `RESULT_UI_CONFIG` для «найдена»/«не найдена») **больше не применяются** для кнопок — только `Behaviour`.
- `TaskPromptFields` — больше не запрашивается фронтом (Behaviour — единственный источник prompt-полей).
- `RESULT_UI_CONFIG` в `src/tasks/resultConfig.js` — больше не влияет на UI кнопок. Оставлен в коде на случай миграций.