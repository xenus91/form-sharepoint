# preview — локальный предпросмотр карточек задач

Изолированный стенд: карточки задач рендерятся на мок-данных, SharePoint не нужен.
Используется только для правки вида/поведения карточек, в прод-сборку не попадает
(основной `index.html` и `vite.config.ts` — в корне проекта).

## Запуск в браузере

```bash
npm run preview:cards      # vite с preview/vite.config.js, порт 5180
```

Откроется сцена `preview/CardsScene.jsx` (`?scene=table` — табличный режим,
`?scene=related` — диалог «Связанная заявка» на мок-данных):

- карточка «в работе» (своя запись TaskBehaviour по имени типа контента);
- просроченная карточка;
- завершённая карточка с **другим** типом контента — для неё срабатывает общая запись `TaskBehaviour.Title = "*"`.

## Проверка без браузера (jsdom)

Эффекты в SSR не выполняются, поэтому поля из `Behaviour.rf` там не видны.
Для текстовой проверки есть jsdom-рендер:

```bash
npm i jsdom --no-save
npx vite build --config preview/vite.config.js --ssr client-check.mjs --outDir .ssrout
node preview/.ssrout/client-check.mjs   # содержимое карточек (шапка rf, заголовок, описание)

npx vite build --config preview/vite.config.js --ssr flow-check.mjs --outDir .ssrout
node preview/.ssrout/flow-check.mjs     # поток результата: роутинг + клики + диалоги

npx vite-node --config preview/vite.config.js preview/related-check.mjs   # диалог «Связанная заявка» (чипы/подписи/кнопки — не должны находиться)

npx vite-node --config preview/vite.config.js preview/table-check.mjs     # таблица: меню действий в точке клика (координаты, состав, hash)

npx vite-node --config preview/vite.config.js preview/take-check.mjs      # взятие dob-задачи: MERGE с __metadata.type (иначе SharePoint 400)
```

Выводит содержимое каждой карточки так, как оно выглядит после загрузки данных
(шапка из `rf`, заголовок, чип «Местоположение» перед описанием, описание, кнопки).

## Файлы

| Файл | Назначение |
|------|------------|
| `vite.config.js` | root = `preview/`, подменяет `src/api.js` на мок (`resolveId`-плагин) |
| `mockApi.js` | заглушка `apiClient`: отдаёт связанные элементы ProblemsPallet |
| `CardsScene.jsx` | задачи и конфиг `TaskBehaviour` из реального кэша пользователя |
| `TableScene.jsx` | табличный режим `#tasks` на мок-данных: закреплённая шапка, поиск, меню действий в точке клика (`?scene=table`) |
| `RelatedScene.jsx` | диалог «Связанная заявка» (read-only) на мок-данных (`?scene=related`) |
| `mockDob.js` | заглушка DOB-API (`dobApi`/`dobClient`) для сцен предпросмотра + мини-эмуляция SharePoint для dob-списка задач (MERGE/`__metadata.type`) |
| `related-check.mjs` | jsdom-проверка диалога «Связанная заявка»: печатает текст/поля и ловит лишние чипы, подписи и кнопки |
| `table-check.mjs` | jsdom-проверка таблицы: действия открываются в точке клика, состав как в карточке |
| `take-check.mjs` | jsdom-проверка взятия dob-задачи: мок SharePoint отвергает MERGE без `__metadata.type`, реальный `takeTaskInWork` проходит |
| `main.jsx` | точка входа для браузера |
| `jsdom-setup.mjs` | окружение jsdom (глобали для React/MUI) |
| `client-check.mjs` | jsdom-рендер: печатает содержимое карточек и кнопки |
| `flow-check.mjs` | проверка потока: `resolveResultFlow` + реальные клики + confirm-диалог |
| `view-check.mjs` | рендер настоящего `TasksView` в jsdom: ловит warning React о порядке хуков |
| `ssr-check.jsx` | серверный рендер (ловит runtime-ошибки компонентов) |
