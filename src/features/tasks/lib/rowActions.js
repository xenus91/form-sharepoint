// src/features/tasks/lib/rowActions.js
// Действия по строке таблицы #tasks.
//
// Требование (2026-10-03): в таблице должны быть ТЕ ЖЕ действия, что в карточке
// задачи — для того же статуса и того же типа контента:
//   • «Не начата» (и любой «прочий» незавершённый статус) → «Взять в работу»;
//   • «в работе» → кнопки результатов по ContentType задачи (значения — из поля
//     результата этого типа контента, вид — из TaskBehaviour.stylingResultButton);
//   • задачу уже взял другой пользователь → в карточке кнопок нет, там плашка
//     «В работе у X» — повторяем её как информационный пункт;
//   • «Изменить» → форма задачи (как кнопка «Изменить» карточки внешней задачи).
//
// Модуль чистый: все зависимости (можно ли взять, choices, стили, обработчики)
// приходят в opts — поэтому паритет с карточкой проверяется юнит-тестами без DOM.

import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from "../../../tasks/status";

/**
 * sx для кнопки результата — по styling из Behaviour.stylingResultButton.
 * Правило то же, что в TaskCard: градиент/плоский цвет применяются только к
 * contained-кнопкам; outline получает лишь утолщённую рамку.
 *
 * @param {{variant?:string, bg?:string|null, color?:string|null, gradient?:string|null, isGradient?:(v:string)=>boolean}|null} styling
 * @returns {object}
 */
export function resultActionSx(styling) {
  if (!styling) return { borderWidth: 1.5 };
  const variant = styling.variant || "contained";
  const isGradient = typeof styling.isGradient === "function"
    ? styling.isGradient
    : (v) => /gradient\(/i.test(String(v || ""));
  const bg = styling.bg || null;
  const gradient = bg && isGradient(bg) ? bg : null;
  const textColor = styling.color || "#fff";
  return {
    ...(variant === "contained" && gradient ? { backgroundImage: gradient, color: textColor, borderColor: "transparent" } : {}),
    ...(variant === "contained" && !gradient && bg ? { backgroundColor: bg, color: textColor, borderColor: "transparent" } : {}),
    ...(variant !== "contained" ? { borderWidth: 1.5 } : {}),
  };
}

// Акцентная кнопка «Взять в работу» — тот же вид, что у кнопки в карточке
// (TaskCard/ExternalTaskCard): светло-индиговый градиент.
export const DEFAULT_TAKE_SX = {
  backgroundImage: "linear-gradient(180deg, #7B84FF 0%, #5A67D8 100%)",
  color: "#fff",
  borderColor: "transparent",
  "&:hover": { backgroundImage: "linear-gradient(180deg, #8D95FF 0%, #6B7CFF 100%)" },
};
// Вторичная «Изменить» — как в карточке внешней задачи.
export const DEFAULT_EDIT_SX = { borderColor: "rgba(23,28,143,0.35)", color: "#171c8f" };

/**
 * sx акцентной кнопки: Behaviour.stylingActions (ключ «takeInWork») имеет приоритет,
 * иначе — вид карточки (DEFAULT_TAKE_SX).
 *
 * @param {{variant?:string, bg?:string|null, color?:string|null}|null} styling
 * @param {object} [fallback]
 * @returns {object}
 */
export function primaryActionSx(styling, fallback = DEFAULT_TAKE_SX) {
  const variant = styling?.variant || "contained";
  if (!styling?.bg) return variant === "contained" ? { ...fallback } : { borderWidth: 1.5 };
  const bg = String(styling.bg);
  const color = styling.color || "#fff";
  return /gradient\(/i.test(bg)
    ? { backgroundImage: bg, color, borderColor: "transparent", "&:hover": { backgroundImage: bg, filter: "brightness(0.92)" } }
    : { backgroundColor: bg, color, borderColor: "transparent", "&:hover": { backgroundColor: bg, filter: "brightness(0.92)" } };
}

/**
 * @typedef {object} RowAction
 * @property {string} key
 * @property {string} label
 * @property {"take"|"edit"|"result"} [icon]
 * @property {"info"} [kind] — информационный пункт (без обработчика)
 * @property {string} [hint]
 * @property {string} [variant]
 * @property {boolean} [disabled]
 * @property {object} [sx]
 * @property {Function} [onClick]
 */

/**
 * Собирает действия по строке.
 *
 * @param {object} row — строка таблицы (нужны sourceId, Status, PercentComplete, Id)
 * @param {object} opts
 * @param {boolean} [opts.canTake] — можно ли взять задачу в работу (см. TasksView.canTakeTableRow)
 * @param {boolean} [opts.taking] — по этой строке уже идёт взятие в работу
 * @param {boolean} [opts.updating] — по этой задаче идёт запись (завершение результата)
 * @param {boolean} [opts.takenByOther] — задачу взял другой пользователь
 * @param {string} [opts.takerLabel] — кто взял (для плашки «В работе у X»)
 * @param {string[]} [opts.choices] — значения поля результата для этой задачи
 * @param {(choice:string) => object|null} [opts.resolveStyling] — styling из Behaviour
 * @param {{variant?:string, bg?:string|null, color?:string|null}|null} [opts.takeStyling] — stylingActions.takeInWork
 * @param {Function} [opts.onTake]
 * @param {(choice:string) => void} [opts.onResult]
 * @param {Function} [opts.onEdit]
 * @returns {RowAction[]}
 */
export function buildRowActions(row, opts = {}) {
  if (!row) return [];
  const {
    canTake = false,
    taking = false,
    updating = false,
    takenByOther = false,
    takerLabel = "",
    choices = [],
    resolveStyling = null,
    takeStyling = null,
    onTake,
    onResult,
    onEdit,
  } = opts;

  const actions = [];
  const status = row.Status || "";
  const completed = isCompletedStatus(status, row.PercentComplete);
  const inProgress = isInProgressStatus(status);
  const notStarted = isNotStartedStatus(status);

  // Внешний источник (dob): карточка внешней задачи read-only — «Взять в работу» + «Изменить».
  if (row.sourceId && row.sourceId !== "main") {
    if (canTake) {
      actions.push({
        key: "take",
        label: "Взять в работу",
        icon: "take",
        variant: takeStyling?.variant || "contained",
        sx: primaryActionSx(takeStyling),
        disabled: taking,
        onClick: () => onTake?.(),
      });
    }
    actions.push({
      key: "edit",
      label: "Изменить",
      icon: "edit",
      variant: "outlined",
      sx: { ...DEFAULT_EDIT_SX },
      disabled: taking,
      onClick: () => onEdit?.(),
    });
    return actions;
  }

  if (!completed && !inProgress) {
    // «Не начата» и любой прочий незавершённый статус — как fallback-ветка карточки.
    if (canTake || notStarted) {
      actions.push({
        key: "take",
        label: "Взять в работу",
        icon: "take",
        variant: takeStyling?.variant || "contained",
        sx: primaryActionSx(takeStyling),
        disabled: updating || taking,
        onClick: () => onTake?.(),
      });
    }
  } else if (inProgress) {
    if (takenByOther) {
      actions.push({
        key: "taken-by-other",
        kind: "info",
        label: `В работе у ${takerLabel || "другого пользователя"}`,
        hint: "Задача уже взята другим пользователем. Возьмите другую задачу.",
      });
    } else {
      for (const choice of choices) {
        const styling = resolveStyling ? resolveStyling(choice) : null;
        actions.push({
          key: `result:${choice}`,
          label: choice,
          icon: "result",
          variant: styling?.variant || "contained",
          disabled: updating,
          sx: resultActionSx(styling),
          onClick: () => onResult?.(choice),
        });
      }
    }
  }

  actions.push({
    key: "edit",
    label: "Изменить",
    icon: "edit",
    variant: "outlined",
    sx: { ...DEFAULT_EDIT_SX },
    disabled: updating || taking,
    onClick: () => onEdit?.(),
  });
  return actions;
}
