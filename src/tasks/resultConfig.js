// src/tasks/resultConfig.js
// Настроечный JSON для кнопок результата.
// Позволяет без хардкода в TaskCard задавать цвет, вариант, требования к локации/доп.действиям.
// Ключ — нормализованное (lowercase) значение choice.
// Для нового типа задач достаточно добавить сюда запись, не меняя код TaskCard.
//
// ⚠ Fallback для TaskResultDefinitions (graceful 404): если SharePoint-список отсутствует,
// getResultUiConfig() возвращает эту конфигурацию. При наличии списка данные берутся из SP.
// Подробный контракт — в src/services/taskResultDefinitions.js.

export const RESULT_UI_CONFIG = {
  // Legacy: "Найдена" — зелёная, требует Where + AdditionalActions
  "найдена": {
    label: "Найдена",
    color: "success",
    variant: "contained",
    requiresLocation: true,
    requiresAdditionalActions: true,
    confirm: false,
    gradient: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)",
  },
  "найден": {
    label: "Найден",
    color: "success",
    variant: "contained",
    requiresLocation: true,
    requiresAdditionalActions: true,
    confirm: false,
    gradient: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)",
  },
  // Legacy: "Не найдена" — красная, требует подтверждения
  "не найдена": {
    label: "Не найдена",
    color: "error",
    variant: "contained",
    requiresLocation: false,
    requiresAdditionalActions: false,
    confirm: true,
    gradient: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)",
  },
  "не найден": {
    label: "Не найден",
    color: "error",
    variant: "contained",
    requiresLocation: false,
    confirm: true,
    gradient: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)",
  },
  "не найдено": {
    label: "Не найдено",
    color: "error",
    variant: "contained",
    requiresLocation: false,
    confirm: true,
    gradient: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)",
  },
  // Пример для нового типа задач — добавьте сюда свои значения:
  // "выполнено": { label: "Выполнено", color: "success", variant: "contained", requiresLocation: false },
  // "отклонено": { label: "Отклонено", color: "error", variant: "contained", confirm: true },
  // "требует уточнения": { label: "Требует уточнения", color: "warning", variant: "outlined" },

  // Fallback для всех остальных — по требованию всегда зелёная
  "_default": {
    label: undefined,
    color: "success",
    variant: "contained",
    requiresLocation: false,
    requiresAdditionalActions: false,
    confirm: false,
    gradient: "linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)",
  },
};

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Получить конфиг для конкретного choice.
 * @param {string} choiceValue
 * @returns {{ label:string, color:string, variant:string, requiresLocation:boolean, requiresAdditionalActions:boolean, confirm:boolean, gradient?:string }}
 */
export function getResultUiConfig(choiceValue) {
  const n = norm(choiceValue);
  if (RESULT_UI_CONFIG[n]) return { ...RESULT_UI_CONFIG._default, ...RESULT_UI_CONFIG[n], _key: n };
  // Попытка найти по подстроке (например, "найдена (в зоне)" -> "найдена")
  for (const [k, v] of Object.entries(RESULT_UI_CONFIG)) {
    if (k === "_default") continue;
    if (n.includes(k)) return { ...RESULT_UI_CONFIG._default, ...v, _key: k };
  }
  return { ...RESULT_UI_CONFIG._default, label: String(choiceValue).trim(), _key: "_default" };
}

/**
 * Определить, требует ли choice ввода локации или доп.действий на основе конфига
 */
export function choiceRequiresLocation(choiceValue) {
  return !!getResultUiConfig(choiceValue).requiresLocation;
}
export function choiceRequiresAdditionalActions(choiceValue) {
  return !!getResultUiConfig(choiceValue).requiresAdditionalActions;
}
export function choiceRequiresConfirm(choiceValue) {
  return !!getResultUiConfig(choiceValue).confirm;
}
