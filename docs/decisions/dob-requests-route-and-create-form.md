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

### 1. Адреса разделены по смыслу: заявки — `#dob_requests`, задачи — `#dob_tasks`

Это **два разных списка**, поэтому и адреса разные:

| Адрес | Что открывает | Список |
|---|---|---|
| `#dob_requests` | список заявок | `Requests` (`21B5B544-…`) |
| `#dob_requests/new` | форма создания заявки | `Requests` |
| `#dob_requests/<id>` | форма заявки (правка) | `Requests` |
| `#dob_tasks/<id>?list=<guid>` | форма **задачи** из другого списка | основной `Tasks`, `RequestsTask` ООБ |

Экран один (`DobTaskEditView`), но заявка и задача — разные сущности: задача
приходит из `#tasks` с `?list=<список источника>` и сохраняются в свой список.
Переименовывать задачный адрес в «заявки» нельзя — заявки там нет.

Выбор адреса делает `buildDobItemHash(id, listGuid)`: без `list` (или с GUID
списка `Requests`) → `#dob_requests/<id>`, иначе → `#dob_tasks/<id>?list=<guid>`.
Кнопка «Назад» возвращает в `#dob_requests` для заявки и в `#tasks` для задачи.

Старые ссылки на **заявки** (`#dob_tasks/<id>` без `?list=`, `#dob/<id>`)
продолжают работать: `parseDobHash` понимает все варианты, а `hashchange` в
`App.jsx` перезаписывает такие адреса на `#dob_requests`
(`isLegacyDobRequestHash` / `toRequestsHash`); задачные ссылки с `?list=` не
трогает.

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

### 4. Форма открывается уже заполненной (2026-10-12)

* **Тип контента выбран по умолчанию** — берётся первый тип из
  `getDobContentTypes`; как только список загружен, `useRequestForm` сам вызывает
  `selectContentType(defaultCtId)`, поэтому поля видны сразу.
* **Названия типов — из `Description`** (`contentTypeDisplayName` в
  `lib/requestFields.js`): внутреннее имя (`Name`) показывается только если
  описания нет. В запрос добавлен `$select=…,Description`.
* **`DC` ← `Office`, `InitiatingDepartment` ← `Department`** из профиля
  пользователя (`GetMyProperties` → `App.jsx` → `userProfile` → prop страницы →
  `useRequestForm`). Логика — в `requestForm/requestDefaults.js`:
  * «Не указано» (так `App.jsx` помечает отсутствующее свойство) не подставляем;
  * в `Choice` без свободного ввода пишем только существующий вариант: сначала
    точное совпадение, затем номер РЦ из `Office` («РЦ-8114» → «8114»);
    подходящего варианта нет — поле остаётся пустым;
  * подстановка делается один раз на каждый выбранный тип и не затирает то, что
    пользователь уже ввёл.

## Проверка

* `vitest run` — 87 файлов / 715+ тестов, зелёные.
* Новые тесты: `dobRoute` (8), `requestFields` (7), `requestFormFields` (4),
  `toCreatePayload` (6), `requestDefaults` (7), `useRequestForm` (7),
  `RequestCreateView` (4), `DobListAppBar.createButton` (1).
  В `useRequestForm`/`RequestCreateView` проверяется реальный путь: тип выбран по
  умолчанию → запрос полей этого типа → смена типа меняет состав полей →
  `DC`/`InitiatingDepartment` подставлены из профиля → «Создать» вызывает
  `createDobItem` с payload'ем и `ContentTypeId`; при незаполненном обязательном
  поле список не трогается.
* `npm run build` — успешно, в бандле отдельный чанк `RequestCreateView-*.js`.

### 5. Форма задачи: видно, по какому типу контента построены поля

`fetchContentTypeFields` имел три уровня: FieldLinks типа → поля самого типа →
**фолбэк «все колонки списка»**. Фолбэк неотличим от успеха, поэтому при
неразобранном типе форма молча показывала весь список колонок — например, для
задачи из `RequestsTask` (`#dob_tasks/<id>?list=03fc1b92-…`) это стандартные поля
«Задачи рабочего процесса» (Имя задачи, Предшественники, Важность, Состояние
задачи, % завершения, Кому назначено, Описание, Дата начала, Срок, Связанные
элементы, Результат задачи).

Что сделано:

* `fetchContentTypeFieldsDetailed` / `getDobContentTypeFieldsDetailed` отдают
  `{ fields, source, ctId, error }`, где `source` = `fieldlinks` | `ct-fields` |
  `list-fields` | `none`; `fetchContentTypeFields` остался обёрткой (совместимость);
* `DobTaskEditView` при `source === "list-fields"` показывает предупреждение
  «Состав типа контента … получить не удалось (…) — показаны все поля списка»
  (до гейта «взять в работу», чтобы его было видно всегда);
* при успешном разборе — подпись «Поля типа контента: <Описание типа>»;
* в запросе коллекции типов `$top` поднят 50 → 100 и добавлен `Description`
  (иначе нужный тип мог не попасть в выборку).

Принцип отбора полей при этом один и тот же для всех списков — и для основного
`Tasks` (obrazceo), и для `RequestsTask`: колонки списка ∩ FieldLinks типа
контента элемента, минус служебные и скрытые.
