# `TaskBehaviour` — настройка поведения Result-кнопок через SharePoint

> Версия: 2026-09-28. Шпаргалка для админа.

## Что это такое

`TaskBehaviour` — список SharePoint, в котором админ хранит **компактный JSON** для каждого типа задач. Резолвер в `TaskCard.jsx` маппит **`ContentType.Name` → `TaskBehaviour.Title`** (нормализованно: trim + lowercase), без участия lookup-полей — SharePoint не позволяет задать default-значение для lookup на ContentType, поэтому архитектура — по имени.

## Схема списка `TaskBehaviour`

| Поле | Тип | Что хранит |
|------|------|-----------|
| `Title` | Single line of text | Имя конфига; **должно совпадать с `ContentType.Name`** (например «Исправление проблемной ЕО») |
| `Behaviour` | Multiple lines of text (unlimited) | Компактный JSON с правилами по choice |
| `StylingResultButton` | Multiple lines of text (unlimited) | Компактный JSON со стилями MUI-кнопок |
| `Description` | Single line of text (опц.) | Комментарий |
| `Enabled` | Yes/No | Включён ли конфиг (если Нет — фолбэк на legacy) |

Создать список + поля идемпотентно одной командой:
```
node scripts/grant-task-behaviour-list.cjs
```

Lookup-поле на CT **не нужно** — оно не работает с default-значением. Маппинг через Name достаточно.

## Как заводится запись для CT

1. Откройте SP UI → `TaskBehaviour` → New item
2. **Title** — точное имя CT (например `Исправление проблемной ЕО`). Можно скопировать из списка CT: `Tasks → List Settings → Content types → Имя_CT`
3. **Behaviour / StylingResultButton** — JSON (см. ниже)
4. Save → новая карточка автоматически подхватывается фронтом за ≤30 с (fingerprint)

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
2. DevTools → Console — должны появиться forced debug-логи:
   ```
   [DBG:taskBehaviour:fetch] parsed { resultsCount: N, byConfigIdSize: N, fingerprint: "..." }
   [DBG:resolveTaskBehaviourByName] ctName="Исправление проблемной ЕО", matchedTitle="Исправление проблемной ЕО", configId=…
   ```
3. На задаче нужного CT нажмите Result-кнопку → должно появиться inline-поле с типом из `Behaviour.p`
4. Если `Behaviour.c=true` — перед submit появится confirm-модалка

## Миграция с legacy

```
node scripts/migrate-ct-behaviour.cjs --dry-run    # посмотреть, что сгенерируется
node scripts/migrate-ct-behaviour.cjs --apply      # создать записи в TaskBehaviour (Title === "<CT.Id> — поведение (миграция)")
```

После `--apply` запись создаётся в `TaskBehaviour`, но `Title` будет в формате `0x010800… — поведение (миграция)` — это **не совпадёт** с `ContentType.Name`. Переименуйте вручную через SP UI (или скриптом), чтобы `Title` стал равен `ContentType.Name` — только тогда маппинг сработает.

## Если что-то сломалось

- `Behaviour` JSON битый → console warning + legacy UI (админ ничего не замечает)
- `TaskBehaviour` отсутствует (404) → fingerprint-проверка возвращает null → фронт поднимает legacy-слои
- `Title` не совпадает с `ContentType.Name` → legacy UI
- Запись `Enabled = Нет` → legacy UI
- `__taskBehaviourForceRefresh()` в DevTools console — мгновенный refresh без ожидания TTL

## Что остаётся в legacy

- `TaskResultList` — управляет `AdditionalActions` (`ShowAdditionalActions` / `AdditionalsActionsRequired`). Новые правки AA остаются здесь.
- `TaskPromptFields` — legacy-фолбэк для тех CT, у которых ещё нет записи в `TaskBehaviour`.
- `RESULT_UI_CONFIG` в `src/tasks/resultConfig.js` — захардкоженный дефолт для legacy строк («найдена» / «не найдена»). Последний рубеж.