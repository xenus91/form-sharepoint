# preview — локальный предпросмотр карточек задач

Изолированный стенд: карточки задач рендерятся на мок-данных, SharePoint не нужен.
Используется только для правки вида/поведения карточек, в прод-сборку не попадает
(основной `index.html` и `vite.config.ts` — в корне проекта).

## Запуск в браузере

```bash
npm run preview:cards      # vite с preview/vite.config.js, порт 5180
```

Откроется сцена `preview/CardsScene.jsx`:

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
```

Выводит содержимое каждой карточки так, как оно выглядит после загрузки данных
(шапка из `rf`, заголовок, чип «Местоположение» перед описанием, описание, кнопки).

## Файлы

| Файл | Назначение |
|------|------------|
| `vite.config.js` | root = `preview/`, подменяет `src/api.js` на мок (`resolveId`-плагин) |
| `mockApi.js` | заглушка `apiClient`: отдаёт связанные элементы ProblemsPallet |
| `CardsScene.jsx` | задачи и конфиг `TaskBehaviour` из реального кэша пользователя |
| `main.jsx` | точка входа для браузера |
| `jsdom-setup.mjs` | окружение jsdom (глобали для React/MUI) |
| `client-check.mjs` | jsdom-рендер: печатает содержимое карточек и кнопки |
| `flow-check.mjs` | проверка потока: `resolveResultFlow` + реальные клики + confirm-диалог |
| `ssr-check.jsx` | серверный рендер (ловит runtime-ошибки компонентов) |
