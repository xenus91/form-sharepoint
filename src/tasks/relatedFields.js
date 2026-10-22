// src/tasks/relatedFields.js
// Загрузка произвольных полей из связанного элемента задачи (RelatedItems → ProblemsPallet).
// Список полей задаётся в TaskBehaviour.Behaviour: "rf": [ { "f": "THU", "ti": "ЕО" }, ... ].
//
// Особенности:
//   • поддерживаются lookup-поля вида "Recipient/SCNumberText" (автоматически добавляется $expand);
//   • запросы склеиваются в батч (до 30 Id в одном $filter) — чтобы список задач не спамил SharePoint;
//   • результат кэшируется в памяти на 5 минут, одинаковые запросы дедуплицируются (inflight);
//   • ошибки никогда не пробрасываются наружу — карточка просто не показывает блок.

import apiClient from "../api";

const CACHE_TTL_MS = 5 * 60 * 1000;
const BATCH_DELAY_MS = 25;
const BATCH_CHUNK = 30;

const cache = new Map(); // key -> { at, data }
const pending = new Map(); // batchKey -> { listId, fields, items: Map<itemId, resolve[]>, timer }

function nowKey(listId, itemId, fields) {
  return `${listId}:${itemId}:${fields.map((f) => f.internalName).join("|")}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Разбирает RelatedItems задачи → ссылка на первый связанный элемент.
 * @param {string|Array|object} related
 * @returns {{listId:string, itemId:number}|null}
 */
export function parseRelatedRef(related) {
  let parsed = related;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    if (parsed && typeof parsed === "object" && (parsed.ListId || parsed.listId)) parsed = [parsed];
    else return null;
  }
  const first = parsed[0];
  if (!first) return null;
  const listIdRaw = first.ListId || first.listId;
  const itemIdRaw = first.ItemId || first.itemId || first.ItemID;
  if (!listIdRaw || itemIdRaw === undefined || itemIdRaw === null) return null;
  const itemId = Number(itemIdRaw);
  if (!listIdRaw || Number.isNaN(itemId)) return null;
  return { listId: String(listIdRaw).replace(/[{}]/g, ""), itemId };
}

/** Строит $select/$expand для списка полей (включая lookup вида Lookup/Field). */
function buildSelectExpand(fields) {
  const selects = new Set(["Id"]);
  const expands = new Set();
  for (const f of fields) {
    const raw = String(f.internalName || "").trim();
    if (!raw) continue;
    const [head, tail] = raw.split("/");
    if (tail) {
      expands.add(head);
      selects.add(`${head}/${tail}`);
    } else {
      selects.add(head);
    }
  }
  return { select: [...selects].join(","), expand: [...expands].join(",") };
}

/** Примитивная очистка значения поля SharePoint → строка. */
function stringifyValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return stringifyValue(value[0]);
  if (typeof value === "object") {
    if (value.results && Array.isArray(value.results)) return stringifyValue(value.results[0]);
    if (value.Title !== undefined) return stringifyValue(value.Title);
    if (value.Value !== undefined) return stringifyValue(value.Value);
    if (typeof value.StringValue === "string") return value.StringValue;
    return "";
  }
  if (typeof value === "number") return String(value);
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Читает значение по пути "Field" или "Lookup/Field" из сырого элемента. */
function readField(item, path) {
  if (!item) return "";
  const [head, tail] = String(path).split("/");
  if (!tail) return stringifyValue(item[head]);
  let node = item[head];
  // SharePoint иногда отдаёт раскрытое lookup-поле как "Recipient_x003a_SCNumberText"
  if (node === undefined || node === null) {
    const flat = item[`${head}_x003a_${tail}`] ?? item[`${head}_x003A_${tail}`];
    if (flat !== undefined && flat !== null) return stringifyValue(flat);
    return "";
  }
  if (node.results && Array.isArray(node.results)) node = node.results[0];
  if (Array.isArray(node)) node = node[0];
  if (!node || typeof node !== "object") return "";
  return stringifyValue(node[tail]);
}

/** Превращает сырой элемент в массив {internalName, title, value} по заданным полям. */
function extractFields(item, fields) {
  return fields.map((f) => ({
    internalName: f.internalName,
    title: f.title || f.internalName,
    value: readField(item, f.internalName),
  }));
}

function settle(batch, itemId, data) {
  const waiters = batch.items.get(itemId) || [];
  batch.items.delete(itemId);
  for (const resolve of waiters) resolve(data);
}

function remember(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 500) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

// Поля, по которым SharePoint стабильно отвечает ошибкой (опечатка в конфиге, поле удалено).
// Помним TTL и не долбим список на каждой карточке.
const brokenFields = new Map(); // `${listId}:${internalName}` -> timestamp
function isBrokenField(listId, internalName) {
  const at = brokenFields.get(`${listId}:${internalName}`);
  return !!at && Date.now() - at < CACHE_TTL_MS;
}
function markBrokenField(listId, internalName) {
  brokenFields.set(`${listId}:${internalName}`, Date.now());
  if (brokenFields.size > 200) {
    const first = brokenFields.keys().next().value;
    brokenFields.delete(first);
  }
}

async function fetchOne(listId, itemId, fields) {
  const { select, expand } = buildSelectExpand(fields);
  const url = `/web/lists(guid'${listId}')/items(${itemId})?$select=${select}${expand ? `&$expand=${expand}` : ""}`;
  const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
  return data?.d || null;
}

async function flush(batchKey) {
  const batch = pending.get(batchKey);
  if (!batch) return;
  pending.delete(batchKey);

  const { listId, fields } = batch;
  const { select, expand } = buildSelectExpand(fields);
  const ids = [...batch.items.keys()];

  for (const idsChunk of chunk(ids, BATCH_CHUNK)) {
    const filter = idsChunk.map((id) => `(Id eq ${id})`).join(" or ");
    const url =
      `/web/lists(guid'${listId}')/items?$filter=${encodeURIComponent(filter)}` +
      `&$select=${select}${expand ? `&$expand=${expand}` : ""}&$top=${idsChunk.length}`;
    try {
      const { data } = await apiClient.get(url, { headers: { Accept: "application/json;odata=verbose" } });
      const rows = data?.d?.results || [];
      const got = new Set();
      for (const row of rows) {
        if (!row || row.Id === undefined || row.Id === null) continue;
        const id = Number(row.Id);
        got.add(id);
        const values = extractFields(row, fields);
        remember(nowKey(listId, id, fields), values);
        settle(batch, id, values);
      }
      for (const id of idsChunk) if (!got.has(id)) settle(batch, id, null);
    } catch (e) {
      // Фолбэк: по одному Id (например, одно из полей в конфиге не существует в списке)
      for (const id of idsChunk) {
        let values = null;
        try {
          const row = await fetchOne(listId, id, fields);
          if (row) values = extractFields(row, fields);
        } catch {
          values = null;
        }
        // Если батч/одиночный запрос упал из-за одного «плохого» поля — пробуем каждое поле отдельно,
        // чтобы валидные поля всё равно отобразились в карточке.
        if (!values) {
          const perField = [];
          for (const f of fields) {
            if (isBrokenField(listId, f.internalName)) {
              perField.push({ internalName: f.internalName, title: f.title || f.internalName, value: "" });
              continue;
            }
            try {
              const row = await fetchOne(listId, id, [f]);
              if (row) perField.push(extractFields(row, [f])[0]);
              else perField.push({ internalName: f.internalName, title: f.title || f.internalName, value: "" });
            } catch {
              markBrokenField(listId, f.internalName);
              perField.push({ internalName: f.internalName, title: f.title || f.internalName, value: "" });
            }
          }
          values = perField;
        }
        if (values) remember(nowKey(listId, id, fields), values);
        settle(batch, id, values);
      }
    }
  }
}

/**
 * Загружает значения указанных полей из связанного элемента.
 * Запросы батчатся: одинаковые (listId + набор полей) склеиваются в один GET.
 *
 * @param {{listId:string, itemId:number}|null} ref — результат parseRelatedRef()
 * @param {Array<{internalName:string, title?:string}>} fields
 * @returns {Promise<Array<{internalName:string,title:string,value:string}>|null>}
 */
export function fetchRelatedFields(ref, fields) {
  if (!ref || !Array.isArray(fields) || fields.length === 0) return Promise.resolve(null);
  const list = fields.filter((f) => f && f.internalName);
  if (list.length === 0) return Promise.resolve(null);

  const key = nowKey(ref.listId, ref.itemId, list);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.data);

  const batchKey = `${ref.listId}::${list.map((f) => f.internalName).join("|")}`;
  return new Promise((resolve) => {
    let batch = pending.get(batchKey);
    if (!batch) {
      batch = { listId: ref.listId, fields: list, items: new Map(), timer: null };
      batch.timer = setTimeout(() => flush(batchKey), BATCH_DELAY_MS);
      pending.set(batchKey, batch);
    }
    const waiters = batch.items.get(ref.itemId) || [];
    waiters.push(resolve);
    batch.items.set(ref.itemId, waiters);
  });
}

/** Очистка кэша (например, после принудительного обновления списка задач). */
export function clearRelatedFieldsCache() {
  cache.clear();
}
