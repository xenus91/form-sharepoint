# Декомпозиция TasksView — план

> Дата: 2026-09-24
> Исходник: `src/TasksView.jsx` 1996 строк, 33 хука (useState/useEffect/useMemo/useCallback/useTransition/useRef), 15 useState, 1996 LOC
> Цель: сохранить бизнес-архитектуру (SPD Workflow, RelatedItems, AssignedTo, Result/AdditionalActions), улучшить тех. архитектуру — разбить на хуки + UI-компоненты с корректной вложенностью, тестируемо, без `npm run build` регрессий.

## Аудит ответственности (что делает TasksView)

1. **User / Profile** — `propUserProfile/propCurrentUserId` → `currentUserId`, `currentUserTitle`, `userOfficeDept` (Office/Department via `PeopleManager`), `getTasksListFieldsOverview` → `taskFieldNames/recipientField/scNumberField`
2. **Distribution** — `userOfficeDept` → `resolveDistributionViaDcEmail` → `distribution` (DcEmail)
3. **Metadata / Поля** — `entityType`, `choices` (ResultSearchTHU), `statusChoices/completed/inProgress`, `resultFieldsMeta/ctResultMap`, `additionalRequiredIsBoolean`, `fieldDefaultActions` (AdditionalActions DefaultValue), `taskConfiguration` (useTaskConfiguration)
4. **Tasks data** — `useTasksQuery` → `tasks`, `taskIndex` (buildTaskIndex), `filteredTasks/active/completed`, `groupedTasks`, `expandedGroups/toggleGroup`, `flatVirtualizer`, `loadTasks` (invalidate), polling 60с + focus throttle
5. **Hash-роут элемента** — `initialElementId/initialElementAction` → `elementIdParam/elementActionParam`, `fetchProblemsPalletItem`, `searchTaskByRelatedItem`, `elementData/elementTaskMatch/elementError/elementNotFound`, `isHashTaskRefreshing` polling, `autoTabAppliedForElement`
6. **Мутации** — `handleTakeInWork` (412/ETag, optimistic), `completeTask` (~500 строк: `AdditionalsActionsRequired` Boolean/Choice fallback, опечатка поля, MERGE If-Match, 2 стратегии для Не найдена, rollback), `updatingId/updatingAction`
7. **Диалоги / pending** — `locationDialogOpen/confirmNotFoundOpen/elementDialogOpen`, `pendingTask/pendingResult/locationComment/pendingAdditionalActions/pendingAdditionalError`, `handleResultClick/handleLocationSubmit`
8. **UI chrome** — `tab/isTabPending`, `groupingEnabled`, `fieldsLoading`, `loading/error/isBackgroundFetching`, header, Tabs, виртуализация, стили

Уже вынесено: `TaskCard.jsx` (1110), `TaskList.jsx` (255), `AdditionalActionsField.jsx`, `useTaskConfiguration.js`, `useTasksQuery.js` + `tasks/*` сервисы.

## Целевая структура (проще поддерживать, внешний API сохранён)

```
src/features/tasks/
  hooks/
    useCurrentUser.js          // 1) currentUserId/Title, userOfficeDept, fieldNames
    useDistribution.js         // 2) distribution from office/dept
    useTasksMetadata.js        // 3) entityType, choices, status, resultFields, taskConfiguration
    useHashElement.js          // 5) весь hash-роут + polling hash-задачи
    useTaskMutations.js        // 6) takeInWork + completeTask (вынести 500 строк fallback)
    useTasksFiltering.js       // 4) filtered/grouped, counts, toggleGroup
    useTasksViewModel.js       // оркестратор — компонуєт 1-6 + tasks query, отдаёт viewModel
  components/
    TasksHeader.jsx            // лого + Refresh + hash-кнопка
    TasksTabs.jsx              // Tabs Active/Completed
    TasksGroupingToggle.jsx    // Группировка по ТК
    TasksContent.jsx           // ветвление hash vs list + виртуализация
    HashElementView.jsx        // карточка элемента ProblemsPallet
    dialogs/
      LocationDialog.jsx       // Где найдена + AdditionalActionsField
      ConfirmNotFoundDialog.jsx
      ElementDialog.jsx        // детальный диалог элемента (если останется)
  TasksView.jsx (тонкий)       // src/TasksView.jsx re-export → features/tasks/TasksView.jsx
```

**Внешний API сохранён:** `TasksView({userProfile, currentUserId, onCountChange, initialElementId, initialElementAction, onClearElementHash, isLocalRcActive...})` не меняется — внутри делегирует в `features/tasks/TasksView.jsx`. Это «лучше и проще поддерживать»: 1 файл для App.jsx, вся логика в фиче.

## План PR (по требованию: сначала хуки, потом UI)

### PR1 — Хуки (без UI резки, только логика)
- `useCurrentUser` (100 строк из TasksView 236-260 + 112-115)
- `useDistribution` (20 строк)
- `useTasksMetadata` (вынести `useEffect` полей 285-405, `fieldsLoading`)
- `useHashElement` (вынести 450-620 + polling 1380-1480)
- `useTaskMutations` (вынести `handleTakeInWork` 722-828 + `completeTask` 829-1342 + `handleResultClick`)
- `useTasksFiltering` (651-720)
- `useTasksViewModel` (склейка, без JSX)
- Каждый хук — отдельный файл, отдельный коммит, `npm run build` + `vitest` зелёный, `TasksView.jsx` остаётся 1996 но использует хуки (постепенно уменьшаем).

### PR2 — UI резка с корректной вложенностью
- `TasksHeader`, `TasksTabs`, `TasksGroupingToggle` — чистые презентационные, props drilling → context `TasksViewContext`
- `TasksContent` → внутри `TaskList` (уже есть) + `HashElementView`
- `dialogs/*` — вынести 1600-1990 JSX диалогов, прокинуть `pendingTask` через props
- `TasksView.jsx` становится ~150 строк: `const vm = useTasksViewModel(props); return <TasksHeader/><TasksTabs/><TasksContent/> <LocationDialog/>...`
- Удалить дублирование стилей, проверить `transform/boxShadow` без миганий (требование 39).

## Правила остановки (из сессии)
- Любой `npm run build` fail → стоп, фикс.
- `vitest` regression → стоп.
- Неизвестный metadata (404 CType/Default) → graceful fallback, не ломать.

## Следующий шаг
Создать PR1-1: `useCurrentUser` + `useDistribution` как первый коммит, показать diff до/после.
