// src/features/tasks/lib/rowActions.js
// Действия по строке таблицы #tasks.
//
// Требование (2026-10-03): в таблице должны быть ТЕ ЖЕ действия, что в карточке
// задачи — для того же статуса и того же типа контента, с теми же цветами/иконками:
//   • «Не начата» (и любой «прочий» незавершённый статус) → «Взять в работу»;
//   • «в работе» → кнопки результатов по ContentType задачи (значения — из поля
//     результата этого типа контента, вид — из TaskBehaviour.stylingResultButton);
//   • задачу уже взял другой пользователь → в карточке кнопок нет, там плашка
//     «В работе у X» — повторяем её как информационный пункт;
//   • «Изменить» → форма задачи (как кнопка «Изменить» карточки внешней задачи),
//     закреплена внизу меню — видна всегда.
//
// Модуль чистый: все зависимости (можно ли взять, choices, стили, иконки,
// обработчики) приходят в opts — поэтому паритет с карточкой проверяется
// юнит-тестами без DOM.

import { isCompletedStatus, isInProgressStatus, isNotStartedStatus } from "../../../tasks/status";

/**
 * sx из Behaviour-стилизации — переносится ЦЕЛИКОМ, как делает карточка
 * (`...(tbSx || {})` в TaskCard). `resolveStylingForChoice` отдаёт CSS-shorthand
 * `background` (+ `color`, `&:hover`), поэтому терять ключи нельзя: иначе кнопки
 * в таблице выглядели бы не так, как в карточках.
 *
 * @param {object|null} styling
 * @returns {object|null}
 */
export function stylingToSx(styling) {
  if (!styling || typeof styling !== "object") return null;
  // variant — это проп MUI <Button>, а не CSS-правило, в sx его переносить нельзя.
  const { variant: _variant, ...sx } = styling;
  void _variant;
  return Object.keys(sx).length > 0 ? sx : null;
}

/**
 * sx кнопки результата: стили Behaviour как в карточке; для outline-кнопок —
 * та же утолщённая рамка, что и в TaskCard (`borderWidth: 1.5`).
 *
 * @param {object|null} styling
 * @param {string} [variant]
 * @returns {object}
 */
export function resultActionSx(styling, variant) {
  const v = variant || styling?.variant || "contained";
  const sx = stylingToSx(styling) || {};
  return v === "contained" ? sx : { borderWidth: 1.5, ...sx };
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
 * sx акцентной кнопки: стили Behaviour.stylingActions (ключ «takeInWork»)
 * накладываются ПОВЕРХ вида карточки — так же, как в TaskCard.
 *
 * @param {{variant?:string, background?:string, color?:string}|null} styling
 * @param {object} [fallback]
 * @returns {object}
 */
export function primaryActionSx(styling, fallback = DEFAULT_TAKE_SX) {
  const variant = styling?.variant || "contained";
  const sx = stylingToSx(styling);
  if (!sx) return variant === "contained" ? { ...fallback } : { borderWidth: 1.5 };
  return variant === "contained" ? { ...fallback, ...sx } : { borderWidth: 1.5, ...sx };
}

/**
 * @typedef {object} RowAction
 * @property {string} key
 * @property {string} label
 * @property {any} [icon] — строка-ключ ("take"|"edit"|"result") или готовый элемент
 *   иконки из Behaviour (ключ «i» в StylingResultButton/StylingActions)
 * @property {"info"} [kind] — информационный пункт (без обработчика)
 * @property {string} [hint]
 * @property {string} [variant]
 * @property {boolean} [disabled]
 * @property {object} [sx]
 * @property {boolean} [sticky] — закреплённая строка меню (не скроллится со списком)
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
 * @param {(choice:string) => any} [opts.resolveIcon] — иконка результата из Behaviour (ключ «i»)
 * @param {{variant?:string, background?:string, color?:string}|null} [opts.takeStyling] — stylingActions.takeInWork
 * @param {() => any} [opts.takeIcon] — иконка кнопки «Взять в работу»
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
    resolveIcon = null,
    takeStyling = null,
    takeIcon = null,
    onTake,
    onResult,
    onEdit,
  } = opts;

  const takeAction = (disabled) => ({
    key: "take",
    label: "Взять в работу",
    icon: (takeIcon ? takeIcon() : null) || "take",
    variant: takeStyling?.variant || "contained",
    sx: primaryActionSx(takeStyling),
    disabled,
    onClick: () => onTake?.(),
  });

  const actions = [];
  const status = row.Status || "";
  const completed = isCompletedStatus(status, row.PercentComplete);
  const inProgress = isInProgressStatus(status);
  const notStarted = isNotStartedStatus(status);

  // Внешний источник (dob): карточка внешней задачи read-only — «Взять в работу» + «Изменить».
  if (row.sourceId && row.sourceId !== "main") {
    if (canTake) actions.push(takeAction(taking));
    actions.push({
      key: "edit",
      label: "Изменить",
      icon: "edit",
      variant: "outlined",
      sx: { ...DEFAULT_EDIT_SX },
      sticky: true,
      disabled: taking,
      onClick: () => onEdit?.(),
    });
    return actions;
  }

  if (!completed && !inProgress) {
    // «Не начата» и любой прочий незавершённый статус — как fallback-ветка карточки.
    if (canTake || notStarted) actions.push(takeAction(updating || taking));
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
        const variant = styling?.variant || "contained";
        actions.push({
          key: `result:${choice}`,
          label: choice,
          // иконка — как в карточке (Behaviour «i»), иначе нейтральная
          icon: (resolveIcon ? resolveIcon(choice) : null) || "result",
          variant,
          disabled: updating,
          sx: resultActionSx(styling, variant),
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
    sticky: true, // закреплена внизу меню — видна всегда, даже если кнопок много
    disabled: updating || taking,
    onClick: () => onEdit?.(),
  });
  return actions;
}
