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
export async function getDobItems({ top = 100, orderBy = 'Created', orderDesc = true, filter = '', fields = null } = {}) {
  // fields: опционально массив метаданных из getDobFields — если передан, строим $select динамически (без усечённых хардкодов)
  const expands = ['Author','Editor','AttachmentFiles'].join(',');
  // Базовый safe select — системные поля, которые точно есть
  const baseSelects = ['ID','Title','Created','Modified','Author/Title','Author/Id','Editor/Title','Editor/Id','Attachments','AttachmentFiles','Guid','ContentTypeId'];
  let selects;
  if (Array.isArray(fields) && fields.length) {
    const sys = new Set(['ID','Title','Created','Modified','Author','Editor','Attachments','AttachmentFiles','Guid','ContentTypeId','ContentType','FileSystemObjectType','Id']);
    const dyn = fields
      .filter(f => !f.Hidden && f.InternalName && !sys.has(f.InternalName))
      .filter(f => !['File_x0020_Type','ComplianceAssetId','LinkTitle','PermMask','MetaInfo'].includes(f.InternalName))
      .map(f => f.InternalName);
    // Author/Editor уже в baseSelects как expand, исключаем дубликаты InternalName Author/Editor
    selects = [...baseSelects, ...dyn.filter(n => !baseSelects.join(',').includes(n))];
    // Для lookup полей типа Author/Editor — уже в expands, оставляем как есть
    // Для User полей (если есть Логин виновного — lookup) — добавим expand динамически на основе TypeAsString
    const lookupFields = fields.filter(f => (f.TypeAsString||'').toLowerCase()==='user' && dyn.includes(f.InternalName)).map(f=>f.InternalName);
    if (lookupFields.length) {
      const extraExpands = lookupFields.filter(n=>!['Author','Editor'].includes(n));
      if (extraExpands.length) {
        // расширим expands локально
      }
    }
  } else {
    selects = baseSelects;
  }
  // dynamic expands for User fields (кроме Author/Editor)
  let dynamicExpands = expands;
  if (Array.isArray(fields) && fields.length) {
    const userFields = fields.filter(f=> (f.TypeAsString||'').toLowerCase()==='user' && selects.includes(f.InternalName)).map(f=>f.InternalName);
    const extra = userFields.filter(n=> !['Author','Editor'].includes(n));
    if (extra.length) {
      // для User полей нужно выбирать Title/Id, а не просто InternalName
      selects = selects.filter(s=> !extra.includes(s));
      for (const u of extra) {
        selects.push(`${u}/Title`, `${u}/Id`);
      }
      dynamicExpands = [...new Set([...expands.split(','), ...extra])].join(',');
    }
  }
  // Для совместимости: если fields не переданы, делаем минимальный запрос (без кириллических _x...), чтобы не падать на усечённых именах
  let url = `${dobListApi()}/items?$select=${selects.join(',')}&$expand=${dynamicExpands}&$top=${top}`;
  if (orderBy) url += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  try {
    const { data } = await dobAxios.get(url);
    const results = data?.d?.results || data?.value || [];
    const next = data?.d?.__next || data?.['odata.nextLink'] || null;
    return { results, next };
  } catch (e) {
    const msg = String(e?.response?.data?.error?.message?.value || e?.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('field') || msg.includes('not found') || msg.includes('author') || e?.response?.status === 400) {
      // eslint-disable-next-line no-console
      console.warn('[dobApi] select failed, fallback to minimal+safe select', msg.slice(0,300));
      // fallback: минимальный select с корректным expand (Author/Title нужен в select если expand Author)
      const fbSelects = ['ID','Title','Created','Modified','Author/Title','Author/Id','Editor/Title','Editor/Id'];
      let fbUrl = `${dobListApi()}/items?$select=${fbSelects.join(',')}&$expand=${expands}&$top=${top}`;
      if (orderBy) fbUrl += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
      if (filter) fbUrl += `&$filter=${encodeURIComponent(filter)}`;
      try {
        const { data } = await dobAxios.get(fbUrl);
        const results = data?.d?.results || data?.value || [];
        const next = data?.d?.__next || data?.['odata.nextLink'] || null;
        return { results, next };
      } catch (e2) {
        const msg2 = String(e2?.response?.data?.error?.message?.value || e2?.message || '').toLowerCase();
        // последний fallback — без expand (если Author вообще не поддерживается на этом списке)
        if (msg2.includes('author')) {
          console.warn('[dobApi] fallback without Author expand', msg2.slice(0,200));
          let fb2 = `${dobListApi()}/items?$select=ID,Title,Created,Modified&$top=${top}`;
          if (orderBy) fb2 += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
          if (filter) fb2 += `&$filter=${encodeURIComponent(filter)}`;
          const { data } = await dobAxios.get(fb2);
          const results = data?.d?.results || data?.value || [];
          const next = data?.d?.__next || data?.['odata.nextLink'] || null;
          return { results, next };
        }
        throw e2;
      }
    }
    throw e;
  }
}

// Paginated fetch helper — respects SharePoint __next
export async function getDobItemsPaged({ pageSize = 50, fields = null } = {}) {
  const all = [];
  let nextUrl = null;
  let first = true;
  while (first || nextUrl) {
    let url;
    if (first) {
      const { results, next } = await getDobItems({ top: pageSize, fields });
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
