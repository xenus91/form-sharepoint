# Картинки rich-текста — вложением; детекция задачи ДОБ — по флагу IsDobTask

Дата: 2026-10-04 (раунд 9).

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

## 2. Детекция «нашей» формы — по bool-полю IsDobTask

В каждый тип контента задачи добавляется колонка `IsDobTask` (Bool) со значением
по умолчанию, поэтому у создаваемых задач флаг уже заполнен. Задача с
`IsDobTask = true` ведётся формой ДОБ (`DobTaskEditView`,
`#dob_tasks/<id>?list=<список>`), независимо от имени/ID типа контента.

- Поле запрашивается в select основного списка (`src/tasks/listQuery.js`,
  `MAIN_ONLY_FIELDS`; если колонки ещё нет — авто-ретрай уберёт её из `$select`),
  в `FULL_TASK_SELECT` (hash-режим) и в REST-запросах завершённых задач.
- Маппинг: `src/tasks/mapping.js` → `task.IsDobTask` (+ `task.raw`).
- Проверка значения — `hasDobTaskFlag` (`src/tasks/contentTypeFields.js`):
  true/1/«Да»/`{Value:true}`/`{results:[true]}`. Детекция
  (`isResultCheckTask`, `isDialogRequired`, `isDobLikeTask`, `isDialogResultTask`)
  использует флаг, а исторический признак «Результат проверки ООБ» (id/имя типа
  контента) остаётся как fallback — на случай списков/старых элементов без поля.
- Флаг приоритетнее правила Behaviour `dlg: false`: тип контента решает, какой
  формой ведётся задача.
- Polling hash-режима запрашивает короткий набор полей и раньше ЗАМЕНЯЛ объект
  задачи, теряя признаки (CT, флаг): теперь признаки переносятся из предыдущего
  состояния (`useHashPolling.mergePolledTask`).
