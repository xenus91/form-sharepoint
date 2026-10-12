// src/features/dob/components/requestForm/toCreatePayload.js
// Значения формы создания заявки → payload для SharePoint (odata=verbose).
//
// Правила те же, что в форме заявки (DobTaskEditView) и в диалоге результата
// (ContentTypeResultDialog) — иначе один и тот же тип поля записывался бы
// по-разному в разных местах:
//   • «Пользователь или группа» → <InternalName>Id: число или Collection(Edm.Int32);
//   • MultiChoice → строка «a;#b»;
//   • Boolean → true/false, Number → число, остальное → строка.

/** Значение поля «пользователь» из автокомплита в массив людей. */
export function asUserList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    // пустые значения отсеиваем ДО преобразования, иначе null стал бы {Id: 0}
    .filter((u) => u !== null && u !== undefined && u !== "")
    .map((u) => (u && typeof u === "object" ? u : { Id: Number(u) }))
    .filter((u) => u && Number.isFinite(Number(u.Id)));
}

/**
 * @param {Array<object>} controls — контролы из buildContentTypeForm
 * @param {Record<string, any>} values — значения по internalName
 * @param {{internalName?:string, multiple?:boolean}} [resultBlock] — поле результата
 * @param {string} [result] — выбранное значение результата
 * @returns {Record<string, any>} payload для createDobItem
 */
export function toCreatePayload(controls, values = {}, resultBlock = null, result = "") {
  const payload = {};

  const put = (name, value) => {
    if (name && value !== undefined) payload[name] = value;
  };

  for (const control of controls || []) {
    const value = values?.[control.internalName];
    if (control.kind === "person") {
      const ids = asUserList(value).map((u) => Number(u.Id)).filter((n) => Number.isFinite(n));
      if (ids.length === 0) continue;
      payload[`${control.internalName}Id`] = (control.multiple === true || ids.length > 1)
        ? { __metadata: { type: "Collection(Edm.Int32)" }, results: ids }
        : ids[0];
      continue;
    }
    if (control.kind === "boolean") {
      put(control.internalName, value === true);
      continue;
    }
    if (control.kind === "number") {
      const text = String(value ?? "").trim();
      if (text === "") continue;
      const num = Number(text.replace(",", "."));
      put(control.internalName, Number.isFinite(num) ? num : text);
      continue;
    }
    if (control.kind === "multichoice") {
      const list = Array.isArray(value) ? value.filter(Boolean).map(String) : (value ? [String(value)] : []);
      if (list.length === 0) continue;
      put(control.internalName, list.join(";#"));
      continue;
    }
    const text = value === undefined || value === null ? "" : String(value);
    if (text.trim() === "") continue;
    put(control.internalName, text);
  }

  if (resultBlock?.internalName && String(result || "").trim()) {
    payload[resultBlock.internalName] = String(result).trim();
  }
  return payload;
}
