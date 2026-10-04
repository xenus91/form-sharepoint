// src/features/dob/lib/formStyles.js
// Единый стиль страниц форм (#dob_tasks/<id>): заявка ДОБ и задача типа контента
// («Результат проверки ООБ») выглядят ОДИНАКОВО — одна шапка, одни отступы, одна
// высота полей, одни секции и кнопки.
//
// Зачем отдельный модуль: обе страницы рисует DobTaskEditView, а форму задачи —
// ещё и ContentTypeResultDialog (inline). Раньше они стилизовались каждая по-своему
// (крупные скругления и «диалоговые» заголовки против компактной формы ДОБ).

/** Корень страницы формы: отступы, компактные поля 32px, скругления 4px. */
export const FORM_PAGE_SX = {
  width: '100%',
  maxWidth: 'none',
  mx: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.75,
  p: { xs: 0.5, md: 0.75 },
  boxSizing: 'border-box',
  overflowX: 'hidden',
  minWidth: 0,
  '& .MuiOutlinedInput-root': { borderRadius: 0.5 },
  '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { height: 32, borderRadius: 0.5 },
  '& .MuiInputBase-input': { py: 0.5, fontSize: 13 },
  '& .MuiSelect-select': { py: 0.5, fontSize: 13 },
  '& .MuiButton-root': { borderRadius: 0.5, minHeight: 32, height: 32 },
  '& .MuiFormControlLabel-root': { minHeight: 32 },
};

/** Шапка страницы (одинаковая у заявки и задачи). */
export const FORM_APPBAR_SX = {
  top: 0,
  zIndex: 1100,
  bgcolor: '#fff',
  color: '#171c8f',
  borderBottom: '1px solid rgba(23,28,143,.12)',
};

/** Заголовок секции («Остальные поля» и т.п.). */
export const FORM_SECTION_TITLE_SX = { fontWeight: 800, mb: 1, color: '#171c8f' };

/** Сетка полей: 1 / 3 / 4 колонки, как в форме заявки ДОБ. */
export const FORM_FIELD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
  gap: { xs: 0.75, md: 1 },
};

/** Поле, растянутое на всю ширину сетки (рич-текст, длинные заметки). */
export const FORM_FIELD_FULL_SX = { gridColumn: { md: '1 / -1' }, minWidth: 0 };

/** Основная кнопка (Сохранить): тот же градиент, что в шапке формы ДОБ. */
export const FORM_PRIMARY_BUTTON_SX = {
  borderRadius: 0.5,
  minWidth: 120,
  fontWeight: 800,
  color: '#fff',
  backgroundImage: 'linear-gradient(180deg,#171c8f 0%,#10146a 100%)',
  '&:hover': { backgroundImage: 'linear-gradient(180deg,#232a9e 0%,#171c8f 100%)' },
  '&.Mui-disabled': { backgroundImage: 'none' },
};

/** Вторичная кнопка (Обновить/Отмена) — контурная, тех же размеров. */
export const FORM_SECONDARY_BUTTON_SX = { borderRadius: 0.5 };

/** Строка действий под формой (Сохранить/Отмена) — как футер формы ДОБ. */
export const FORM_ACTIONS_SX = { display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' };
