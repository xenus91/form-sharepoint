// src/features/tasks/lib/resultDispatch.js
// ЕДИНАЯ точка правды: что делает кнопка результата — и в карточке, и в таблице.
//
// Раньше это решалось в трёх местах по-разному (found/notFound-слоты карточки,
// «прочие» кнопки карточки и сборщик действий таблицы) — из-за чего одна и та же
// настройка TaskBehaviour вела себя по-разному: например «Найдена» с "loc": true
// в таблице открывала карточку с формой и НЕ открывала диалог местоположения.
//
// Возвращает способ обработки значения результата:
//   • "card-buttons" — Behaviour.ic: подтверждение двумя кнопками внутри карточки
//                      («Подтвердить «…»» / «Отмена»), без диалога и без полей;
//   • "card-form"    — нужна форма карточки: prompt-поля (Behaviour.p) или
//                      доп. действия (Behaviour.aa) БЕЗ местоположения. Такой формы
//                      больше нигде нет, поэтому открываем карточку с этим результатом;
//   • "flow"         — всё остальное умеет общий поток TasksView:
//                      loc → диалог местоположения (в нём же доп. действия),
//                      c   → диалог подтверждения,
//                      иначе → запись результата (с анимацией из Behaviour.anim).
//
// Правило простое и проверяемое: карточка нужна ТОЛЬКО тогда, когда у неё есть
// собственный UI, которого нет в таблице. Местоположение и подтверждение — это
// диалоги TasksView, они работают и в табличном режиме напрямую.

/**
 * @param {{promptFields?:Array<any>, showAdditionalActions?:boolean, requiresLocation?:boolean, inlineConfirm?:boolean}|null} rule — правило Behaviour
 * @returns {"card-buttons"|"card-form"|"flow"}
 */
export function resolveResultDispatch(rule) {
  if (!rule || typeof rule !== "object") return "flow";
  const promptCount = Array.isArray(rule.promptFields) ? rule.promptFields.length : 0;
  const needsForm = promptCount > 0 || rule.showAdditionalActions === true;

  // Behaviour.ic — только когда заполнять нечего: карточка покажет две кнопки.
  if (rule.inlineConfirm === true && !needsForm) return "card-buttons";
  // prompt-поля — форма карточки (обязательные поля нельзя терять).
  if (promptCount > 0) return "card-form";
  // Доп. действия без местоположения — тоже форма карточки; с местоположением —
  // диалог местоположения TasksView (он собирает доп. действия сам).
  if (rule.showAdditionalActions === true && rule.requiresLocation !== true) return "card-form";
  return "flow";
}
