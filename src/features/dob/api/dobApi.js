// src/features/dob/api/dobApi.js
// High-level DOB list operations — fields, items, update
import { dobApiBase, dobListApi, dobAxios } from './dobClient';

// Fetch ListItemEntityTypeFullName for MERGE payloads
let cachedEntityType = null;
export async function getDobEntityType() {
  if (cachedEntityType) return cachedEntityType;
  const url = `${dobListApi()}?$select=ListItemEntityTypeFullName`;
  const { data } = await dobAxios.get(url);
  cachedEntityType = data?.d?.ListItemEntityTypeFullName || 'SP.Data.DoblogisticListItem';
  return cachedEntityType;
}

// Fetch fields metadata for the DOB list (filtered)
export async function getDobFields() {
  const url = `${dobListApi()}/fields?$select=InternalName,Title,TypeAsString,TypeDisplayName,Required,Hidden,ReadOnlyField,Description,DefaultValue,Choices,FillInChoice,AllowMultipleValues,LookupList,LookupField,Formula,SchemaXml&$top=200`;
  const { data } = await dobAxios.get(url);
  const raw = data?.d?.results || data?.value || [];
  return raw;
}

// Items with OData — supports pagination via $top &$skiptoken or flat fetch
export async function getDobItems({ top = 100, orderBy = 'Created', orderDesc = true, filter = '' } = {}) {
  const selects = [
    'ID','Title','Created','Modified','Author/Title','Author/Id','Editor/Title','Editor/Id',
    '_x0414__x0430__x0442__x0430_', // Дата запроса
    '_x0421__x043a__x043b__x0430__x04', // Подразделение
    '_x043e__x0441__x043d__x043e__x04', // Основание
    '_x0418__x0437__x043b__x0438__x04', // Излишек/Недогруз
    '_x0414__x0430__x0442__x0430__x000', // Дата ПМ
    '_x041a__x043e__x043c__x043c__x04', // Комментарии склада
    '_x0413__x0418__x0421_', // ГИС
    '_x2116__x0020__x0415__x041e__x00', // № ЕО
    '_x041f__x0440__x043e__x0434__x04', // Продукт
    '_x041a__x0440__x0430__x0442__x04', // Краткое описание
    '_x041a__x043e__x043b__x0438__x04', // Количество
    '_x0421__x0442__x043e__x0438__x04', // Стоимость
    '_x0414__x0430__x0442__x0430__x00', // Дата СВН
    '_x0424__x0418__x041e__x0020__x04', // ФИО СВН
    '_x2116__x0020__x0422__x041a__x00', // № ТК/РЦ
    '_x041b__x043e__x0433__x0438__x04', // Логин виновного
    '_x0420__x0435__x0437__x0443__x04', // Результат проверки
    '_x041a__x043e__x043c__x043c__x040', // Комментарий СОБ
    '_x041e__x0448__x0438__x0431__x040', // Ошибка (Решение СОБ)
    '_x041a__x043e__x043b__x002d__x040', // Кол-во ошибок (Решение)
    '_x041e__x0448__x0438__x0431__x04', // Ошибка
    '_x041a__x043e__x043b__x002d__x04', // Кол-во ошибок
    '_x0421__x0442__x0430__x0442__x04', // Статус calculated
    '_x041d__x0435__x0434__x0435__x04', // Неделя calc
    '_x0414__x0430__x0442__x0430__x001', // Дата подтверждения
    '_x041e__x0442__x043a__x043e__x04', // Откорректировано
    '_x041d__x0435__x0020__x0430__x04', // Не актуально bool
    'Attachments','AttachmentFiles','Guid','ContentTypeId'
  ];
  const expands = ['Author','Editor','AttachmentFiles'].join(',');
  let url = `${dobListApi()}/items?$select=${selects.join(',')}&$expand=${expands}&$top=${top}`;
  if (orderBy) url += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  try {
    const { data } = await dobAxios.get(url);
    const results = data?.d?.results || data?.value || [];
    const next = data?.d?.__next || data?.['odata.nextLink'] || null;
    return { results, next };
  } catch (e) {
    const msg = String(e?.response?.data?.error?.message?.value || e?.message || '').toLowerCase();
    // fallback: if field not found / select error, retry without $select (return all fields)
    if (msg.includes('does not exist') || msg.includes('field') || msg.includes('not found') || e?.response?.status === 400) {
      // eslint-disable-next-line no-console
      console.warn('[dobApi] select failed, fallback to minimal select', msg.slice(0,200));
      let fbUrl = `${dobListApi()}/items?$expand=${expands}&$top=${top}`;
      if (orderBy) fbUrl += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
      if (filter) fbUrl += `&$filter=${encodeURIComponent(filter)}`;
      const { data } = await dobAxios.get(fbUrl);
      const results = data?.d?.results || data?.value || [];
      const next = data?.d?.__next || data?.['odata.nextLink'] || null;
      return { results, next };
    }
    throw e;
  }
}

// Paginated fetch helper — respects SharePoint __next
export async function getDobItemsPaged({ pageSize = 50 } = {}) {
  const all = [];
  let nextUrl = null;
  let first = true;
  while (first || nextUrl) {
    let url;
    if (first) {
      const { results, next } = await getDobItems({ top: pageSize });
      all.push(...results);
      nextUrl = next;
      first = false;
    } else {
      // nextUrl is absolute sharepoint url — need to map to proxy-aware if dev
      let fetchUrl = nextUrl;
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
        try {
          const u = new URL(nextUrl);
          // next like https://portal.len.com/sites/dob/doblogistic/_api/web/lists...$skiptoken=...
          // must go через /dob-api, а не /api (иначе дубль /sites/obrazceo/sites/dob)
          const idx = u.pathname.toLowerCase().indexOf('/_api');
          const apiPath = u.pathname.substring(idx) + u.search;
          const isDob = u.pathname.toLowerCase().includes('/sites/dob/');
          fetchUrl = `${isDob ? '/dob-api' : '/api'}${apiPath}`;
        } catch {}
      }
      const { data } = await dobAxios.get(fetchUrl);
      const chunk = data?.d?.results || data?.value || [];
      all.push(...chunk);
      nextUrl = data?.d?.__next || data?.['odata.nextLink'] || null;
    }
    if (all.length >= 2000) break; // safety cap
  }
  return all;
}

// Update single item — payload is flat { InternalName: value }
// Handles special: Text/Choice/Currency/Number/DateTime/Boolean
export async function updateDobItem(id, payload) {
  const entity = await getDobEntityType();
  const body = { __metadata: { type: entity }, ...payload };
  const url = `${dobListApi()}/items(${id})`;
  const { data } = await dobAxios.post(url, body, {
    headers: {
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
  });
  return data;
}

// Bulk update helper
export async function bulkUpdateDobItems(updates) {
  // updates: [{id, payload}]
  const results = [];
  for (const u of updates) {
    // sequential to respect digest throttle
    const r = await updateDobItem(u.id, u.payload);
    results.push(r);
  }
  return results;
}

// Create item (if needed later)
export async function createDobItem(payload) {
  const entity = await getDobEntityType();
  const body = { __metadata: { type: entity }, ...payload };
  const url = `${dobListApi()}/items`;
  const { data } = await dobAxios.post(url, body);
  return data?.d || data;
}
