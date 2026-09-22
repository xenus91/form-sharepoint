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

function extractBadField(msg = '') {
  const m1 = String(msg).match(/Поле или свойство\s+['"]?([^'"\s]+)['"]?\s+не существует/i);
  if (m1) return m1[1].replace(/^['"]|['"]$/g, '');
  const m2 = String(msg).match(/Столбца\s+['"]([^'"]+)['"]\s+не существует/i);
  if (m2) return m2[1];
  const m3 = String(msg).match(/Field or property\s+['"]([^'"]+)['"]/i);
  if (m3) return m3[1];
  const m4 = String(msg).match(/column\s+['"]([^'"]+)['"]/i);
  if (m4) return m4[1];
  return null;
}

// Items with OData — supports pagination via $top &$skiptoken or flat fetch
// По просьбе — без $select, просто items + expand, SP вернёт всё сам
export async function getDobItems({ top = 100, orderBy = 'Created', orderDesc = true, filter = '', fields = null } = {}) {
  // expands: Author/Editor всегда, + динамические User поля из fields
  let expands = ['Author','Editor','AttachmentFiles'].join(',');
  if (Array.isArray(fields) && fields.length) {
    const userFields = fields.filter(f=> (f.TypeAsString||'').toLowerCase()==='user' && !['Author','Editor'].includes(f.InternalName) && !f.Hidden).map(f=>f.InternalName);
    if (userFields.length) {
      expands = [...new Set([...expands.split(','), ...userFields])].join(',');
    }
  }
  let currentFilter = filter;
  let currentExpands = expands;
  // для $expand SharePoint требует $select с целевыми полями Author/Title и т.д., иначе 400
  // делаем $select=*,Author/Title,Author/Id,Editor/Title,Editor/Id + UserFail/Title...
  function buildSelectForExpands(exp) {
    const parts = ['*'];
    for (const e of exp.split(',').filter(Boolean)) {
      if (e === 'AttachmentFiles') continue; // коллекция, не требует Title/Id
      parts.push(`${e}/Title`, `${e}/Id`);
    }
    return parts.join(',');
  }
  let attempt = 0;
  while (attempt < 5) {
    const selectForExpand = buildSelectForExpands(currentExpands);
    let url = `${dobListApi()}/items?$select=${selectForExpand}&$expand=${currentExpands}&$top=${top}`;
    if (orderBy) url += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
    if (currentFilter) url += `&$filter=${encodeURIComponent(currentFilter)}`;
    try {
      const { data } = await dobAxios.get(url);
      const results = data?.d?.results || data?.value || [];
      const next = data?.d?.__next || data?.['odata.nextLink'] || null;
      return { results, next };
    } catch (e) {
      const rawMsg = e?.response?.data?.error?.message?.value || e?.message || '';
      const msg = String(rawMsg);
      const lower = msg.toLowerCase();
      console.warn(`[dobApi] items without select failed attempt ${attempt}:`, msg.slice(0,600));
      // если падает из-за $expand на User поле — убираем его
      if (lower.includes('does not exist') || lower.includes('не существует') || lower.includes('field') || lower.includes('column')) {
        const bad = extractBadField(msg);
        if (bad && currentExpands.split(',').includes(bad)) {
          console.warn(`[dobApi] remove bad expand "${bad}" and retry`);
          currentExpands = currentExpands.split(',').filter(x=>x!==bad).join(',') || 'Author,Editor';
          attempt++;
          continue;
        }
        if (bad && currentExpands.toLowerCase().includes(bad.toLowerCase())) {
          const toRemove = currentExpands.split(',').find(x=> x.toLowerCase()===bad.toLowerCase() || x.toLowerCase().includes(bad.toLowerCase()));
          if (toRemove) {
            currentExpands = currentExpands.split(',').filter(x=>x!==toRemove).join(',') || 'Author,Editor';
            attempt++;
            continue;
          }
        }
      }
      if (currentFilter && (lower.includes('does not exist') || lower.includes('не существует') || lower.includes('column') || lower.includes('field'))) {
        console.warn('[dobApi] drop filter due to column error (no select mode)');
        currentFilter = '';
        attempt++;
        continue;
      }
      if (lower.includes('expand') && currentExpands !== 'Author,Editor') {
        currentExpands = 'Author,Editor';
        attempt++;
        continue;
      }
      throw e;
    }
  }
  throw new Error('getDobItems failed after retries');
}

// Paginated fetch helper — respects SharePoint __next
export async function getDobItemsPaged({ pageSize = 50, fields = null, filter = '' } = {}) {
  const all = [];
  let nextUrl = null;
  let first = true;
  while (first || nextUrl) {
    let url;
    if (first) {
      const { results, next } = await getDobItems({ top: pageSize, fields, filter });
      all.push(...results);
      nextUrl = next;
      first = false;
    } else {
      let fetchUrl = nextUrl;
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
        try {
          const u = new URL(nextUrl);
          const apiPath = u.pathname + u.search;
          const isDob = u.pathname.toLowerCase().includes('/sites/dob/');
          fetchUrl = `${isDob ? '/dob-api' : '/api'}${apiPath}`;
        } catch {}
      }
      const { data } = await dobAxios.get(fetchUrl);
      const chunk = data?.d?.results || data?.value || [];
      all.push(...chunk);
      nextUrl = data?.d?.__next || data?.['odata.nextLink'] || null;
    }
    if (all.length >= 2000) break;
  }
  return all;
}

// Update single item — payload is flat { InternalName: value } — resilient to bad fields
export async function updateDobItem(id, payload) {
  let currentPayload = { ...payload };
  let attempt = 0;
  while (attempt < 6) {
    const entity = await getDobEntityType();
    const body = { __metadata: { type: entity }, ...currentPayload };
    const url = `${dobListApi()}/items(${id})`;
    try {
      const { data } = await dobAxios.post(url, body, {
        headers: {
          'X-HTTP-Method': 'MERGE',
          'IF-MATCH': '*',
        },
      });
      return data;
    } catch (e) {
      const rawMsg = e?.response?.data?.error?.message?.value || e?.message || '';
      const msg = String(rawMsg);
      const lower = msg.toLowerCase();
      const bad = extractBadField(msg);
      console.warn(`[dobApi] update failed attempt ${attempt} badField=${bad}`, msg.slice(0,800));
      // Если поле не существует — убираем и ретраем
      if (bad && (lower.includes('не существует') || lower.includes('does not exist') || lower.includes('not exist'))) {
        // Найдём точный ключ в currentPayload (учёт регистра и OData-префиксов)
        const keys = Object.keys(currentPayload);
        let keyToRemove = keys.find(k => k === bad);
        if (!keyToRemove) keyToRemove = keys.find(k => k.toLowerCase() === bad.toLowerCase());
        if (!keyToRemove) keyToRemove = keys.find(k => k.toLowerCase().endsWith(bad.toLowerCase()) || bad.toLowerCase().endsWith(k.toLowerCase()));
        if (!keyToRemove) {
          // также пробуем без звёздочек и кавычек
          const cleanBad = bad.replace(/^[*"'\s]+|[*"'\s]+$/g, '');
          keyToRemove = keys.find(k => k === cleanBad || k.toLowerCase() === cleanBad.toLowerCase());
        }
        if (keyToRemove) {
          console.warn(`[dobApi] removing bad field "${keyToRemove}" (reported as "${bad}") and retry`);
          delete currentPayload[keyToRemove];
          // также чистим варианты с OData__
          delete currentPayload[`OData__${keyToRemove}`];
          delete currentPayload[`OData_${keyToRemove}`];
          // и без ведущего _
          if (keyToRemove.startsWith('_')) delete currentPayload[keyToRemove.slice(1)];
          attempt++;
          continue;
        }
        // если не нашли точный ключ, попробуем удалить любой ключ который содержит bad как подстроку
        const fuzzy = keys.find(k => k.includes(bad) || bad.includes(k));
        if (fuzzy) {
          console.warn(`[dobApi] fuzzy remove "${fuzzy}" for bad "${bad}"`);
          delete currentPayload[fuzzy];
          attempt++;
          continue;
        }
      }
      // Если ошибка всё ещё о несуществующем свойстве но bad не извлекся — пробуем лог и ретрай удалением всех подозреваемых (Calculated с Formula)
      if ((lower.includes('не существует') || lower.includes('does not exist')) && attempt === 0) {
        console.warn('[dobApi] could not extract bad field, payload keys', Object.keys(currentPayload));
      }
      throw e;
    }
  }
  throw new Error('updateDobItem failed after retries');
}

export async function bulkUpdateDobItems(updates) {
  const results = [];
  for (const u of updates) {
    const r = await updateDobItem(u.id, u.payload);
    results.push(r);
  }
  return results;
}

export async function createDobItem(payload) {
  const entity = await getDobEntityType();
  const body = { __metadata: { type: entity }, ...payload };
  const url = `${dobListApi()}/items`;
  const { data } = await dobAxios.post(url, body);
  return data?.d || data;
}

export async function getDobItem(id) {
  if (!id) throw new Error('getDobItem: id required');
  const fields = await getDobFields().catch(()=>[]);
  let expands = ['Author','Editor','AttachmentFiles'].join(',');
  if (Array.isArray(fields) && fields.length) {
    const userFields = fields.filter(f=> (f.TypeAsString||'').toLowerCase()==='user' && !['Author','Editor'].includes(f.InternalName) && !f.Hidden).map(f=>f.InternalName);
    if (userFields.length) expands = [...new Set([...expands.split(','), ...userFields])].join(',');
  }
  function buildSelectForExpands(exp) {
    const parts = ['*'];
    for (const e of exp.split(',').filter(Boolean)) {
      if (e === 'AttachmentFiles') continue;
      parts.push(`${e}/Title`, `${e}/Id`);
    }
    return parts.join(',');
  }
  const selectForExpand = buildSelectForExpands(expands);
  const url = `${dobListApi()}/items(${id})?$select=${selectForExpand}&$expand=${expands}`;
  const { data } = await dobAxios.get(url);
  const item = data?.d || data;
  return item;
}

export async function getDobAttachments(id) {
  const url = `${dobListApi()}/items(${id})/AttachmentFiles`;
  const { data } = await dobAxios.get(url);
  const results = data?.d?.results || data?.value || [];
  return results;
}

export async function uploadDobAttachment(id, file) {
  if (!id || !file) throw new Error('uploadDobAttachment: id and file required');
  const fileName = file.name || `image_${Date.now()}.png`;
  const buffer = await file.arrayBuffer();
  const url = `${dobListApi()}/items(${id})/AttachmentFiles/add(FileName='${encodeURIComponent(fileName).replace(/'/g, "''")}')`;
  const { data } = await dobAxios.post(url, buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
    transformRequest: (d) => d,
  });
  const result = data?.d || data;
  let src = result?.ServerRelativeUrl || result?.ServerRelativePath?.DecodedUrl || null;
  if (!src) src = `/sites/dob/doblogistic/Lists/DobLogistic/Attachments/${id}/${fileName}`;
  // В dev /sites/... не проксируется напрямую — нужно через /dob-api, в prod — абсолютный origin
  let finalUrl = src;
  try {
    const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
    if (isDev) {
      // /dob-api/sites/dob/... проксирует на https://portal.len.com
      finalUrl = `/dob-api${src}`;
    } else {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      if (src.startsWith('/')) finalUrl = `${origin}${src}`;
    }
  } catch { finalUrl = src; }
  return { ...result, ServerRelativeUrl: src, fileName, url: finalUrl, src: finalUrl };
}

export async function deleteDobAttachment(id, fileName) {
  const url = `${dobListApi()}/items(${id})/AttachmentFiles/getByFileName('${encodeURIComponent(fileName).replace(/'/g, "''")}')`;
  const { data } = await dobAxios.post(url, null, { headers: { 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' } });
  return data;
}
