# Content Type Audit — Phase 2 (TEMPLATE, требует реального SharePoint)

> Статус: **NOT VERIFIED** — REST к целевому SharePoint из sandbox невозможен (нет API_BASE_URL/credentials). Документ — шаблон для выполнения на tenant. Не переходить к Phase 3 без заполнения UNKNOWN.

## Как запустить аудит

В браузере на странице SharePoint (залогинен как пользователь с правами чтения Tasks) выполнить в DevTools Console:

```js
// 1) Tasks list identity
const guid = "463B634E-A71A-4FEF-9A1F-B803431D8639";
const base = "/_api/web/lists(guid'" + guid + "')";
// 2) ContentTypes
fetch(base + "/contenttypes?$select=Id,StringId,Name,Group,Description,Parent&$expand=FieldLinks&$top=50", {headers:{Accept:"application/json;odata=verbose"}, credentials:"same-origin"})
  .then(r=>r.json()).then(j=>{ console.log(JSON.stringify(j.d.results.map(c=>({Name:c.Name, Id:c.Id.StringValue||c.StringId, Parent:c.Parent?.StringValue})),null,2)); window._cts=j.d.results; });
// 3) Result поле не зависимо от CT — все поля с TypeDisplayName
fetch(base + "/fields?$select=InternalName,Title,TypeDisplayName,TypeShortDescription,Choices,Id,StringId,Hidden&$top=200", {headers:{Accept:"application/json;odata=verbose"}, credentials:"same-origin"})
  .then(r=>r.json()).then(j=>{ const v=j.d.results.filter(f=>f.TypeDisplayName==="Результирующий выбор" && f.TypeShortDescription==="Результат задачи"); console.log(JSON.stringify(v.map(f=>({InternalName:f.InternalName, Title:f.Title, Choices:f.Choices?.results||f.Choices, Id:f.Id, StringId:f.StringId})),null,2)); window._resultFields=v; });
// 4) Для каждого CT — какие FieldLinks ведут на Result (сопоставить Id/StringId с шагом 3)
window._cts.forEach(ct=>{ const links=(ct.FieldLinks?.results||[]).map(l=>l.Id||l.StringId); const hit=window._resultFields.filter(f=>links.includes(f.Id)||links.includes(f.StringId)); if(hit.length) console.log(ct.Name, "=>", hit.map(h=>h.InternalName)); });
```

Сохранить полный JSON ответов в `docs/audit/raw/ct-YYYY-MM-DD.json` и `fields-YYYY-MM-DD.json` (не коммитить secrets).

---

## Таблица (заполнить после выполнения)

| ContentType Name | ContentTypeId (full StringValue) | Parent CT | Result Field InternalName | AdditionalActions Field | FieldType | MultiValue | FillIn | Choices (sample) | Workflow usage |
|---|---|---|---|---|---|---|---|---|---|
| Поиск ЕО | `0x0108…` | 0x0100… | `ResultSearchTHU` | `AdditionalActions` | Choice Multi | Yes | Yes | `Найдена, Не найдена, …` | SPD читает ResultSearchTHU → ветвление |
| Завершение поиска ЕО | `0x0108…` | UNKNOWN | `ResultSearchComplete` (?) | `AdditionalActions` (?) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN — проверить, читает ли SPD то же поле |
| … | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

- Если ContentType отсутствует в списке → `UNKNOWN`, не угадывать.
- Для AdditionalActions отдельно проверить: `GET .../fields/getbytitle('AdditionalActions')` → `TypeAsString`, `AllowMultipleValues`, `FillInChoice`, `Choices`.

## Скрипт для автогенерации таблицы (после сбора raw)

`node scripts/audit-contentTypes.js --raw docs/audit/raw/` → `docs/audit/content-types.md` (обновляет таблицу, не затирая ручные notes).

## Self-check Phase 2

- [ ] Для каждого production Task CT существует строка `Name → full Id`
- [ ] Для каждого CT определён `ResultField` (InternalName + Choices + Id) или `UNKNOWN` с evidence
- [ ] Для каждого CT определён `AdditionalActionsField` или `UNKNOWN`
- [ ] Сохранён пример REST ответа (file + hash) в `docs/audit/raw/`

**Если любой пункт UNKNOWN без evidence — PHASE NOT DONE, не переходить к Decision record.**
