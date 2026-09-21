# Tasks Regression Checklist — Phase 1 Baseline

> Дата фиксации: 2026-09-21, ветка `arena/01a08e7b-form-sharepoint` @ `c5d1b40` (debug + docs)
> Build baseline: `npx vite build` → **PASS** `1,416.81 kB gzip 425.93k`, warnings chunk >500k (ожидаемо), `sp/cache` + `enrich` dynamic import дубликаты — не критично.
> Lint: **FAIL** (наследие) — 200+ ошибок `no-unused-vars`, `react-hooks/rules-of-hooks` в App.jsx line 70 `SwiperCore.use` вне компонента, `no-empty`, `react/prop-types`. Не введено нашим аудитом — фиксируем как baseline, чистка — Phase 14/19.
> Tests: **NONE** — `tests/` отсутствует, `*.test.*` не найдены. Добавить в Phase 19-20.

## Ручная проверка (минимум Phase 1.2)

Выполнять на целевом SharePoint (пользователь с назначенной Task) без моков:

### 1. Загрузка Tasks
- [ ] Открыть `/` без `?dbg` → `fieldsLoading` → `Tasks` появляется <3с, `AssignedTo` фильтр отрабатывает (видно только свои задачи).
- [ ] Проверить Network: `GET .../lists(guid'…')/items?$filter=AssignedToId eq X&$select=…RelatedItems,ContentTypeId` 200, `__next` пагинация если >100.

### 2. AssignedTo / Distribution
- [ ] Пользователь из DcEmail группы видит задачи группы ( distribution `Email.Id` ), не только `currentUserId`.
- [ ] Fallback `OffDepKey` если поле есть (старые Tasks).

### 3. Status
- [ ] Вкладки `Активные (N)` / `Завершенные (M)` корректны, `isCompletedStatus` матчит `Завершена/Completed/Выполнена/percent 100`.
- [ ] Оверлей "Беру в работу..." только при `isTaking`.

### 4. Result (универсальный, не только THU)
- [ ] Открытая задача с CT "Поиск ЕО" показывает choices из `ResultSearchTHU` (динамическое поле через `TypeDisplayName=Результирующий выбор`).
- [ ] Новая CT с другим Result-полем (если есть в tenant) — без хардкода показывает свои choices (проверить через `?dbg=1` → `[DBG:fetchTasks] resultFieldInternalNames`).

### 5. AdditionalActions
- [ ] Для "ЕО найдена" поле `Дополнительные действия` видно, default `Отправить ЕО в OTM`, `required Да`, `freeSolo` позволяет кастом.
- [ ] Пустой выбор → скрывается (`Required Нет`), непустой → `Да`.
- [ ] Сохранение `String` vs `Boolean` флип не падает (смотреть Network PATCH `Collection(Edm.String)`).

### 6. RelatedItems
- [ ] Карточка ТК `ТК 107 • ЕО 808...` не мигает `ЕО → ТК` при рефетче (кэш 5м). Проверить `?dbg=1` → `[DBG:enrich] getGlobalEnrichCache HIT`.
- [ ] Задача без RelatedItems не триггерит enrich (needsEnrichment 0).

### 7. Completion
- [ ] `Найдена` → выбрать Место → `Сохранить - Найдена` → PATCH + `Status Завершена Percent 1` → `invalidate` → SPD создаёт следующую Task в течение polling 5м (появится без Refresh).
- [ ] Параллельный `Modified` конфликт → notify "уже выполнена другим" + rollback.

### 8. Hash navigation
- [ ] `#tasks/123&SearchResult=SearchComplete` открывает сразу карточку без `Открыть детали`, фиксит poll `loadTasks` не зацикливается.

### 9. Polling
- [ ] Создать Task через SPD (PowerShell/Workflow) → появляется в списке <5м без ручного Refresh, дубликатов нет (структурный шеринг).

### 10. Enrichment
- [ ] 10 задач одного pallet (ItemId 24785) → **1** `GET .../items?$filter=(Id eq 24785)` вместо 10, `concurrency 5` не превышается, `globalEnrichCache` hit на второй polling.

---
**Self-check Phase 1.2:**
- Build: PASS
- Lint: FAIL (baseline heritage — не блокер для Phase 2)
- Manual: REQUIRED (на целевом SharePoint, без моков)
- REST verification: см. Network раздел выше
- Regression: новый мигание-фикс не ввёл regression в 1-10 (проверить повторно после выключения `?dbg`)
