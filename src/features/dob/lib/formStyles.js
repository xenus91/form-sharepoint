// src/features/dob/lib/formStyles.js
// Единый стиль страниц форм (#dob_tasks/<id>): заявка ДОБ и задача типа контента
// («Результат проверки ООБ») выглядят ОДИНАКОВО — одна шапка, одни отступы, одна
// высота полей и одна типографика.
//
// UI/UX-правила этого файла:
//   • поля 36 px: подпись и текст в поле выровнены по одной базовой линии
//     (никаких `py`-хак, из-за которых подпись «съезжала» внутри инпута);
//   • многострочные и множественные поля не получают фиксированную высоту;
//   • секции с акцентной полосой, спокойные отступы 8/12/16 px;
//   • кнопки: одна основная (градиент), одна вторичная (контур), высота 32 px.

const FIELD_HEIGHT = 40; // стандартная высота MUI size="small"

/** Корень страницы формы: отступы, поля 36px со выровненными подписями. */
export const FORM_PAGE_SX = {
  width: '100%',
  maxWidth: 'none',
  mx: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  p: { xs: 0.75, md: 1 },
  boxSizing: 'border-box',
  overflowX: 'hidden',
  minWidth: 0,
  '& .MuiOutlinedInput-root': { borderRadius: 0.5 },
  // Однострочные поля одной высоты: подпись MUI («label») при этом встаёт по
  // центру поля и не «съезжает» относительно текста внутри.
  '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { minHeight: FIELD_HEIGHT, borderRadius: 0.5 },
  // Множественный выбор («Пользователь или группа», MultiChoice): высота по
  // содержимому — чипы переносятся и не выезжают за края формы.
  '& .MuiInputBase-root.MuiAutocomplete-inputRoot': {
    height: 'auto',
    minHeight: FIELD_HEIGHT,
    alignItems: 'center',
    py: 0.25,
  },
  '& .MuiInputBase-multiline': { padding: '6px 12px' },
  '& .MuiInputBase-input': { fontSize: 13, lineHeight: 1.35 },
  '& .MuiInputLabel-root': { fontSize: 13, lineHeight: 1.35 },
  '& .MuiFormHelperText-root': { fontSize: 11.5, lineHeight: 1.35, mt: 0.25, mx: 0 },
  '& .MuiButton-root': { borderRadius: 0.5, minHeight: 32, height: 32, textTransform: 'none', fontWeight: 700 },
  '& .MuiFormControlLabel-root': { minHeight: 32, m: 0 },
  '& .MuiChip-root': { borderRadius: 0.5 },
  '& .MuiTypography-caption': { fontSize: 11.5 },
};

/** Шапка страницы (одинаковая у заявки и задачи). */
export const FORM_APPBAR_SX = {
  top: 0,
  zIndex: 1100,
  bgcolor: '#fff',
  color: '#171c8f',
  borderBottom: '1px solid rgba(23,28,143,.12)',
};

/** Блок «Название + описание задачи» — сразу под шапкой, до полей. */
export const FORM_TASK_HEAD_SX = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0.5,
  p: { xs: 1, md: 1.25 },
  borderRadius: 0.5,
  border: '1px solid rgba(23,28,143,.14)',
  bgcolor: '#f8f9ff',
  minWidth: 0,
};

/** Заголовок секции с акцентной полосой (единый вид у всех секций). */
export const FORM_SECTION_HEAD_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 0.75,
};

/** Акцентная полоса слева от заголовка секции. */
export const FORM_SECTION_BAR_SX = {
  width: 4,
  height: 18,
  borderRadius: 0.5,
  bgcolor: '#171c8f',
  flex: '0 0 auto',
};

/** Заголовок секции («Результат проверки», «Остальные поля»). */
export const FORM_SECTION_TITLE_SX = { fontWeight: 800, color: '#171c8f', lineHeight: 1.2 };

/** Секция формы (карточка с мягкой рамкой). */
export const FORM_SECTION_SX = {
  p: { xs: 1, md: 1.25 },
  borderRadius: 0.5,
  border: '1px solid rgba(23,28,143,.14)',
  bgcolor: '#fff',
  minWidth: 0,
};

/** Сетка полей: 1 / 3 / 4 колонки; ячейки не выпирают за края формы. */
export const FORM_FIELD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
  gap: { xs: 1, md: 1.25 },
  minWidth: 0,
  width: '100%',
  '& > *': { minWidth: 0, maxWidth: '100%' },
};

/** Поле, растянутое на всю ширину сетки (рич-текст, длинные заметки). */
export const FORM_FIELD_FULL_SX = { gridColumn: { md: '1 / -1' }, minWidth: 0 };

/** «Пользователь или группа» — широкая ячейка: имя + чипы помещаются целиком. */
export const FORM_FIELD_WIDE_SX = { gridColumn: { xs: '1 / -1', md: 'span 2' }, minWidth: 0 };

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

/** Группа кнопок результата (ToggleButtonGroup) — «кнопки» результирующего выбора. */
export const RESULT_TOGGLE_GROUP_SX = {
  flexWrap: 'wrap',
  gap: 0.75,
  '& .MuiToggleButton-root': {
    border: '1px solid rgba(23,28,143,.24)',
    borderRadius: 0.5,
    px: 2,
    height: 36,
    textTransform: 'none',
    fontWeight: 700,
    fontSize: 13,
    color: '#171c8f',
    '&:hover': { backgroundColor: 'rgba(23,28,143,.06)' },
  },
  '& .MuiToggleButton-root.Mui-selected': {
    backgroundColor: '#171c8f',
    color: '#fff',
    '&:hover': { backgroundColor: '#2a31a8' },
  },
};
