// src/tasks/verbosePayload.js
// Формат payload для SharePoint (odata=verbose) и определение multi-полей.
//
// Перенесено из src/features/dob/api/dobApi.js (2026-10-16): логика не
// зависит от сайта — она про типы колонок, поэтому живёт рядом с задачами.

const MULTI_CHOICE_TYPES = new Set(['multichoice', 'gridchoice']);
const MULTI_LOOKUP_TYPES = new Set(['lookupmulti', 'usermulti']);

function fieldTypeOf(field) {
  return String(field?.TypeAsString || '').trim().toLowerCase();
}

function isMultiField(field) {
  return MULTI_CHOICE_TYPES.has(fieldTypeOf(field))
    || MULTI_LOOKUP_TYPES.has(fieldTypeOf(field))
    || field?.AllowMultipleValues === true;
}

/** «a;#b» → ['a', 'b'] */
function splitChoiceString(value) {
  return String(value === null || value === undefined ? '' : value)
    .split(';#')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function collectionOf(values, kind) {
  return {
    __metadata: { type: kind === 'int' ? 'Collection(Edm.Int32)' : 'Collection(Edm.String)' },
    results: values,
  };
}

/** Поле по ключу payload: сам InternalName или <InternalName>Id (люди/лукапы). */
function fieldOfPayloadKey(fields, key) {
  const raw = String(key || '');
  const base = raw.startsWith('OData_') ? raw.slice('OData_'.length) : raw;
  const wanted = new Set([base, `${base}Id`, base.replace(/Id$/, '')].map((n) => n.toLowerCase()));
  for (const field of fields || []) {
    const internal = String(field?.InternalName || '').toLowerCase();
    if (wanted.has(internal)) return field;
    // OData-варианты кодированных имён (_x0414_…) тоже считаем тем же полем
    if (raw.startsWith('OData_') && internal && `odata_${internal}` === raw.toLowerCase()) return field;
  }
  return null;
}

/**
 * Приводим значения payload к виду, которого ждёт SharePoint при odata=verbose.
 * mode = 'collections' — документированный формат (объект-коллекция),
 * mode = 'strings'     — запасной вариант со строкой «;#» (старое поведение).
 * Однозначным колонкам, которым по ошибке прислали коллекцию, значение
 * расплющивается: иначе SP отвечает обратной ошибкой узла.
 */
export function toVerbosePayload(payload, fields, mode = 'collections') {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined) continue;
    const field = fieldOfPayloadKey(fields, key);
    const multi = field ? isMultiField(field) : false;
    const lookupLike = MULTI_LOOKUP_TYPES.has(fieldTypeOf(field)) || /Id$/.test(key);
    // Без метаданных признак многозначности — разделитель «;#» в строке,
    // а также явно объявленный вызывающей стороной тип Collection(...).
    const looksLikeMultiString = !field && typeof value === 'string' && value.includes(';#');
    const declaredCollection = Boolean(
      !field
      && value && typeof value === 'object'
      && typeof value.__metadata?.type === 'string'
      && value.__metadata.type.startsWith('Collection('),
    );
    if (multi || looksLikeMultiString || declaredCollection) {
      let values = value;
      if (typeof value === 'string') values = splitChoiceString(value);
      else if (Array.isArray(value)) values = value;
      else if (value && Array.isArray(value.results)) values = value.results;
      if (Array.isArray(values)) {
        if (mode === 'strings' && !lookupLike) {
          out[key] = values.join(';#'); // старое поведение: строкой
        } else {
          const numeric = values.every((v) => typeof v === 'number' || /^\d+$/.test(String(v)));
          out[key] = collectionOf(values.map((v) => (numeric ? Number(v) : String(v))), lookupLike || numeric ? 'int' : 'string');
        }
      } else {
        out[key] = value;
      }
      continue;
    }
    // Однозначное поле, а пришла коллекция → берём первое значение (или null).
    if (!multi && value && typeof value === 'object' && Array.isArray(value.results)) {
      out[key] = value.results.length > 0 ? value.results[0] : null;
      continue;
    }
    out[key] = value;
  }
  return out;
}
