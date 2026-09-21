# Decision: AdditionalActions fields — keep single field until audit proves split needed

> Дата: 2026-09-21 (обновлено 2026-09-22 — TaskTypeConfiguration resolver VERIFIED-ready)
> Статус: **IMPLEMENTED (single field) — tenant data NOT VERIFIED** (код поддерживает оба случая, таблица `docs/audit/content-types.md` всё ещё UNKNOWN)
> Связанные: `docs/architecture-current.md` §5, `docs/audit/content-types.md`, `src/services/taskTypeConfiguration.js`, `src/features/tasks/hooks/useTaskConfiguration.js`
> Resolver: `src/services/additionalActionsResolver.js` теперь читает `TaskTypeConfiguration` список если существует (graceful 404 → fallback), иначе `sharepoint-metadata`.

## Контекст

- Текущий код использует **одно** поле `AdditionalActions` (MultiChoice, AllowMultiple=true, FillIn=true предположительно) для всех Task CT.
- План §15 допускает два случая: A) общий набор действий, B) разные наборы → отдельные поля `SearchAdditionalActions` etc.
- SPD Workflow читает поле (ветвление по AdditionalActions?). Изменение поля без миграции сломает старые Tasks и workflow.

## Решение (временно)

**Оставить `AdditionalActions` как единственный Site Column (случай A) до завершения аудита.**

**Почему:**
- В `Tasks` списке поле `AdditionalActions` существует и заполнено в production Tasks (пример 531/532 с `Отправить ЕО в OTM`).
- `ADDITIONAL_ACTIONS_STANDARD` = 3 значения одинаковы для всех текущих CT (по коду TaskCard).
- Нет evidence разных Choice наборов — аудит таблицы `ContentType → AdditionalActionsField` = UNKNOWN.
- Создание новых полей `SearchAdditionalActions` без бизнес-решения нарушает §6 (нельзя менять workflow fields).

## Как пользоваться без хардкода

- `src/services/taskTypeConfiguration.js` + `src/services/additionalActionsResolver.js` — единый resolver: `Task.contentTypeId → TaskTypeConfiguration (if exists) → fieldInternalName → metadata → choices` (реализован 2026-09-22, graceful 404).
- Сейчас resolver возвращает `fieldInternalName = "AdditionalActions"` для любого CT, т.к. список `TaskTypeConfiguration` отсутствует (404 → fallback) — случай A, cache `Map<CT, config>` stale 30м, `useTaskConfiguration` мержит `ctConfigMap` c `additionalMetaByName`.
- Если аудит покажет разные наборы → создать SharePoint список `TaskTypeConfiguration` (Title, ContentTypeId [Text full 0x0108...], ResultFieldInternalName, AdditionalActionsFieldInternalName, Required [Да/Нет]) и заполнить items; оба резолвера автоматически подхватят `task-type-config` без изменения `AdditionalActionsField.jsx` (универсален, freeSolo).

## Что нужно для перехода к случаю B

1. Выполнить `docs/audit/content-types.md` на tenant (реальный REST), заполнить таблицу:

| ContentType | ResultField | AdditionalActionsField | Choices | FillIn | Workflow usage |
|---|---|---|---|---|---|
| … | … | … | … | … | … |

2. Если наборы различаются → создать новые Choice поля (AllowMultiple+FillIn), заполнить их Choices, обновить SPD Workflow читать новое поле (отдельное бизнес-решение + миграция).
3. Заполнить `TaskTypeConfiguration` список items (по одному на ContentTypeId) — резолвер `src/services/taskTypeConfiguration.js` начнёт отдавать `task-type-config` (404 → больше не fallback).
4. `AdditionalActionsField` останется без изменений (универсален).

## Последствия

- **React не меняется** при добавлении нового CT если его AdditionalActions = общее поле.
- **Старые Tasks** продолжают читать/писать `AdditionalActions` — backward compat сохранён.
- **Риски**: если SPD уже использует разные поля, но React их не знает → `missing-field` error будет видимым (резолвер вернёт `enabled:false` + `error` diagnostic, не silent fallback).

## Self-check

- [ ] Для каждой production Task существует `AdditionalActions` значение → читается без 400 (проверить `GET .../items?$select=AdditionalActions` 200)
- [ ] Fill-in не меняет metadata поля (проверить `GET .../fields/getbytitle('AdditionalActions')` Choices до/после сохранения кастомного значения)
- [ ] Polling Tasks не делает N+1 `fields` запросов (resolver кэширован, hook `useTaskConfiguration` stale 30м отделен от Tasks 5м, TaskTypeConfiguration stale 30м)
