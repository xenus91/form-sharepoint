# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.dev/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://swc.rs/) uses [SWC]( for Fast Refresh

## Конфигурация UI из SharePoint

Список ниже управляется через два SharePoint-списка в tenant — без правки React-кода.

### `TaskResultDefinitions` (план §14)

Поля списка:

| Поле | Тип | Назначение |
|---|---|---|
| Title | Text | Человеко-итаемое имя |
| CType | Text (full `0x0108...`) | ContentTypeId |
| ResultValue | Text | Нормализованный choice (lowercase) |
| ShowAdditionalActions | Yes/No | Показывать AdditionalActionsField |
| AdditionalsActionsRequired | Yes/No | Required для AdditionalActions (legacy `AdditionalActionsRequired` авто-резолвится) |
| RequiresConfirm | Yes/No | Показать confirm-модалку перед submit |
| Color | Text | MUI color (`success`/`error`/`warning`/`primary`/`inherit`) |
| Variant | Text | MUI variant (`contained`/`outlined`/`text`) |
| Gradient | Text | CSS `linear-gradient(...)` |
| SortOrder | Number | Порядок |
| Enabled | Yes/No | Фильтр |

Пример записи:

| CType | ResultValue | ShowAdditionalActions | RequiresConfirm | Color | Gradient |
|---|---|---|---|---|---|
| `0x0108...A` | Не найдена | Нет | Да | error | `linear-gradient(180deg, #e53935 0%, #b71c1c 100%)` |

Graceful 404 → fallback на `src/tasks/resultConfig.js`. Banner при `?configWarn=1`.

### `TaskPromptFields` (⭐ PR)

Произвольный список полей для заполнения per `(CType × ResultValue)`. Позволяет без правки кода добавлять новые поля (Location1, Comment, ScanCode, любой site column).

Поля списка:

| Поле | Тип | Назначение |
|---|---|---|
| CType | Text (full `0x0108...`) | ContentTypeId. Пусто = global default |
| ResultValue | Text | Нормализованный choice. `*` = wildcard |
| FieldInternalName | Text | InternalName поля в списке Tasks (например `Location1`) |
| FieldTitle | Text | Заголовок для UI |
| FieldType | Text (`text` / `multiline`) | Default `text` |
| Required | Yes/No | Обязательно ли поле |
| SortOrder | Number | Порядок |
| Enabled | Yes/No | Фильтр |

Пример конфига для задачи «Поиск ЕО» (CT=A) с результатом «Найдена»:

| CType | ResultValue | FieldInternalName | FieldTitle | FieldType | Required | SortOrder |
|---|---|---|---|---|---|---|
| `0x0108...A` | Найдена | `Location1` | Где найдена ЕО? | multiline | Да | 10 |
| `0x0108...A` | Найдена | `Comment` | Комментарий | text | Нет | 20 |

Без правки React: при выборе «Найдена» рендерит два inline-поля, валидирует Required, отправляет в MERGE-payload.

**Приоритеты резолвера:** exact CT → prefix CT (родительский ContentType) → CT wildcard → global wildcard → global exact → `[]`. **Без substring-match.**

Graceful 404 → fallback на `resultConfig.js` (одно legacy-поле Location1 для «найдена»).

### Отладка

- `?dbg=1` или `localStorage.setItem('dbg','1')` — extended console.log
- `?configWarn=1` — показать `ConfigFallbackBanner` если оба SP-списка вернули 404
- В консоли: `window.__debugTaskResultDefs()`, `window.__debugTaskPromptFields()` — диагностика полей и items

### Out of scope

- 3 action-кнопки («Взять в работу», «Сохранить», «ЕО не найдена») — хардкоженные градиенты в `TaskCard.jsx`
- `TaskTypeConfiguration` (план §17) — DISABLED до аудита