// src/features/dob/api/dobApi.js
// High-level DOB list operations — fields, items, update
import { dobApiBase, dobListApi, dobAxios, DOB_LIST_GUID } from './dobClient';
import apiClient from '../../../api';
import { TASKS_LIST_API, TASKS_LIST_GUID } from '../../../tasks/config';

// ⭐ Списки основного сайта (ProblemsPallet/Tasks) редактируются ТОЙ ЖЕ формой, что
// заявки ДОБ: #dob_tasks/<id>?list=<GUID основного списка>. Для таких списков ходим
// через основной клиент (свой digest и прокси /api), для остальных — через DOB-клиент
// (/dob-api/sites/dob/doblogistic). Так задача «Результат проверки ООБ» открывается
// в форме ДОБ, а пишется в свой список.
const MAIN_LIST_GUIDS = new Set([String(TASKS_LIST_GUID || '').toLowerCase()]);

/** Список принадлежит основному сайту (а не сайту ДОБ). */
export function isMainSiteList(listGuid) {
  const id = String(listGuid || '').trim().replace(/[{}]/g, '').toLowerCase();
  return MAIN_LIST_GUIDS.has(id);
}

/** Путь к списку: основной сайт (относительно apiClient) или сайт ДОБ (абсолютный). */
function listApiOf(listGuid) {
  return isMainSiteList(listGuid) ? TASKS_LIST_API : dobListApi(listGuid);
}

/** HTTP-клиент под сайт списка (у основного — свой digest и прокси /api). */
function httpOf(listGuid) {
  return isMainSiteList(listGuid) ? apiClient : dobAxios;
}

/** Конфиг чтения: основной клиент кэширует GET — для формы читаем без кэша. */
function readConfig(listGuid) {
  return isMainSiteList(listGuid) ? { __noCache: true } : undefined;
}


// Fetch ListItemEntityTypeFullName for MERGE payloads (кэш по списку)
const entityTypeCache = new Map();
export async function getDobEntityType(listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  if (entityTypeCache.has(listGuid)) return entityTypeCache.get(listGuid);
  const url = `${listApiOf(listGuid)}?$select=ListItemEntityTypeFullName`;
  const { data } = await httpOf(listGuid).get(url);
  const type = data?.d?.ListItemEntityTypeFullName
    || (listGuid === DOB_LIST_GUID ? 'SP.Data.DoblogisticListItem' : 'SP.Data.RequestsTaskListItem');
  entityTypeCache.set(listGuid, type);
  return type;
}

// Fetch fields metadata for the DOB list (filtered)
export async function getDobFields(listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  const url = `${listApiOf(listGuid)}/fields?$select=InternalName,Title,TypeAsString,TypeDisplayName,Required,Hidden,ReadOnlyField,Description,DefaultValue,Choices,FillInChoice,AllowMultipleValues,LookupList,LookupField,Formula,SchemaXml&$top=200`;
  const { data } = await httpOf(listGuid).get(url, readConfig(listGuid));
  const raw = data?.d?.results || data?.value || [];
  return raw;
}

// Защита от вызова функции напрямую как queryFn (react-query передаёт объект-контекст):
// любой не-GUID аргумент → дефолтный список заявок ДОБ.
const LIST_GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function normalizeListGuid(listGuid) {
  return typeof listGuid === 'string' && LIST_GUID_RE.test(listGuid.trim()) ? listGuid.trim() : DOB_LIST_GUID;
}

function extractBadField(msg = '') {
  const s = String(msg);
  // Свойство "_x0414..." не существует
  let m = s.match(/Свойство\s+['"“”`]?([^'"“”`\s]+)['"“”`]?\s+не существует/i);
  if (m) return m[1].replace(/^[*"'“”`\s]+|[*"'“”`\s]+$/g, '').replace(/^\*|\*$/g,'');
  m = s.match(/Поле или свойство\s+['"“”`]?([^'"“”`\s]+)['"“”`]?\s+не существует/i);
  if (m) return m[1].replace(/^[*"'“”`\s]+|[*"'“”`\s]+$/g, '').replace(/^\*|\*$/g,'');
  m = s.match(/Столбца\s+['"“”`]?([^'"“”`]+)['"“”`]?\s+не существует/i);
  if (m) return m[1].replace(/^[*"'“”`]+|[*"'“”`]+$/g, '');
  m = s.match(/Field or property\s+['"“”`]?([^'"“”`\s]+)['"“”`]?/i);
  if (m) return m[1].replace(/^[*"'“”`]+|[*"'“”`]+$/g, '');
  m = s.match(/column\s+['"“”`]?([^'"“”`\s]+)['"“”`]?/i);
  if (m) return m[1].replace(/^[*"'“”`]+|[*"'“”`]+$/g, '');
  // Fallback: любые кавычки после Свойство/Поле
  m = s.match(/["'`“”]([^"'`“”]+)["'`“”]\s+не существует/);
  if (m) return m[1].replace(/^[*]+|[*]+$/g,'');
  // Fallback: _x.... pattern
  m = s.match(/(_x[0-9A-Fa-f]{4}(?:__x[0-9A-Fa-f]{4})*_?)/);
  if (m) return m[1];
  return null;
}

// Items with OData — supports pagination via $top &$skiptoken or flat fetch
// По просьбе — без $select, просто items + expand, SP вернёт всё сам
export async function getDobItems({ top = 100, orderBy = 'Created', orderDesc = true, filter = '', fields = null, listGuid = DOB_LIST_GUID } = {}) {
  listGuid = normalizeListGuid(listGuid);
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
    let url = `${listApiOf(listGuid)}/items?$select=${selectForExpand}&$expand=${currentExpands}&$top=${top}`;
    if (orderBy) url += `&$orderby=${orderBy}${orderDesc ? ' desc' : ' asc'}`;
    if (currentFilter) url += `&$filter=${encodeURIComponent(currentFilter)}`;
    try {
      const { data } = await httpOf(listGuid).get(url);
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
export async function getDobItemsPaged({ pageSize = 50, fields = null, filter = '', listGuid = DOB_LIST_GUID } = {}) {
  listGuid = normalizeListGuid(listGuid);
  const all = [];
  let nextUrl = null;
  let first = true;
  while (first || nextUrl) {
    let url;
    if (first) {
      const { results, next } = await getDobItems({ top: pageSize, fields, filter, listGuid });
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
      const { data } = await httpOf(listGuid).get(fetchUrl);
      const chunk = data?.d?.results || data?.value || [];
      all.push(...chunk);
      nextUrl = data?.d?.__next || data?.['odata.nextLink'] || null;
    }
    if (all.length >= 2000) break;
  }
  return all;
}

// Update single item — payload is flat { InternalName: value } — resilient to bad fields
export async function updateDobItem(id, payload, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  let currentPayload = { ...payload };
  let attempt = 0;
  while (attempt < 6) {
    const entity = await getDobEntityType(listGuid);
    const body = { __metadata: { type: entity }, ...currentPayload };
    const url = `${listApiOf(listGuid)}/items(${id})`;
    try {
      const { data } = await httpOf(listGuid).post(url, body, {
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
      console.warn(`[dobApi] update failed attempt ${attempt} badField=${bad}`, msg.slice(0,800), 'cleanBad', bad?.replace?.(/^[*]+|[*]+$/g,''));
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

export async function bulkUpdateDobItems(updates, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  const results = [];
  for (const u of updates) {
    const r = await updateDobItem(u.id, u.payload, listGuid);
    results.push(r);
  }
  return results;
}

export async function createDobItem(payload, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  const entity = await getDobEntityType(listGuid);
  const body = { __metadata: { type: entity }, ...payload };
  const url = `${listApiOf(listGuid)}/items`;
  const { data } = await httpOf(listGuid).post(url, body);
  return data?.d || data;
}

export async function getDobItem(id, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  if (!id) throw new Error('getDobItem: id required');
  const fields = await getDobFields(listGuid).catch(()=>[]);
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
  const url = `${listApiOf(listGuid)}/items(${id})?$select=${selectForExpand}&$expand=${expands}`;
  const { data } = await httpOf(listGuid).get(url, readConfig(listGuid));
  const item = data?.d || data;
  return item;
}

// Элемент для read-only просмотра (диалог «Связанная заявка»): тянем сразу имя
// типа контента, чтобы показать «поля соответствуют типу контента».
// Если расширение ContentType на тенанте не поддерживается — тихо откатываемся
// на обычный getDobItem (поля всё равно приходят из метаданных списка).
export async function getDobItemForView(id, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  if (!id) throw new Error('getDobItemForView: id required');
  const fields = await getDobFields(listGuid).catch(() => []);
  const expands = ['ContentType', 'Author', 'Editor'];
  if (Array.isArray(fields) && fields.length) {
    const userFields = fields
      .filter(f => (f.TypeAsString || '').toLowerCase() === 'user' && !['Author', 'Editor'].includes(f.InternalName) && !f.Hidden)
      .map(f => f.InternalName);
    if (userFields.length) expands.push(...userFields);
  }
  const uniqueExpands = [...new Set(expands)];
  const selectParts = ['*', 'ContentType/Name', 'ContentType/StringValue'];
  for (const e of uniqueExpands) {
    if (e === 'ContentType') continue;
    selectParts.push(`${e}/Title`, `${e}/Id`);
  }
  const url = `${listApiOf(listGuid)}/items(${id})?$select=${selectParts.join(',')}&$expand=${uniqueExpands.join(',')}`;
  try {
    const { data } = await httpOf(listGuid).get(url);
    return data?.d || data;
  } catch (e) {
    const status = e?.response?.status;
    console.warn('[dobApi] getDobItemForView: fallback без $expand=ContentType', status, e?.message);
    return getDobItem(id, listGuid);
  }
}

export async function getDobAttachments(id, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  const url = `${listApiOf(listGuid)}/items(${id})/AttachmentFiles`;
  const { data } = await httpOf(listGuid).get(url);
  const results = data?.d?.results || data?.value || [];
  return results;
}

export async function uploadDobAttachment(id, file, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  if (!id || !file) throw new Error('uploadDobAttachment: id and file required');
  let fileName = file.name || `image_${Date.now()}.png`;
  // Для clipboard image.png / image.jpg делаем сразу уникальным, иначе параллельные вставки падают "имя уже используется"
  if (/^image\.png$/i.test(fileName) || /^image\.jpe?g$/i.test(fileName) || /^pasted-image/i.test(fileName)) {
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot) : '.png';
    fileName = `image_${Date.now()}_${Math.random().toString(36).slice(2,6)}${ext}`;
  }
  let attempt = 0;
  let lastError = null;
  while (attempt < 4) {
    try {
      const buffer = await file.arrayBuffer();
      const url = `${listApiOf(listGuid)}/items(${id})/AttachmentFiles/add(FileName='${encodeURIComponent(fileName).replace(/'/g, "''")}')`;
      const { data } = await httpOf(listGuid).post(url, buffer, {
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
          finalUrl = `/dob-api${src}`;
        } else {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          if (src.startsWith('/')) finalUrl = `${origin}${src}`;
        }
      } catch { finalUrl = src; }
      return { ...result, ServerRelativeUrl: src, fileName, url: finalUrl, src: finalUrl };
    } catch (e) {
      lastError = e;
      const rawMsg = e?.response?.data?.error?.message?.value || e?.message || '';
      const lower = String(rawMsg).toLowerCase();
      const isDuplicate = lower.includes('имя уже используется') || lower.includes('already exists') || lower.includes('already in use') || lower.includes('exists') && lower.includes('name');
      if (isDuplicate && attempt < 3) {
        const dot = fileName.lastIndexOf('.');
        const name = dot >= 0 ? fileName.slice(0, dot) : fileName;
        const ext = dot >= 0 ? fileName.slice(dot) : '.png';
        const base = name.replace(/_\d{10,}.*$/, '').replace(/_[a-z0-9]{2,6}$/, '');
        fileName = `${base}_${Date.now()}_${Math.random().toString(36).slice(2,6)}${ext}`;
        console.warn(`[dobApi] upload duplicate "${rawMsg.slice(0,120)}" -> retry as "${fileName}" attempt ${attempt+1}`);
        attempt++;
        // небольшая задержка чтобы избежать гонки
        await new Promise(r => setTimeout(r, 120 * (attempt)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export async function deleteDobAttachment(id, fileName, listGuid = DOB_LIST_GUID) {
  listGuid = normalizeListGuid(listGuid);
  const url = `${listApiOf(listGuid)}/items(${id})/AttachmentFiles/getByFileName('${encodeURIComponent(fileName).replace(/'/g, "''")}')`;
  const { data } = await httpOf(listGuid).post(url, null, { headers: { 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' } });
  return data;
}
