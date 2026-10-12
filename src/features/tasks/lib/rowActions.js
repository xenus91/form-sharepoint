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
//   • «Изменить» → форма задачи (как кнопка «Изменить» карточки внешней задачи).
//
// Уточнения 2026-10-04 (раунд 14) — единое правило для ВСЕХ задач (и main, и ДОБ):
//   • пока задача НЕ взята в работу — доступно только «Взять в работу»;
//     «Изменить» не показываем, иначе форму задачи можно открыть в обход взятия;
//   • «Изменить» появляется ПОСЛЕ взятия в работу (задача «в работе» и не у
//     другого пользователя);
//   • ЗАВЕРШЁННЫЕ задачи (любого источника) — действий нет, но с 2026-10-11
//     вместо голой плашки «Действия недоступны» показываем СВОДКУ (чем закрыта,
//     за сколько решена, когда и кем) и кнопку «Просмотр» — форма задачи
//     открывается только на чтение.
//
// Модуль чистый: все зависимости (можно ли взять, choices, стили, иконки,
// обработчики) приходят в opts — поэтому паритет с карточкой проверяется
// юнит-тестами без DOM.

import { isCompletedStatus, isInProgressStatus } from "../../../tasks/status";
import { formatSolveTime } from "../../../tasks/formatters";

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
 * @property {object|null} [editor] — инлайн-форма результата (поля/AA/подтверждение)
 * @property {Function} [onClick]
 */

/**
 * «дд.мм.гггг чч:мм» — детерминированный формат, чтобы сводку можно было
 * проверять тестами без учёта локали окружения.
 *
 * @param {any} value
 * @returns {string} пустая строка, если даты нет/она не разобрана
 */
function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Собирает действия по строке.
 *
 * @param {object} row — строка таблицы (нужны sourceId, Status, PercentComplete, Id)
 * @param {object} opts
 * @param {boolean} [opts.canTake] — можно ли взять задачу в работу (см. TasksView.canTakeTableRow).
 *   Оставлен для совместимости: доступность действий теперь определяет СТАТУС
 *   (не взята → «Взять в работу», взята → «Изменить»/результаты, завершена → плашка)
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
 * @param {(choice:string) => object|null} [opts.resolveEditor] — инлайн-форма результата
 *   (поля/подтверждение) для поповера: если вернула описание, клик открывает форму В ПОПОВЕРЕ,
 *   как в карточке, а не завершает задачу сразу
 * @param {Function} [opts.onEdit]
 * @param {string} [opts.resultValue] — значение поля результата (сводка завершённой)
 * @param {string} [opts.completedBy] — кто закрыл задачу (сводка завершённой)
 * @returns {RowAction[]}
 */
export function buildRowActions(row, opts = {}) {
  if (!row) return [];
  const {
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
    resolveEditor = null,
    externalLike = false,
    // Сводка завершённой задачи: значение поля результата и кто закрыл.
    resultValue = "",
    completedBy = "",
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

  const editAction = (disabled) => ({
    key: "edit",
    label: "Изменить",
    icon: "edit",
    variant: "outlined",
    sx: { ...DEFAULT_EDIT_SX },
    sticky: true,
    disabled,
    onClick: () => onEdit?.(),
  });

  // Сводка по завершённой задаче (2026-10-11): чем закрыта, за какое время
  // решена, когда и кем. Пустые строки не выводим — у задачи из внешнего
  // источника может не быть, например, поля результата.
  const completedLines = () => {
    const lines = [];
    const result = typeof resultValue === "string" ? resultValue.trim() : "";
    if (result) lines.push(`Результирующий выбор: ${result}`);
    const solved = formatSolveTime(row)?.label;
    if (solved) lines.push(solved);
    const closedAt = formatDateTime(row?.Modified);
    const by = completedBy || takerLabel || "";
    if (closedAt) lines.push(`Завершена: ${closedAt}${by ? ` • ${by}` : ""}`);
    return lines;
  };

  // Плашка «Задача завершена» + сводка. Действий по завершённой задаче нет
  // (она не берётся в работу и не редактируется) — вместо них «Просмотр».
  const completedInfo = () => ({
    key: "completed",
    kind: "info",
    label: "Задача завершена",
    lines: completedLines(),
  });

  // «Просмотр» открывает ту же форму, что и «Изменить», но завершённая задача
  // показывается только на чтение (DobTaskEditView: readOnly = taskCompleted;
  // у main-задачи — карточка без кнопок действий).
  const viewAction = () => ({
    key: "view",
    label: "Просмотр",
    icon: "view",
    variant: "outlined",
    sx: { ...DEFAULT_EDIT_SX },
    sticky: true,
    onClick: () => onEdit?.(),
  });

  // Задача ДОБ: внешний источник (dob) либо main-задача типа «Результат проверки
  // ООБ». Форма задачи (как и кнопки результата) — только после взятия в работу.
  const dobLike = (row.sourceId && row.sourceId !== "main") || externalLike;

  if (completed) return [completedInfo(), viewAction()];

  if (dobLike) {
    // Не взята в работу → только «Взять в работу» («Изменить» — после взятия).
    if (!inProgress) {
      actions.push(takeAction(updating || taking));
      return actions;
    }
    if (takenByOther) {
      actions.push({
        key: "taken-by-other",
        kind: "info",
        label: `В работе у ${takerLabel || "другого пользователя"}`,
        hint: "Задача уже взята другим пользователем. Возьмите другую задачу.",
      });
    } else {
      // Взята в работу (мной) → доступна «Изменить»: форма ДОБ по кнопке.
      actions.push(editAction(taking));
    }
    return actions;
  }

  // Задача НЕ взята в работу («Не начата» и любой прочий незавершённый статус):
  // единственное действие — «Взять в работу» (как fallback-ветка карточки).
  if (!inProgress) {
    actions.push(takeAction(updating || taking));
    return actions;
  }

  if (takenByOther) {
    actions.push({
      key: "taken-by-other",
      kind: "info",
      label: `В работе у ${takerLabel || "другого пользователя"}`,
      hint: "Задача уже взята другим пользователем. Возьмите другую задачу.",
    });
    return actions;
  }

  // «В работе» у меня — кнопки результата по типу контента (как в карточке).
  for (const choice of choices) {
    const styling = resolveStyling ? resolveStyling(choice) : null;
    const variant = styling?.variant || "contained";
    const editor = resolveEditor ? resolveEditor(choice) : null;
    actions.push({
      key: `result:${choice}`,
      label: choice,
      // иконка — как в карточке (Behaviour «i»), иначе нейтральная
      icon: (resolveIcon ? resolveIcon(choice) : null) || "result",
      variant,
      disabled: updating,
      sx: resultActionSx(styling, variant),
      // есть инлайн-форма → попап покажет её (поля/подтверждение как в карточке)
      editor: editor || null,
      onClick: () => onResult?.(choice),
    });
  }

  // «Изменить» — только ПОСЛЕ взятия в работу: закреплена внизу меню, поэтому
  // видна даже когда кнопок результата много. У завершённых её нет (выше
  // возвращается только плашка «Задача завершена»).
  actions.push(editAction(updating || taking));
  return actions;
}
