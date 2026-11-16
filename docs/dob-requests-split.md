# Как собрать приложение «Заявки ДОБ и задачи» (`xenus91/dob-requests`)

Рецепт переноса, проверенный практикой 2026-10-16: приложение было собрано по этому
плану целиком, тесты и сборка прошли. Документ написан так, чтобы повторить работу
с нуля в чистом клоне — без знания истории переписки.

## 0. Границы

| | `form-sharepoint` (этот репозиторий) | `dob-requests` (новый) |
| --- | --- | --- |
| Сайт | Образцово | `/sites/dob/doblogistic` |
| Реестр заявок ДОБ | — | `#dob_requests` |
| Формы задач ДОБ | — | `#dob_tasks` |
| Таблица задач | источник `main` | источник `dob` (`RequestsTask`) |
| Складские операции | остаются | — |
| Кросс-сайтовые запросы | запрещены | запрещены |

Старые хеши `#dob_*` должны работать **только** в новом приложении.

## 1. Заготовка

```sh
git clone https://github.com/xenus91/form-sharepoint.git dob-requests
cd dob-requests
git fetch origin arena/308d7369-form-sharepoint   # там лежит 58fe1b1
git checkout -b main 58fe1b1fca5a69a9071d7c04f9bf82056bdc3feb
git remote set-url origin https://github.com/xenus91/dob-requests.git
```

База `58fe1b1` — состояние с AG Grid Enterprise, русским UI, агрегациями и
сохранением состояния сетки (`gridStateStorage.js`, `GRID_STATE_VERSION='v3'`).

## 2. Удалить складскую часть

Файлы на удаление (проверить grep'ом, что на них ссылается только их тест):

```
src/ItemViewer.jsx
src/ManagerPreview.jsx
src/MonthlyCounter.jsx
src/RecipientAutocomplete.jsx
src/btngroupLocation.jsx
src/autoProblems.jsx
```

- `src/main.tsx` — точка входа: `QueryClientProvider` + `NotificationsProvider` +
  `<App/>`, без ItemViewer.
- `src/features/navigation/AppMenuDrawer.jsx` — 2 пункта: «Задачи», «Заявки ДОБ»
  (убрать `menu-item-form`, `menu-item-manager`).
- `src/features/navigation/__tests__/AppMenuDrawer.test.jsx` — порядок
  `["Задачи", "Заявки ДОБ"]` + отсутствие удалённых пунктов.
- В корне `src/` остаются: `App.jsx`, `NotificationsProvider.jsx`, `TasksView.jsx`,
  `main.tsx`, `theme.js` (см. §4).

## 3. Новый `src/App.jsx`

Оболочка вместо 2000-строчного склада. Обязанности:

1. Разбор хеша через `parseDobHash()` из `src/features/dob/lib/dobRoute.js`
   (экспорты: `DOB_REQUESTS_HASH`, `DOB_TASKS_HASH`, `isDobRequestList`,
   `buildDobRequestHash`, `buildDobTaskHash`, `buildDobItemHash`,
   `buildDobCreateHash`, `parseDobHash → {isDob, mode: "list"|"create"|"edit", id,
   listGuid, kind}`, `isLegacyDobRequestHash`, `toRequestsHash`).
2. Текущий пользователь — `useCurrentUser({propUserProfile, propCurrentUserId})`
   из `src/features/tasks/hooks/useCurrentUser.js`; при отсутствии пропсов хук сам
   берёт currentUserId/Title и Office/Department.
   Там же `useActiveTasksCount({currentUserId, distribution, enabled, intervalMs})`
   — для бейджа в меню.
3. Роуты: `#/` — карточки заявок с поиском; `#dob_requests` — реестр (AG Grid);
   `#dob_tasks?list=<guid>` — форма задачи; `#tasks` — таблица задач.
4. `<TasksView/>` — пропсы (`src/TasksView.jsx`, около строки 141):
   `userProfile, currentUserId, onBack, onTasksChanged, initialElementId,
   initialElementAction, initialElementKind="auto", onClearElementHash`.
   Пропсы РЦ/ДЦ-ТХУ (`isLocalRcActive, localRcValue, localRcOffice,
   onClearLocalRc`) в новой оболочке не нужны.
5. Reference старой обвязки ДОБ в этом репозитории: `src/App.jsx` строки
   1728–1763 (роутинг) и 810–845 (загрузка профиля).

## 4. Тема — `src/theme.js`

Вынести `createTheme(...)` из `App.jsx` целиком. **Обязательно** перенести вместе
с ней константу `const INPUT_HEIGHT = 56;` — она используется внутри темы
(`components.Mui*`), иначе `no-undef` на lint.

## 5. Убрать кросс-сайт (главная содержательная часть)

Приложение размещается на том же сайте, с которым работает, поэтому вся логика
«какой сайт для какого списка» исчезает.

1. **Удалить** `src/features/dob/lib/siteRouting.js`. Перед удалением — grep по
   импортёрам (их не было) и по тестам.
2. `src/features/dob/api/dobApi.js`:
   - убрать импорты `apiClient` и `TASKS_LIST_API`, убрать ре-экспорт
     `isMainSiteList`;
   - `listApiOf()` → `dobListApi()`, `httpOf()` → `dobAxios`, `readConfig()` →
     `undefined` (клиент всегда доб-ский).
3. `src/features/dob/lib/dobUserSearch.js`:
   `userSearchFor()` **без параметра**, всегда
   `{ search: searchDobUsers, getPositions: dobUserPositions }`.
   Параметр в сигнатуре оставлять не надо — eslint ругается на неиспользуемый
   аргумент; вызывающий код может передавать GUID, JS его просто проигнорирует.
4. `src/tasks/sources.js` — один источник `dob` (`RequestsTask`,
   `DOB_TASKS_LIST_GUID = 03FC1B92-BAFF-44DC-B8A3-D04ACBE329D3`); импорт
   `TASKS_LIST_GUID/TASKS_LIST_API` убрать.
5. **`src/tasks/config.js` — не забыть!** `TASKS_LIST_GUID` там указывал на список
   `Tasks` основного сайта (`463B634E-A71A-4FEF-9A1F-B803431D8639`), и через
   `src/tasks/distribution.js` и `src/features/tasks/hooks/useTasksMetadata.js`
   задачи уходили бы на чужой сайт. Перевести на тот же GUID, что в `sources.js`
   (один источник истины, чтобы не разъезжалось):

   ```js
   export { DOB_TASKS_LIST_GUID as TASKS_LIST_GUID } from "./sources";
   import { DOB_TASKS_LIST_GUID } from "./sources";
   export const TASKS_LIST_API = `/web/lists(guid'${DOB_TASKS_LIST_GUID.toLowerCase()}')`;
   ```

6. Адрес API менять **не нужно**: `src/config.js` в проде выводит
   `${origin}/sites/<сайт>/_api` из `window.location.pathname`, то есть следует за
   сайтом размещения. В dev остаётся прокси `/dob-api` + ветка NTLM
   (`vite.config.ts`, `proxy-server.cjs`) — поэтому `express`, `httpntlm`, `cors`,
   `dotenv` остаются в зависимостях.

## 6. Зависимости

Удалить (проверено: ноль импортов): все `@tiptap/*`, `swiper`, `html5-qrcode`,
`react-barcode-reader`, `react-dropzone`, `react-router-dom`.
Оставить: `@ckeditor/*`, `@tanstack/react-virtual`, `@tanstack/react-query`,
`express`, `httpntlm`, `cors`, `dotenv`.
**Добавить `prop-types@^15.8.1`** — используется, но в старом `package.json` не
объявлен. Имя пакета → `dob-requests`. Затем `npm install --no-audit --no-fund`.

## 7. Тесты

Ожидаемый итог: **122 файла / 885 тестов зелёные** (в базовом репозитории 123/909).

Переписать под один источник и один сайт:

| Файл | Суть правки |
| --- | --- |
| `src/features/navigation/__tests__/AppMenuDrawer.test.jsx` | 2 пункта меню |
| `src/features/dob/__tests__/dobApi.{takeInWork,updateItem,uploadAttachment}.test.js` | GUID `03fc1b92-…`; мок `dobAxios` → пишущий стаб `apiClient`; пути вложений — доб-ские. **Внимание:** `dobAxios` в этих файлах мокируется в трёх разных формах (`axiosStub()`, литерал, литерал + `interceptors`) — один якорь замены промахнётся |
| вложение: проверка URL | «src не содержит прямого пути» при одном сайте невыполнимо → `src.startsWith("/sites/") === false && src !== ServerRelativeUrl` |
| `src/tasks/__tests__/sources.test.js` | один источник |
| `src/tasks/__tests__/multiSourceLoad.test.js` | стаб клиента — только `dob`; `SOURCES=[getSourceById("dob")]`; убрать сценарий «фильтр main»; скип источника проверяется на `dob` |
| `src/features/dob/lib/__tests__/dobUserSearch.test.js` | последний тест: «любой список → сайт ДОБ»; `search` = `searchDobUsers`, `getPositions` = `dobUserPositions`, `opts.base === DOB_BASE` |
| `src/features/tasks/__tests__/openTaskForm.test.js`, `src/tasks/__tests__/dobTaskFlag.test.js` | GUID в ожидаемых хешах: `463b634e-…` → `03fc1b92-…` |
| `src/features/tasks/__tests__/TasksView.completedTable.test.jsx` | `MAIN_LIST` → GUID `03fc1b92-…`; **добавить мок `../../dob/api/dobClient`** с `dobApiBase: () => ""` и `dobAxios`, проксирующим в те же обработчики, что и мок `../../../api` (иначе источник dob не получит данных) |

Выключить с явным TODO (не удалять молча):

- `src/features/tasks/__tests__/TasksView.multisource.test.jsx` — `describe.skip`:
  весь набор построен на двух источниках («строки обоих источников», «фильтр main»,
  «MERGE в основной список»). Требует переписывания под один источник.
- В `TasksView.completedTable.test.jsx` — тест «на узком экране таблицы нет…»:
  счётчик «Активные (1)」задачу видит, но вместо карточек показывается
  «Не удалось загрузить задачи… AssignedTo, Body, ResultSearchTHU, Location1».
  **Причина не установлена.** В базовом репозитории (два источника) тест зелёный —
  значит это открытая развилка про проверку обязательных полей списка, а не
  косметика.

## 8. Обвязка

- `index.html`: `<title>Заявки ДОБ и задачи</title>`.
- `README.md`: назначение, запуск, таблица `.env`, как определяется адрес API,
  GUID списка задач, раздел «Известные незакрытые места» (два skip'а выше).

## 9. Проверки

```sh
npx vitest run      # 122 файла / 885 тестов
npm run build       # ~13 с
npx eslint <изменённые файлы>
```

В `src/features/dob/api/dobApi.js` есть **три унаследованные** ошибки eslint
(`dobApiBase` unused, `url` unused на ~216, пустой блок на ~230) — они есть и в
базовом репозитории, это baseline, не чинить в рамках переноса.

## 10. Подводные камни

- Python-heredoc с JSX/кириллицей падает (`SyntaxError: invalid character '—'`)
  на больших файлах — правки писать в файл и делать `assert anchor in s`.
- `str.replace(anchor, repl, 1)` может попасть в комментарий — якорить с отступом
  и проверять единственность.
- Мок, из которого пропал экспорт, роняет всех потребителей (так было с
  `isMainSiteList`: 46 падений).
- eslint flat-config не понимает `--ext`.
- В vitest ESM `import.meta.url` — не `file:`-URL → `import { cwd } from "node:process"`.
- Песочница периодически откатывается: `node_modules` исчезает, HEAD уходит назад.
  Коммитить сразу, артефакты держать в репозитории, а не во втором клоне.

## 11. Что проверить на живом SharePoint (не проверено)

Реальные POST/GET на ДОБ, состав полей `RequestsTask`, значения `Description` у
типов контента, схема `DcEmail`, членство в `siteusers` сайта ДОБ, лицензионный
ключ AG Grid Enterprise, размещение «отдельного рабочего процесса на сайте ДОБ».
