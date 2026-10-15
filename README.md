# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.dev/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://swc.rs/) uses [SWC]( for Fast Refresh

## Переменные окружения

Кладутся в `.env` (или `.env.local`) в корне проекта.

| Переменная | Где читается | Зачем |
| --- | --- | --- |
| `VITE_AG_GRID_LICENSE_KEY` | `features/dob/components/DobGrid.jsx` | Ключ лицензии AG Grid **Enterprise** — включает группировку строк, Set-фильтры (выбор значений), панели «Колонки»/«Фильтры», меню колонки, буфер обмена и экспорт Excel в `#dob_requests`. Без ключа всё это работает в триальном режиме, но грид показывает водяной знак «License Key Not Found». |
| `VITE_PROXY_BASE_URL` / `VITE_SP_SITE` / `VITE_SHAREPOINT_URL` | `vite.config.ts` | Адрес основного сайта SharePoint для dev-прокси `/api`. |
| `VITE_DOB_SITE` | `vite.config.ts` | Адрес сайта ДОБ для dev-прокси `/dob-api`. |

## Таблица `#dob_requests` — AG Grid Enterprise

Своих фильтров и переключателей в шапке нет: фильтрацию, группировку и
закрепление колонок пользователь настраивает интерфейсом самого грида
(`features/dob/components/DobGrid.jsx`, модули `ag-grid-enterprise`).

| Возможность | Как доступна пользователю |
| --- | --- |
| Группировка строк (по умолчанию — по статусу) | панель «Колонки» → «Группы строк»; группа сворачивается кликом по шеврону |
| Свернуть/развернуть ВСЕ группы | кнопки над таблицей (иконки ⌄ / ⌃) и встроенные пункты AG Grid в контекстном меню — «Развернуть все группы» / «Свернуть все группы» (`api.expandAll()` / `api.collapseAll()`) |
| Агрегации | панель «Колонки» → «Значения» (сумма/среднее/мин/макс/количество): результат показывается в строке группы, даже если группа раскрыта |
| Set-фильтр: выбор значений галочками | воронка в заголовке колонки, панель «Фильтры», правый клик → «Фильтр» |
| Показ/скрытие, порядок и ширина колонок | панель «Колонки», меню колонки, перетаскивание заголовков |
| Закрепление колонок слева/справа | панель «Колонки», меню колонки → «Закрепить слева/справа», drag |
| Сохранение настроек | автоматически: колонки, фильтры, группы, агрегаты, сортировка, панели — в `localStorage` (ключ `dob:grid-state:dob_requests`); сброс — правый клик → «Сбросить настройки таблицы» или иконка ↺ над таблицей |
| Колонка «Тип контента» | имя типа контента заявки (из его `Description`), рядом с «Названием» |
| Поля людей (User/UserMulti) | ФИО с иконкой человека, несколько участников — через запятую, как в таблице задач |
| Строка состояния | внизу: строки, выделено, сумма/среднее/количество/мин/макс по выделению |
| Номера строк, выделение диапазоном, копирование | колонка номеров, Shift+клик, Ctrl+C / Ctrl+V |
| Экспорт в Excel/CSV | правый клик → «Экспорт» |
| Русская локаль | `localeText` в `lib/agGridLocaleRu.js` — переведены фильтры, меню, панели, строка состояния, пагинация |

Чекбоксов выделения в таблице нет: строка выделяется кликом, «Открыть» в шапке
работает от выделенной строки.

Стартовое состояние таблицы: группировка по статусу и сортировка по «Создана» ↑.
**Стартового фильтра по статусу нет** — показываем все заявки, фильтр
пользователь ставит сам. Если у пользователя есть сохранённые настройки —
применяются они.

Режим группировки — `groupDisplayType: 'singleColumn'` (с колонкой группы
слева). При `'groupRows'` строка группы рисуется полноширинной полосой без
ячеек по колонкам, поэтому агрегатам по группам негде было показаться.

В npm-пакете `ag-grid-community` 33.3.2 готовых переводов нет (ни
`dist/locales/*`, ни `AG_GRID_LOCALE_*`), поэтому русские строки заданы своим
словарём; ключи взяты из самих бандлов AG Grid, чтобы не ошибиться в имени.

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
| RequiresConfirmed | Yes/No | Показать confirm-модалку перед submit |
| Color | Text | MUI color (`success`/`error`/`warning`/`primary`/`inherit`) |
| Variant | Text | MUI variant (`contained`/`outlined`/`text`) |
| Gradient | Text | CSS `linear-gradient(...)` |
| SortOrder | Number | Порядок |
| Enabled | Yes/No | Фильтр |

Пример записи:

| CType | ResultValue | ShowAdditionalActions | RequiresConfirmed | Color | Gradient |
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