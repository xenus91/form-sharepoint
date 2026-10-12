# ADR: роут `#dob_requests` и форма создания заявки

**Статус:** Accepted
**Дата:** 2026-10-12
**Связанный код:** `src/features/dob/lib/{dobRoute,requestFields,requestFormFields}.js`, `src/features/dob/components/requestForm/*`, `src/features/dob/hooks/useDobContentTypes.js`, `src/features/dob/api/dobApi.js` (`getDobContentTypes`), `src/features/dob/components/DobGrid.jsx`, `src/App.jsx`

---

## Контекст

Раздел заявок ДОБ жил по адресу `#dob_tasks`, хотя показывает он **заявки** списка
`Requests` (`21B5B544-BD98-4B06-891F-C5A137331394`, сайт `/sites/dob/doblogistic`).
Задачи ООБ — это другой список (`RequestsTask`) и другой роут (`#tasks`), поэтому
название вводило в заблуждение.

Таблица показывала **все** поля списка: рядом с полезными колонками стояли
служебные (`ComplianceAssetId`, `OData__*`, `_ModerationStatus`), мусорные
(`_x0068_…`) и дубли (`ContentType`).

Заявку можно было только править — создать новую из приложения было нельзя.

## Решение

### 1. Роут переименован: `#dob_tasks` → `#dob_requests`

| Адрес | Что открывает |
|---|---|
| `#dob_requests` | список заявок |
| `#dob_requests/new` | форма создания заявки |
| `#dob_requests/<id>` | форма заявки (правка) |
| `#dob_requests/<id>?list=<guid>` | та же форма, но в списке источника |

Старые ссылки продолжают работать: `parseHash` понимает `#dob_tasks/…` и `#dob/…`,
а обработчик `hashchange` в `App.jsx` перезаписывает старый адрес на новый
(`isLegacyDobHash` / `toRequestsHash` в `lib/dobRoute.js`). Все **производители**
ссылок в приложении переведены на новый роут: `DobListStateContext.openEdit`,
`openTaskForm.js`, `DobTaskEditView` (кнопка «Назад»), `relatedItem.js`, пункт
бокового меню.

### 2. Колонки таблицы — только нужные поля

`lib/requestFields.js` → `selectRequestFields(fields, { ctFieldNames })`:

1. `ID`, заголовок;
2. поля **типов контента** списка (из `FieldLinks`, в порядке списка полей);
3. остальные несистемные поля списка.

Не показываются: скрытые (`Hidden`), служебные дубли (`OData__*`, `_*`),
`SYSTEM_LIST_FIELDS`, инфраструктура приложения (`AdditionalActions`,
`AdditionalActionsRequired`, `Edit`), кодированный мусор (`_x0068_…`),
«Результат проверки» (живёт в форме) и «Тип контента».

> Намеренно **не** переиспользуется `HIDDEN_FORM_FIELDS` из `dobFormFields`: тот
> набор скрывает `Modified` (правило для формы), а в таблице это полезная колонка.

Типы контента списка берёт `getDobContentTypes(listGuid)`
(`GET /contenttypes?$select=Id,StringId,Name&$expand=FieldLinks`), кэш — 10 минут,
в грид передаётся через `useDobContentTypes()` → `ctFieldNames`.

### 3. Форма создания заявки — отдельные компоненты

Кнопка **«Создать заявку»** в шапке списка → `#dob_requests/new` (отдельный роут,
не диалог). Состав формы зависит от выбранного типа контента:

```
RequestCreateView.jsx          страница: AppBar, выбор типа, поля, «Создать»
├─ RequestContentTypeSelect.jsx  типы контента списка
├─ RequestFormFields.jsx         список полей
│  └─ RequestFieldControl.jsx    один контрол (вид — по типу поля)
├─ useRequestForm.js             состояние: тип → поля → значения → запись
└─ toCreatePayload.js            значения → payload SharePoint
```

Поля берутся из `getDobContentTypeFields(ctId)`, вид контрола — из общего
`controlKindOf`, поэтому форма заявки и форма задачи определяют типы одинаково.

**Почему не `buildContentTypeForm` из `tasks/contentTypeFields`:** он построен под
форму закрытия задачи и отбрасывает `Title`, `AssignedTo`, `DueDate`, `Status`,
`Priority` (`SYSTEM_AND_TASK_FIELDS`) — там их правит отдельный UI. В заявке это
основные поля, поэтому набор служебных полей у формы свой
(`lib/requestFormFields.js` → `REQUEST_FORM_SKIP_FIELDS`, `buildRequestFormControls`).

Payload повторяет соглашение формы заявки: «пользователь» → `<Поле>Id` (число или
`Collection(Edm.Int32)`), `MultiChoice` → `"a;#b"`, плюс `ContentTypeId` выбранного
типа. Запись — `createDobItem(payload, DOB_LIST_GUID)`.

## Проверка

* `vitest run` — 86 файлов / 711 тестов, зелёные.
* Новые тесты: `dobRoute` (5), `requestFields` (5), `requestFormFields` (4),
  `toCreatePayload` (6), `useRequestForm` (5), `RequestCreateView` (2).
  В `useRequestForm`/`RequestCreateView` проверяется реальный путь: выбор типа →
  запрос полей этого типа → смена типа меняет состав полей → «Создать» вызывает
  `createDobItem` с payload'ем и `ContentTypeId`; при незаполненном обязательном
  поле список не трогается.
* `npm run build` — успешно, в бандле отдельный чанк `RequestCreateView-*.js`.
