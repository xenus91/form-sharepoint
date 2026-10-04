# «Результат проверки ООБ»: закрытие через диалог ДОБ по колонкам

**Дата:** 2026-10-04
**Тип контента:** `Результат проверки ООБ`
(`0x0108003365C4474CAE8C42BCE396314E88E51F00DDA2B3C73567D14D8127B2CBCC18DC19`,
родитель — «Задача рабочего процесса» (SharePoint 2013), группа `ProblemsPallet`).

## Решение

Задачи этого типа закрываются **только через диалог** — по аналогии с задачами сайта ДОБ.
Форма диалога строится **строго по типу контента и типам колонок**, а не по списку
хендмейд-полей в коде: набор контролов определяется метаданными SharePoint
(`contenttypes('<ctId>')?$expand=Fields`), обязательность — флагом `Required` колонки.

Ответы на уточняющие вопросы (опрос 2026-10-04):

| Вопрос | Решение |
|---|---|
| Состав полей диалога | только предметные колонки: `DobSearchResult`, `DescriptionCheckResult`, `ErrorTypeValidation`, `ErrorCountValidation`, `Guilty`; служебные (`Title`, `StartDate`, `TaskDueDate`, `AssignedTo`, `PercentComplete`, `Body`, `Predecessors`, `Priority`, `TaskStatus`, `RelatedItems`) не показываются |
| Кнопки результата `DobSearchResult` | значения из `Choices` **колонки типа контента** (плюс свежие choices строки таблицы, они тоже читаются из колонки) |
| Как включается диалог | **автоматически по типу контента** — запись в TaskBehaviour не нужна; для произвольного правила остаётся ключ `dlg: true` (синонимы `dialog`, `requiresDialog`) |
| Обязательные поля | ровно те, у которых в SharePoint стоит `Required` (`DescriptionCheckResult`, `DobSearchResult`) |

## Как это работает

| Колонка | Контрол |
|---|---|
| `DobSearchResult` (Результирующий выбор, Required) | кнопки результирующего выбора в диалоге |
| `DescriptionCheckResult` (Многострочный, Required) | rich-текст (обязательное поле результата заявки) |
| `ErrorTypeValidation` (Выбор, `FillInChoice`) | автокомплит с подстановкой своего значения |
| `ErrorCountValidation` (Число) | числовое поле «Кол-во ошибок» |
| `Guilty` (Пользователь или группа) | поиск по **учётной записи** с приведением разделителей `_` → `.`, autocomplete с многократным поиском и выбором; в чипе — имя и должность |

Поля «Пользователь или группа» (`User`/`UserMulti`) собираются общим контролом
`PersonFieldAutocomplete`: запрос к `/web/siteusers?$filter=substringof(...)` по логину
(варианты `ivanov.ii`, `ivanov_ii`, `i:0#.f|membership|...`), отображение — «Имя — Должность»
(должность из `SPS-JobTitle`), значение payload — `Collection(Edm.Int32)` в `<Field>Id`.

Маппинг «колонка → контрол» живёт в `src/tasks/contentTypeFields.js`
(`controlKindOf`/`buildContentTypeForm`/`validateRequiredFields`), сам диалог —
`src/features/tasks/components/ContentTypeResultDialog.jsx`, кэш полей — 30 минут
(`sessionStorage sp:ctFields:<ctId>`).

## Паритет таблицы и карточки

- И карточка, и попап строки таблицы при `dlg` открывают один и тот же диалог;
- `loc` в Behaviour имеет приоритет над `p`/`aa` **и в поповере** — раньше при
  `{ loc: true, aa: true }` карточка показывала диалог «Где найдена ЕО?», а таблица
  инлайн-форму с доп. действиями. Теперь таблица тоже открывает диалог (`buildResultEditor`
  возвращает `null` при `requiresLocation`);
- при `p: [Location1]` без `loc` (настройка пользователя) форма по-прежнему показывается
  прямо в поповере, без диалога местоположения.

## Что НЕ делаем

- никаких самодельных диалогов/маршрутов «закрыть задачу»;
- не дублируем обязательность полей в TaskBehaviour — источник истины SharePoint;
- не показываем в таблице поля результата (они принадлежат диалогу).
