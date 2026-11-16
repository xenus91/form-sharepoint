# preview — локальный предпросмотр карточек задач

Изолированный стенд: карточки задач рендерятся на мок-данных, SharePoint не нужен.
Используется только для правки вида/поведения карточек, в прод-сборку не попадает
(основной `index.html` и `vite.config.ts` — в корне проекта).

## Запуск в браузере

```bash
npm run preview:cards      # vite с preview/vite.config.js, порт 5180
```

Откроется сцена `preview/CardsScene.jsx` (табличного режима больше нет —
2026-10-16 задачи показываются только карточками):

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



npx vite-node --config preview/vite.config.js preview/take-check.mjs      # взятие dob-задачи: MERGE с __metadata.type (иначе SharePoint 400)
```

Выводит содержимое каждой карточки так, как оно выглядит после загрузки данных
(шапка из `rf`, заголовок, чип «Местоположение» перед описанием, описание, кнопки).

## Файлы

| Файл | Назначение |
|------|------------|
| `vite.config.js` | root = `preview/`, подменяет `src/api.js` на мок (`resolveId`-плагин) |
| `mockApi.js` | заглушка `apiClient`: связанные элементы ProblemsPallet + принципалы `getuserbyid`/`sitegroups` (чтобы «Кому назначено» по одному Id показывало ФИО) |
| `CardsScene.jsx` | задачи и конфиг `TaskBehaviour` из реального кэша пользователя |
| `take-check.mjs` | jsdom-проверка взятия dob-задачи: мок SharePoint отвергает MERGE без `__metadata.type`, реальный `takeTaskInWork` проходит |
| `main.jsx` | точка входа для браузера |
| `jsdom-setup.mjs` | окружение jsdom (глобали для React/MUI) |
| `client-check.mjs` | jsdom-рендер: печатает содержимое карточек и кнопки |
| `flow-check.mjs` | проверка потока: `resolveResultFlow` + реальные клики + confirm-диалог |
| `view-check.mjs` | рендер настоящего `TasksView` в jsdom: ловит warning React о порядке хуков |
| `ssr-check.jsx` | серверный рендер (ловит runtime-ошибки компонентов) |
