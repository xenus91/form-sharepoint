// src/features/dob/lib/personText.js
//
// Текст ячейки для полей «Пользователь или группа» (User и UserMulti) в
// таблице #dob_requests. Требование 2026-10-15: «корректное отображение в
// таблице также как реализовано в таблице задач» — то есть показываем ФИО,
// а не объект и не пустоту.
//
// Что приходит из SharePoint REST (odata=verbose) с $expand:
//   • одно значение  → { Id, Title, EMail, … }
//   • несколько      → { __metadata: { type: 'Collection(SP.User)' }, results: [ {Title}, … ] }
//   • без $expand    → { __deferred: { uri: '…/FieldValuesAsText' } } и рядом <поле>Id
// В таблице задач те же данные показывает titleOf() из lib/dobFormFields.js:
// для коллекции — Title каждого значения через запятую, иначе Title/Value,
// иначе Id. Здесь — те же правила, но вынесены в leaf-модуль (его можно
// импортировать и в грид, и в тесты без тяги за формой).

const NAME_KEYS = ['Title', 'Name', 'LookupValue', 'Label', 'Value'];

const asArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && Array.isArray(value.results)) return value.results;
  return [value];
};

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * ФИО одного человека из значения поля (объект {Title}, строка, число).
 * @param {any} node
 * @returns {string}
 */
export function personName(node) {
  if (node === null || node === undefined) return '';
  const kind = typeof node;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return clean(node);
  if (kind !== 'object') return '';
  // Значение не раскрыто — показывать нечего (URL в ячейке не нужен).
  if (node.__deferred) return '';
  for (const key of NAME_KEYS) {
    if (node[key] !== null && node[key] !== undefined && node[key] !== '') return clean(node[key]);
  }
  return '';
}

/**
 * Значение поля «Пользователь или группа» → текст ячейки.
 * UserMulti раскрывается в список ФИО через запятую — как в таблице задач.
 * @param {any} value
 * @returns {string}
 */
export function personNames(value) {
  if (value === null || value === undefined) return '';
  const items = asArray(value);
  return items
    .map((item) => personName(item))
    .filter(Boolean)
    .join(', ');
}

/**
 * Список ФИО поля людей по строке списка: само значение, OData_-варианты,
 * строковый ключ «<поле>/Title» и, когда ничего не раскрыто, Id поля.
 * @param {object|null|undefined} row — строка списка
 * @param {string} internal — внутреннее имя поля
 * @returns {string[]}
 */
export function personNameList(row, internal) {
  if (!row || !internal) return [];
  const candidates = [
    row[internal],
    row[`OData__${internal}`],
    row[`OData_${internal}`],
    internal.startsWith('_') ? row[internal.slice(1)] : undefined,
    row[`${internal}/Title`],
  ];
  for (const candidate of candidates) {
    const names = asArray(candidate).map(personName).filter(Boolean);
    if (names.length) return names;
  }
  // $expand мог не сработать (SharePoint отвечает 400 на часть User-полей) —
  // тогда в строке есть только Id. Лучше показать его, чем пустую ячейку.
  const id = row[`${internal}Id`] ?? row[`OData__${internal}Id`] ?? row[`OData_${internal}Id`];
  if (id !== null && id !== undefined && id !== '') return [clean(id)];
  return [];
}

/**
 * Текст ячейки поля людей по строке списка (ФИО через запятую).
 * @param {object|null|undefined} row — строка списка
 * @param {string} internal — внутреннее имя поля
 * @returns {string}
 */
export function personCellText(row, internal) {
  return personNameList(row, internal).join(', ');
}

export default personCellText;
