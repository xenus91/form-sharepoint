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
export async function getDobItems({ top = 100, orderBy = 'Created', orderDesc = true, filter = '', fields = null } = {}) {
  const expands = ['Author','Editor','AttachmentFiles'].join(',');
  const baseSelects = ['ID','Title','Created','Modified','Author/Title','Author/Id','Editor/Title','Editor/Id'];
  let selects;
  let dynamicExpands = expands;
  const badFields = new Set(['Guid','GUID']);
  if (Array.isArray(fields) && fields.length) {
    const sys = new Set(['ID','Title','Created','Modified','Author','Editor','Attachments','AttachmentFiles','Guid','GUID','ContentTypeId','ContentType','FileSystemObjectType','Id']);
    const dyn = fields
      .filter(f => !f.Hidden && f.InternalName && !sys.has(f.InternalName) && !badFields.has(f.InternalName))
      .filter(f => !['File_x0020_Type','ComplianceAssetId','LinkTitle','PermMask','MetaInfo','AppAuthor','AppEditor','LinkTitleNoMenu','_UIVersionString','DocIcon','ItemChildCount','FolderChildCount'].includes(f.InternalName))
      .map(f => f.InternalName);
    selects = [...baseSelects, ...dyn.filter(n => !baseSelects.join(',').includes(n))];
  } else {
    selects = [...baseSelects];
  }
  if (Array.isArray(fields) && fields.length) {
    const userFields = fields.filter(f=> (f.TypeAsString||'').toLowerCase()==='user' && selects.includes(f.InternalName)).map(f=>f.InternalName);
    const extra = userFields.filter(n=> !['Author','Editor'].includes(n));
    if (extra.length) {
      selects = selects.filter(s=> !extra.includes(s));
      for (const u of extra) {
        selects.push(`${u}/Title`, `${u}/Id`);
      }
      dynamicExpands = [...new Set([...expands.split(','), ...extra])].join(',');
    }
  }

  let attempt = 0;
  let currentSelects = [...selects];
  let currentFilter = filter;
  let currentExpands = dynamicExpands;

  while (attempt < 15) {
    let url = `${dobListApi()}/items?$select=${currentSelects.join(',')}&$expand=${currentExpands}&$top=${top}`;
    if (orderBy) url += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
    if (currentFilter) url += `&$filter=${encodeURIComponent(currentFilter)}`;
    try {
      const { data } = await dobAxios.get(url);
      const results = data?.d?.results || data?.value || [];
      const next = data?.d?.__next || data?.['odata.nextLink'] || null;
      if (attempt > 0) console.warn(`[dobApi] auto-retry success after ${attempt} bad fields removed, final selects ${currentSelects.length}`);
      return { results, next };
    } catch (e) {
      const rawMsg = e?.response?.data?.error?.message?.value || e?.message || '';
      const msg = String(rawMsg);
      const lower = msg.toLowerCase();
      console.warn(`[dobApi] select/filter failed attempt ${attempt}:`, msg.slice(0,600));

      // filter on calculated/unknown column -> drop filter
      if (currentFilter && (lower.includes('does not exist') || lower.includes('не существует')) && (lower.includes('_x0') || lower.includes('column') || lower.includes('field') || lower.includes('guid'))) {
        const bad = extractBadField(msg);
        if (bad && currentFilter.includes(bad)) {
          console.warn(`[dobApi] filter bad field "${bad}" -> drop filter`);
          currentFilter = '';
          attempt++;
          continue;
        }
        if (lower.includes('column') || lower.includes('field')) {
          console.warn('[dobApi] drop filter due to column error');
          currentFilter = '';
          attempt++;
          continue;
        }
      }

      if (lower.includes('does not exist') || lower.includes('не существует') || lower.includes('field') || lower.includes('column') || lower.includes('guid') || e?.response?.status === 400 || e?.response?.status === 500) {
        const bad = extractBadField(msg);
        if (bad) {
          const normalized = bad.replace(/^\*+/, '_');
          let toRemove = null;
          if (currentSelects.includes(bad)) toRemove = bad;
          else if (currentSelects.includes(normalized)) toRemove = normalized;
          else {
            const candidates = currentSelects.filter(s => s === bad || s === normalized || s.includes(bad) || bad.includes(s));
            if (candidates.length === 1) toRemove = candidates[0];
            else if (candidates.length > 1) toRemove = candidates.sort((a,b)=>a.length-b.length)[0];
            else {
              const badLower = bad.toLowerCase().replace(/^_/, '');
              const cand2 = currentSelects.find(s => s.toLowerCase().replace(/^_/, '') === badLower || s.toLowerCase().includes(badLower));
              if (cand2) toRemove = cand2;
            }
          }
          if (toRemove) {
            console.warn(`[dobApi] remove bad field "${toRemove}" (reported "${bad}") and retry`);
            currentSelects = currentSelects.filter(s => s !== toRemove && !s.startsWith(toRemove + '/'));
            if (currentExpands.split(',').includes(toRemove)) {
              currentExpands = currentExpands.split(',').filter(x=>x!==toRemove).join(',') || expands;
            }
            badFields.add(toRemove);
            attempt++;
            continue;
          } else {
            console.warn(`[dobApi] bad field "${bad}" not in selects, blacklist and retry`);
            badFields.add(bad);
            if (bad.toLowerCase().includes('guid')) {
              currentSelects = currentSelects.filter(s => !s.toLowerCase().includes('guid'));
              currentExpands = currentExpands.split(',').filter(x=>!x.toLowerCase().includes('guid')).join(',') || expands;
              attempt++;
              continue;
            }
            if (attempt === 0) {
              currentSelects = [...baseSelects];
              currentExpands = expands;
              if (currentFilter) currentFilter = '';
              attempt++;
              continue;
            }
          }
        }
        if (attempt === 0) {
          console.warn('[dobApi] unknown bad field, fallback to minimal');
          currentSelects = [...baseSelects];
          currentExpands = expands;
          if (currentFilter) currentFilter = '';
          attempt++;
          continue;
        }
      }
      // not recoverable -> throw to fallback
      break;
    }
  }

  // fallback minimal
  console.warn('[dobApi] fallback to minimal select after auto-retry');
  const fbSelects = ['ID','Title','Created','Modified','Author/Title','Author/Id','Editor/Title','Editor/Id'];
  let fbUrl = `${dobListApi()}/items?$select=${fbSelects.join(',')}&$expand=${expands}&$top=${top}`;
  if (orderBy) fbUrl += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
  // filter already dropped
  const { data } = await dobAxios.get(fbUrl);
  const results = data?.d?.results || data?.value || [];
  const next = data?.d?.__next || data?.['odata.nextLink'] || null;
  return { results, next };
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

// Update single item — payload is flat { InternalName: value }
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
