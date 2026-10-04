# Картинки rich-текста — вложением; детекция задачи ДОБ — по настройке TaskBehaviour

Дата: 2026-10-04 (раунды 9–10).

## 1. Изображения rich-текста сохраняются ссылкой на вложение

**Проблема.** При сохранении заявки/задачи картинка из rich-поля (ChekResult,
DescriptionCheckResult, …) уходила в SharePoint как `data:image/…;base64,…`
(адаптер загрузки CKEditor возвращал base64). Заявка раздувалась на сотни килобайт,
а в карточке/форме картинка была «внутри текста», а не вложением.

**Решение.**
- `RichEditor` загружает картинку вложением элемента
  (`<list>/items(<id>)/AttachmentFiles/add`) и подставляет в текст ССЫЛКУ
  (`src/features/dob/components/richUploadAdapter.js`).
- В SharePoint хранится серверный путь `/sites/…/Lists/…/Attachments/<id>/<file>`,
  а в браузере картинка показывается рабочим адресом: dev — через прокси
  `/dob-api` (NTLM), prod — абсолютным origin. За это отвечает
  `src/features/dob/lib/attachmentUrl.js` (`attachmentStorageUrl` /
  `attachmentDisplayUrl`, `toStorageImages` / `toDisplayImages`).
- Перед сохранением любой оставшийся base64 (старое значение, не удавшаяся
  загрузка) превращается в вложения: `src/features/dob/lib/materializeRichImages.js`
  (`materializeRichHtml` / `materializeRichValues`). Ошибка загрузки не теряет
  текст — картинка остаётся base64, пользователю показывается предупреждение.
- Вложения, которые исчезли из текста, удаляются (сравнение `src` идёт в
  «серверном» виде, иначе `/sites/…` и `/dob-api/sites/…` — одна и та же картинка —
  считались бы разными и вложение удалялось ошибочно).

Вложений может быть сколько угодно; имена уникализируются (`image_<ts>_<rand>`).

## 2. Детекция «нашей» формы — по настройке TaskBehaviour (IsDobTask)

**Как НЕ надо (отменено).** Колонка `IsDobTask` в списке задач не подходит: значение по
умолчанию колонки в SharePoint одно на весь список, поэтому «Да» для одного типа контента
проставляется всем задачам списка — признак «расползается» по всем типам сразу.

**Решение.** Признак живёт в `TaskBehaviour` — **по одной записи на тип контента**
(`Title` = `ContentType.Name`), колонка записи `IsDobTask` (Boolean). Фронт:

- `fetchTaskBehaviour` читает поле `IsDobTask` (если колонки ещё нет — повтор запроса без
  неё, остальная настройка сохраняется);
- резолвер CT.Name → Title (`services/taskBehaviour.js`) отдаёт `isDobTask` вместе с
  правилом; общая запись `*`/`_default` признак НЕ включает (иначе флаг у всех задач);
- `markDobTask(task, config)` проставляет задаче `isDobTask: true`; это делают `#tasks`
  (`TasksView.withDobFlag` — таблица, карточки, открытие формы) и страница
  `#dob_tasks/<id>` (`DobTaskEditView`, там дополнительно работает и для задачи,
  открытой напрямую по ссылке);
- `hasDobTaskFlag` (`contentTypeFields`) читает ТОЛЬКО `task.isDobTask` — сырое поле
  элемента игнорируется; далее, как раньше, задача ведётся формой ДОБ
  (`#dob_tasks/<id>?list=…`), результат закрывается формой по колонкам типа контента;
- признак приоритетнее правила Behaviour `dlg: false`; историческая детекция по CT
  «Результат проверки ООБ» (id/имя) остаётся fallback для списков без записи в
  TaskBehaviour;
- polling hash-режима переносит признаки задачи (`ContentTypeId`, `isDobTask`, `raw`) из
  предыдущего состояния — короткий `HASH_POLL_SELECT` их не запрашивает.

Поле в списке TaskBehaviour создаётся идемпотентно:
`node scripts/grant-task-behaviour-list.cjs` (или вручную: TaskBehaviour → добавить
колонку `IsDobTask`, тип «Да/Нет»).

Диагностика: `?dbg=1` → `[TaskBehaviour] resolved { …, isDobTask: true }`.
