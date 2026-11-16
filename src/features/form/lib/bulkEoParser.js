// Распознавание вставленного списка пар «код получателя — номер ЕО».
// Вставка из таблиц часто содержит пустые ячейки, табы и управляющие символы
// направления текста — они не должны влиять на разбор цифр.

export const EO_NUMBER_PATTERN = /^\d{17,18}$/;
const INVISIBLE_CONTROL_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

const lineAt = (text, index) => text.slice(0, index).split(/\r\n|\r|\n/).length;

/**
 * Разобрать текст, содержащий пары «код получателя, ЕО».
 * Поддерживаются отдельные строки и TSV/вставка из Excel; пустые ячейки
 * игнорируются. Код получателя ожидается перед соответствующей ЕО.
 *
 * @param {unknown} input
 * @returns {{ rows: Array<{id:string, sourceLine:number, recipientCode:string, eoNumber:string, parseWarning:string}>, warnings: string[] }}
 */
export function parseBulkEoInput(input) {
  const text = String(input ?? "")
    .replace(INVISIBLE_CONTROL_CHARS, "")
    .replace(/\u00A0/g, " ");
  const tokens = [...text.matchAll(/\d+/g)].map((match) => ({
    value: match[0],
    line: lineAt(text, match.index ?? 0),
  }));

  const rows = [];
  const warnings = [];
  let pendingRecipient = null;

  const addRow = ({ recipient, eo, sourceLine, warning = "" }) => {
    const ordinal = rows.length + 1;
    rows.push({
      id: `parsed-${ordinal}`,
      sourceLine,
      recipientCode: recipient?.value ?? "",
      eoNumber: eo?.value ?? "",
      parseWarning: warning,
    });
  };

  for (const token of tokens) {
    if (EO_NUMBER_PATTERN.test(token.value)) {
      addRow({
        recipient: pendingRecipient,
        eo: token,
        sourceLine: pendingRecipient?.line ?? token.line,
        warning: pendingRecipient ? "" : "Перед номером ЕО не найден код получателя.",
      });
      pendingRecipient = null;
      continue;
    }

    // Короткое целое число принимаем за код получателя. Длинное, но не 17/18
    // цифр, показываем в строке ЕО с ошибкой длины — оператор сможет поправить.
    if (token.value.length <= 6) {
      if (pendingRecipient) {
        addRow({
          recipient: pendingRecipient,
          sourceLine: pendingRecipient.line,
          warning: `После кода получателя ${pendingRecipient.value} не найден номер ЕО.`,
        });
      }
      pendingRecipient = token;
      continue;
    }

    addRow({
      recipient: pendingRecipient,
      eo: token,
      sourceLine: pendingRecipient?.line ?? token.line,
      warning: EO_NUMBER_PATTERN.test(token.value)
        ? ""
        : `Номер ЕО должен состоять из 17 или 18 цифр (получено ${token.value.length}).`,
    });
    pendingRecipient = null;
  }

  if (pendingRecipient) {
    addRow({
      recipient: pendingRecipient,
      sourceLine: pendingRecipient.line,
      warning: `Для кода получателя ${pendingRecipient.value} не указан номер ЕО.`,
    });
  }

  if (tokens.length === 0 && text.trim()) {
    warnings.push("В тексте не найдены коды получателей или номера ЕО.");
  } else if (tokens.length === 0) {
    warnings.push("Вставьте пары: код получателя и номер ЕО.");
  }

  return { rows, warnings };
}

/**
 * Сопоставляет код из вставки с SCNumberText/SCNumber в SCList.
 * Сначала ищет точное совпадение (сохраняя ведущие нули), затем — числовое
 * совпадение без ведущих нулей. При неоднозначности не выбирает получателя
 * самовольно: вызывающий интерфейс должен попросить оператора выбрать.
 *
 * @param {string|number} code
 * @param {Array<object>} recipients
 * @returns {{status:"matched"|"ambiguous"|"missing", recipient:object|null, candidates:object[]}}
 */
export function matchRecipientCode(code, recipients = []) {
  const query = String(code ?? "").trim();
  if (!query) return { status: "missing", recipient: null, candidates: [] };

  const getCodes = (recipient) => [
    recipient?.scNumberText,
    recipient?.SCNumberText,
    recipient?.scNumber,
    recipient?.SCNumber,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const uniqueById = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const id = item?.id ?? item?.ID ?? item?.Id;
      const key = id == null ? item : String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const exact = uniqueById(
    recipients.filter((recipient) => getCodes(recipient).some((value) => value === query)),
  );
  if (exact.length === 1) return { status: "matched", recipient: exact[0], candidates: exact };
  if (exact.length > 1) return { status: "ambiguous", recipient: null, candidates: exact };

  const normalize = (value) => {
    const digits = String(value ?? "").match(/\d+/g)?.join("") ?? "";
    return digits.replace(/^0+(?=\d)/, "");
  };
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { status: "missing", recipient: null, candidates: [] };

  const normalized = uniqueById(
    recipients.filter((recipient) =>
      getCodes(recipient).some((value) => normalize(value) === normalizedQuery),
    ),
  );
  if (normalized.length === 1) {
    return { status: "matched", recipient: normalized[0], candidates: normalized };
  }
  if (normalized.length > 1) {
    return { status: "ambiguous", recipient: null, candidates: normalized };
  }
  return { status: "missing", recipient: null, candidates: [] };
}
