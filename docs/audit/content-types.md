# Content Type Audit — Phase 2 (TEMPLATE, требует реального SharePoint)

> Статус: **NOT VERIFIED** — REST к целевому SharePoint из sandbox невозможен (нет `API_BASE_URL`/credentials + NTLM proxy требует `VITE_SP_*` env).
> Документ — шаблон для выполнения на tenant. Не переходить к Phase 3 (`TaskTypeConfiguration` VERIFIED) без заполнения `UNKNOWN` с evidence.
> Код `TaskTypeConfiguration` резолвера уже готов (Phase 2.1) и ждёт данных: `src/services/taskTypeConfiguration.js` + `src/features/tasks/hooks/useTaskConfiguration.js` автоматически подхватят список `TaskTypeConfiguration` если он существует. До аудита `source = sharepoint-metadata` (single `AdditionalActions`).

## Как запустить аудит (обновлённый скрипт v2026-09-22)

В браузере на странице SharePoint (залогинен как пользователь с правами чтения Tasks, GUID `463B634E-A71A-4FEF-9A1F-B803431D8639`) выполнить **последовательно** в DevTools Console (F12 → Console → paste → Enter). Каждый блок дождаться `✅` лога:

```js
// 0) Базовые переменные
const guid = "463B634E-A71A-4FEF-9A1F-B803431D8639";
const base = "/_api/web/lists(guid'" + guid + "')";
console.log("base", base);

// 1) ContentTypes со всеми линками
await fetch(base + "/contenttypes?$select=Id,StringId,Name,Group,Description,Parent&$expand=FieldLinks&$top=50", {headers:{Accept:"application/json;odata=verbose"}, credentials:"same-origin"})
  .then(r=>r.json()).then(j=>{
    const list = j.d.results;
    console.log("✅ CT count", list.length);
    console.log(JSON.stringify(list.map(c=>({Name:c.Name, Id:c.Id.StringValue||c.StringId, Parent:c.Parent?.StringValue, FieldLinksCount:(c.FieldLinks?.results||[]).length})),null,2));
    window._cts=list;
    console.log("Сохраните: copy(JSON.stringify(list,null,2)) → docs/audit/raw/ct-YYYY-MM-DD.json");
  });

// 2) Все поля + фильтр Result (TypeDisplayName Результирующий выбор)
await fetch(base + "/fields?$select=InternalName,Title,TypeDisplayName,TypeShortDescription,Choices,Id,StringId,Hidden,TypeAsString,FillInChoice,AllowMultipleValues&$top=200", {headers:{Accept:"application/json;odata=verbose"}, credentials:"same-origin"})
  .then(r=>r.json()).then(j=>{
    const all=j.d.results;
    const v=all.filter(f=>String(f.TypeDisplayName).trim().toLowerCase()==="результирующий выбор" && String(f.TypeShortDescription).trim().toLowerCase()==="результат задачи");
    console.log("✅ Result fields found", v.length, v.map(f=>f.InternalName));
    console.log(JSON.stringify(v.map(f=>({InternalName:f.InternalName, Title:f.Title, Choices:f.Choices?.results||f.Choices, Id:f.Id, StringId:f.StringId, TypeAsString:f.TypeAsString})),null,2));
    window._resultFields=v;
    window._allFields=all;
    console.log("Сохраните: copy(JSON.stringify(v,null,2)) → docs/audit/raw/fields-result-YYYY-MM-DD.json");
    console.log("Сохраните полный: copy(JSON.stringify(all,null,2)) → docs/audit/raw/fields-all-YYYY-MM-DD.json (опционально)");
  });

// 3) AdditionalActions детально
await fetch(base + "/fields/getbytitle('AdditionalActions')?$select=InternalName,Title,TypeAsString,TypeDisplayName,Choices,FillInChoice,AllowMultipleValues,Hidden,Id,StringId,DefaultValue", {headers:{Accept:"application/json;odata=verbose"}, credentials:"same-origin"})
  .then(r=>r.json()).then(j=>{
    const f=j.d;
    console.log("✅ AdditionalActions", {InternalName:f.InternalName, TypeAsString:f.TypeAsString, AllowMultipleValues:f.AllowMultipleValues, FillInChoice:f.FillInChoice, Choices:f.Choices?.results||f.Choices, DefaultValue:f.DefaultValue});
    window._aaField=f;
    console.log("Сохраните: copy(JSON.stringify(f,null,2)) → docs/audit/raw/additionalActions-YYYY-MM-DD.json");
  }).catch(e=> console.warn("AdditionalActions getbytitle failed, пробуем через allFields", e));

// 4) Сопоставление CT → Result + AdditionalActions
(() => {
  if(!window._cts || !window._resultFields) { console.warn("сначала выполните шаги 1 и 2"); return; }
  const aaId = window._aaField ? String(window._aaField.Id||window._aaField.StringId||'').toLowerCase() : null;
  window._cts.forEach(ct=>{
    const links=(ct.FieldLinks?.results||[]).map(l=>String(l.Id||l.StringId||'').toLowerCase());
    const hit=window._resultFields.filter(f=>links.includes(String(f.Id||'').toLowerCase())||links.includes(String(f.StringId||'').toLowerCase()));
    const hasAA = aaId ? links.includes(aaId) : false;
    console.log(`${ct.Name} (${(ct.Id.StringValue||ct.StringId||'').slice(0,22)}…)` ,
      "→ Result:", hit.length? hit.map(h=>h.InternalName).join(', ') : '—',
      "→ AdditionalActions:", hasAA? 'LINKS AdditionalActions' : 'нет линка');
  });
})();

// 5) Проверка SPD Workflow usage (ручная) — посмотреть workflow associations (не REST):
// Site Settings → Workflows → найти SPD workflow привязанный к Tasks → открыть в SPD → проверить какие поля читает/пишет (ResultSearchTHU / AdditionalActions)
```

**Куда сохранять:**
- `docs/audit/raw/ct-YYYY-MM-DD.json` — полный `window._cts` (не коммитить secrets, только структура)
- `docs/audit/raw/fields-result-YYYY-MM-DD.json` — `window._resultFields`
- `docs/audit/raw/fields-all-YYYY-MM-DD.json` — опционально `window._allFields` для кросс-проверки
- `docs/audit/raw/additionalActions-YYYY-MM-DD.json` — `window._aaField` (один объект)
- Скриншот Network → `.../contenttypes?$expand=FieldLinks` 200

**Генерация таблицы:**
```bash
node scripts/audit-contentTypes.js --raw docs/audit/raw/
# скопировать вывод в раздел Таблица ниже (заменяя UNKNOWN, сохраняя ручные notes Workflow usage)
```

---

## Таблица (заполнить после выполнения — текущий шаблон)

| ContentType Name | ContentTypeId (full StringValue) | Parent CT | Result Field InternalName | AdditionalActions Field | FieldType | MultiValue | FillIn | Choices (sample) | Workflow usage |
|---|---|---|---|---|---|---|---|---|---|
| Поиск ЕО | `0x0108010069…` (пример, уточнить) | `0x010801` | `ResultSearchTHU` | `AdditionalActions` | Choice Multi | Yes | Yes | `Найдена, Не найдена, …` | SPD читает ResultSearchTHU → ветвление (проверить) |
| Завершение поиска ЕО | `0x01080100…` | UNKNOWN | `ResultSearchComplete` (?) | `AdditionalActions` (?) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN — проверить, читает ли SPD то же поле |
| … | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

- Если ContentType отсутствует в списке → `UNKNOWN`, не угадывать.
- Для AdditionalActions отдельно проверить: `GET .../fields/getbytitle('AdditionalActions')` → `TypeAsString`, `AllowMultipleValues`, `FillInChoice`, `Choices`, `DefaultValue`.
- После заполнения — обновить `docs/decisions/additional-actions-fields.md` (статус VERIFIED или keep single) и `src/services/taskTypeConfiguration.js` (столбец `Workflow usage` должен быть заполнен evidence).

## Скрипт для автогенерации таблицы (после сбора raw)

`node scripts/audit-contentTypes.js --raw docs/audit/raw/` → stdout таблица для вставки в `docs/audit/content-types.md` (не затирает ручные notes, только подсказывает).

- Скрипт: `scripts/audit-contentTypes.js` (v1, heuristic: `ct.Name+FieldLinks` vs `InternalName+TypeDisplayName`).
- Если `docs/audit/raw/` пусто → выводит инструкцию (см. выше).

## Self-check Phase 2

- [ ] Для каждого production Task CT существует строка `Name → full Id` (StringValue, не префикс `0x0108…`)
- [ ] Для каждого CT определён `ResultField` (InternalName + Choices + Id + StringId) или `UNKNOWN` с evidence (скрин `FieldLinks` без линка)
- [ ] Для каждого CT определён `AdditionalActionsField` или `UNKNOWN` (проверено `FillInChoice`/`AllowMultipleValues`/`TypeAsString` + `FieldLinks` наличие)
- [ ] Сохранён пример REST ответа (file + hash) в `docs/audit/raw/` + `window._aaField.DefaultValue` сохранён
- [ ] `node scripts/audit-contentTypes.js --raw docs/audit/raw` проходит без `skip`

**Если любой пункт UNKNOWN без evidence — PHASE NOT DONE, не переходить к Decision record и не помечать `TaskTypeConfiguration` как VERIFIED.**

---

## TaskTypeConfiguration — когда станет VERIFIED

- **Сейчас**: `src/services/taskTypeConfiguration.js` реализован с graceful fallback:
  - `GET /_api/web/lists/getbytitle('TaskTypeConfiguration')/items` — если список существует, кэширует `Map<ContentTypeId, {AdditionalActionsFieldInternalName, ResultFieldInternalName, Required}>` (stale 30м).
  - Если список **не существует** (404) или пуст → `null` → резолвер использует `sharepoint-metadata` (одно поле `AdditionalActions`, discovery `resultField.js`).
  - `useTaskConfiguration` мержит: `ctConfigMap.set(ctId, {resultField, additionalActionsField: metaFromTaskTypeConfig || additionalMeta})`, `source = task-type-config` если из списка, иначе `sharepoint-metadata`.
- **VERIFIED критерии**:
  1. Таблица выше заполнена без UNKNOWN (или UNKNOWN с evidence + decision keep-single).
  2. Если таблица показывает один общий `AdditionalActions` для всех CT → Decision `additional-actions-fields.md` обновляется в `VERIFIED (keep single)`, `TaskTypeConfiguration` остаётся `VERIFIED (not needed)` — код уже поддерживает оба, fallback проверен.
  3. Если таблица показывает разные наборы → создаётся SharePoint список `TaskTypeConfiguration` (Title, ContentTypeId [single line], ResultFieldInternalName, AdditionalActionsFieldInternalName, Required [Yes/No]), заполняются items по таблице, SPD workflow обновляется читать новые поля, `src/services/taskTypeConfiguration.js` автоматически начнёт отдавать `task-type-config` → статус `VERIFIED (active)`.
- **Следующий шаг после tenant run**: PR обновляет таблицу → `git add docs/audit/raw/* docs/audit/content-types.md docs/decisions/additional-actions-fields.md` → `npm run build` + ручной checklist `docs/testing/tasks-regression.md` §4-5.

