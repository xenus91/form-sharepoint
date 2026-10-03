// src/features/dob/lib/dobFormFields.js
// Общие помощники для полей ДОБ: использует и форма (DobTaskEditView), и
// read-only просмотр связанной заявки (RelatedItemDialog).
//
// Здесь только чистые функции — их удобно тестировать без DOM/SharePoint.

// Служебные поля, которые не показываем в форме/просмотре (системные +
// поля с кодированными русскими именами, дублирующие Modified и т.п.).
export const HIDDEN_FORM_FIELDS = new Set([
  'ComplianceAssetId', 'LinkTitleNoMenu', 'LinkTitle', 'Modified', 'UserFail',
  '_UIVersionString', 'DocIcon', 'FolderChildCount', 'AppEditor', 'AppAuthor',
  'ItemChildCount', 'Edit',
  'x041d_x0435__x0434__x0435__x04', 'x0414_x0430__x0442__x0430__x001',
  'x041b_x043e__x0433__x0438__x040', 'x0417_x0430__x043f__x0438__x04',
  'x0443_x0432__x0435__x0434__x04',
]);

export function isHiddenFormField(internal = '') {
  const name = String(internal);
  const normalized = name.replace(/^OData__?/, '').replace(/^_/, '');
  return HIDDEN_FORM_FIELDS.has(name) || HIDDEN_FORM_FIELDS.has(normalized) ||
    /^(?:x|_x)041d__x0435__x0434__x0435__x04|^(?:x|_x)0414__x0430__x0442__x0430__x001|^(?:x|_x)041b__x043e__x0433__x0438__x040|^(?:x|_x)0417__x0430__x043f__x0438__x04|^(?:x|_x)0443__x0432__x0435__x0434__x04/.test(normalized);
}

/** Читает значение поля из элемента SharePoint с учётом OData-префиксов. */
export function getODataValue(row, internal) {
  if (!row || !internal) return undefined;
  if (row[internal] !== undefined) return row[internal];
  if (row['OData__' + internal] !== undefined) return row['OData__' + internal];
  if (row['OData_' + internal] !== undefined) return row['OData_' + internal];
  if (internal.startsWith('_') && row[internal.slice(1)] !== undefined) return row[internal.slice(1)];
  return undefined;
}

export function looksLikeHtml(value) {
  return typeof value === 'string' && /(?:<\/?[a-z][^>]*>|&lt;\/?[a-z][^&]*&gt;)/i.test(value);
}

export function normalizeHtmlValue(value) {
  if (typeof value !== 'string') return value || '';
  if (!value.includes('&lt;')) return value;
  if (typeof DOMParser === 'undefined') return value;
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.body.textContent || value;
}

export function toEditorHtml(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value.Html ?? value.Value ?? value.Description ?? '');
  return String(value);
}

/** Текст без тегов (для проверок «поле заполнено»). */
export function stripTags(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Значение поля непустое (учитывает объекты lookup/user и HTML «<p></p>»). */
export function hasFieldValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return true;
  if (Array.isArray(value)) return value.some((v) => hasFieldValue(v));
  if (typeof value === 'object') {
    if (Array.isArray(value.results)) return value.results.some((v) => hasFieldValue(v));
    if (value.Url) return hasFieldValue(value.Url);
    if (value.Title !== undefined) return hasFieldValue(value.Title);
    if (value.Value !== undefined) return hasFieldValue(value.Value);
    if (typeof value.StringValue === 'string') return hasFieldValue(value.StringValue);
    return false;
  }
  return stripTags(value).length > 0;
}

// Разрешённые теги для read-only просмотра HTML-полей (стили/скрипты/обработчики
// вырезаем: данные приходят из SharePoint, но показывать их «как есть» небезопасно).
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'span', 'div',
  'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'figure', 'figcaption',
]);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'style', 'target', 'rel', 'class']);

/**
 * Простейшая очистка HTML для read-only просмотра: выкидываем script/style/iframe/object,
 * inline-обработчики (on*) и атрибуты вида javascript:.
 * В dev-режиме пути картинок /sites/... переводим на прокси /dob-api.
 */
export function sanitizeHtmlForView(html) {
  let out = String(html ?? '');
  if (!out) return '';
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  // целиком выкидываем опасные блоки вместе с содержимым
  out = out.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta)[\s\S]*?<\/\1\s*>/gi, '');
  out = out.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta)\b[^>]*\/?>/gi, '');
  // теги: оставляем только разрешённые, атрибуты — только безопасные
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (match.startsWith('</')) return `</${name}>`;
    const kept = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = attrRe.exec(attrs)) !== null) {
      const attr = String(m[1]).toLowerCase();
      const rawValue = m[3] ?? m[4] ?? m[5] ?? '';
      if (!ALLOWED_ATTRS.has(attr)) continue;              // в т.ч. on* обработчики
      if (/^\s*javascript:/i.test(rawValue)) continue;      // js-ссылки
      let value = rawValue;
      if (name === 'img' && attr === 'src') value = withDobProxy(value);
      if (name === 'a' && attr === 'href') value = withDobProxy(value);
      kept.push(`${attr}="${String(value).replace(/"/g, '&quot;')}"`);
    }
    const selfClosing = /\/$/.test(attrs.trim()) || name === 'br' || name === 'hr' || name === 'img';
    return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}${selfClosing ? ' /' : ''}>`;
  });
  return out;
}

/** В dev-режиме абсолютные пути сайта проксируем через /dob-api (иначе картинки 404). */
export function withDobProxy(url) {
  const value = String(url ?? '');
  if (!value) return value;
  try {
    const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
    if (isDev && value.startsWith('/') && !value.startsWith('/dob-api')) return `/dob-api${value}`;
  } catch (_e) { void _e; }
  return value;
}

function asArray(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && Array.isArray(value.results)) return value.results;
  return [value];
}

/** Значение lookup/user-поля приходит объектом { Title, Id } — показываем Title. */
function titleOf(item, internal, fallback) {
  const node = item?.[internal];
  if (node && typeof node === 'object') {
    if (Array.isArray(node.results) && node.results.length) {
      return node.results.map((r) => r?.Title ?? r?.Value ?? r?.Id ?? '').filter(Boolean).join(', ');
    }
    if (node.Title !== undefined) return String(node.Title ?? '');
    if (node.Value !== undefined) return String(node.Value ?? '');
  }
  const idValue = item?.[`${internal}Id`] ?? item?.[`OData__${internal}Id`];
  if (idValue !== undefined && idValue !== null && idValue !== '') return String(idValue);
  return fallback === undefined || fallback === null ? '' : String(fallback);
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    let d;
    // SharePoint отдаёт дату строкой «/Date(1234567890)/» или ISO
    if (typeof value === 'string' && value.startsWith('/Date(')) {
      d = new Date(Number(String(value).replace(/[^0-9]/g, '')));
    } else {
      d = new Date(value);
    }
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    void _e;
    return String(value);
  }
}

/**
 * Приводит значение поля к виду для read-only отображения.
 * @returns {{kind:'text'|'html'|'link'|'list', text:string, html?:string, href?:string, items?:string[]}}
 */
export function formatFieldValue(field, item) {
  const internal = field?.InternalName;
  const type = String(field?.TypeAsString || '').toLowerCase();
  const raw = internal ? getODataValue(item, internal) : undefined;

  if (type === 'boolean') {
    const truthy = raw === true || raw === 1 || String(raw).toLowerCase() === 'true';
    return { kind: 'text', text: truthy ? 'Да' : 'Нет' };
  }
  if (type === 'datetime') return { kind: 'text', text: formatDateTime(raw) };
  if (type === 'user' || type === 'lookup' || type === 'lookupmulti' || field?.LookupList) {
    return { kind: 'text', text: titleOf(item, internal, raw) };
  }
  if (type === 'url') {
    const url = raw && typeof raw === 'object' ? raw.Url : raw;
    const desc = raw && typeof raw === 'object' ? raw.Description : '';
    return { kind: 'link', text: String(desc || url || ''), href: withDobProxy(String(url || '')) };
  }
  if (type === 'note' || type === 'text') {
    if (looksLikeHtml(raw)) return { kind: 'html', html: sanitizeHtmlForView(normalizeHtmlValue(raw)), text: stripTags(raw) };
    return { kind: 'text', text: String(raw ?? '') };
  }
  if (type === 'multichoice' || type === 'lookupmulti' || (typeof raw === 'object' && Array.isArray(raw?.results))) {
    const items = asArray(raw).map((v) => (typeof v === 'object' ? v?.Title ?? v?.Value ?? '' : v)).filter(Boolean).map(String);
    if (items.length) return { kind: 'list', text: items.join(', '), items };
  }
  if (type === 'number' || type === 'currency' || type === 'integer') {
    const num = Number(raw);
    return { kind: 'text', text: Number.isFinite(num) ? String(num) : String(raw ?? '') };
  }
  return { kind: 'text', text: typeof raw === 'object' ? '' : String(raw ?? '') };
}

// Системные поля, которые в просмотре не нужны (метаданные элемента SharePoint).
const VIEW_SYSTEM_FIELDS = new Set([
  'ID', 'Id', 'Attachments', 'ContentType', 'ContentTypeId', 'RelatedItems',
  'OData__UIVersionString', '_UIVersionString', 'LinkTitle', 'LinkTitleNoMenu',
  'DocIcon', 'ItemChildCount', 'FolderChildCount', 'AppAuthor', 'AppEditor', 'Edit',
  'FileLeafRef', 'FileRef', 'FileDirRef', 'FSObjType', 'MetaInfo', 'ScopeId',
  'UniqueId', 'GUID', 'owshiddenversion', 'WorkflowVersion', 'WorkflowInstanceID',
  'ServerUrl', 'ContentVersion', '_ComplianceFlags', '_ComplianceTag',
  '_ComplianceTagWrittenTime', '_ComplianceTagUserId', '_IsRecord', '_Dirty',
  '_HasCopyDestinations', '_CopySource', '_ModerationStatus', '_ModerationComments',
  'Author', 'Editor', 'Created', 'Modified',
]);

/**
 * Набор полей для read-only просмотра элемента: скрытые и системные убираем,
 * по умолчанию оставляем только заполненные (showEmpty=true — показать все).
 * Поля приходят из метаданных списка, т.е. соответствуют типу контента элемента.
 *
 * @returns {Array<{internal:string,title:string,type:string,value:any,view:object}>}
 */
export function buildViewFields(fields = [], item = {}, { showEmpty = false } = {}) {
  const out = [];
  for (const field of fields || []) {
    const internal = field?.InternalName;
    if (!internal) continue;
    if (field.Hidden) continue;
    if (VIEW_SYSTEM_FIELDS.has(internal)) continue;
    if (isHiddenFormField(internal)) continue;
    const value = getODataValue(item, internal);
    const filled = hasFieldValue(value) || hasFieldValue(item?.[`${internal}Id`]);
    if (!showEmpty && !filled) continue;
    out.push({
      internal,
      title: field.Title || internal,
      type: String(field.TypeAsString || '').toLowerCase(),
      value,
      view: formatFieldValue(field, item),
    });
  }
  return out;
}

/** Имя типа контента элемента (когда SharePoint вернул $expand=ContentType). */
export function contentTypeNameOf(item) {
  const node = item?.ContentType;
  if (!node) return '';
  if (typeof node === 'string') return node;
  return String(node.Name || node.Title || node.StringValue || '');
}

export { formatDateTime };
