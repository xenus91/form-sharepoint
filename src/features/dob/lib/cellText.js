// src/features/dob/lib/cellText.js
//
// Значение ячейки таблицы → текст.
//
// SharePoint отдаёт «выбор» не только строкой: MultiChoice приходит коллекцией
// ({__metadata:{type:"Collection(Edm.String)"}, results:[…]}), а элементы
// коллекции бывают объектами {Value}. Если такое значение отдать AG Grid как
// есть, он вызовет String(value) и в ячейке появится «[object Object]».

/**
 * @param {any} value — значение из элемента списка
 * @returns {string}
 */
export function cellText(value) {
  if (value === null || value === undefined) return '';
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return String(value);
  if (kind !== 'object') return '';
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join('; ');
  if (Array.isArray(value.results)) return value.results.map(cellText).filter(Boolean).join('; ');
  if (value.__deferred) return '';
  for (const key of ['Value', 'Label', 'Title', 'Name', 'LookupValue']) {
    if (value[key] !== null && value[key] !== undefined) return cellText(value[key]);
  }
  return '';
}

export default cellText;
