// src/features/dob/components/PersonCell.jsx
//
// Ячейка поля «Пользователь или группа» в таблице #dob_requests.
// Требование 2026-10-15: показывать людей «также как реализовано в таблице
// задач» — иконка человека + ФИО (в таблице задач это PrincipalButtons из
// src/features/tasks/components/AssignedToButtons.jsx), несколько человек —
// списком, пусто — прочерком.
//
// Диалога принципала здесь нет: заявки только просматриваются, а состав
// участников уже виден в форме заявки. Поэтому ячейка не кликабельна и не
// перехватывает клик по строке.

import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import { personNameList } from '../lib/personText';

/**
 * @param {object} props — параметры cellRenderer AG Grid
 * @param {any} props.value — значение колонки (строка из valueGetter)
 * @param {object} [props.data] — строка списка
 * @param {object} [props.colDef] — определение колонки (нужен её field)
 */
export default function PersonCell({ value, data, colDef }) {
  const names = personNameList(data, colDef?.field);
  // valueGetter уже вернул текст — берём его запасным вариантом (например,
  // когда колонка построена не по внутреннему имени поля).
  const fallback = typeof value === 'string' ? value.trim() : '';

  if (names.length === 0 && !fallback) {
    return (
      <Typography component="span" variant="caption" color="text.secondary" data-testid="dob-person-empty">
        —
      </Typography>
    );
  }

  const list = names.length > 0 ? names : [fallback];

  return (
    <Box
      component="span"
      data-testid="dob-person-cell"
      title={list.join(', ')}
      sx={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.5,
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {list.map((name, index) => (
        <Box
          // Имя + позиция — ключи стабильны и при повторяющихся ФИО.
          key={`${name}:${index}`}
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.25,
            minWidth: 0,
            maxWidth: '100%',
            color: '#6b7280',
            fontWeight: 500,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <PersonIcon sx={{ fontSize: 14, flex: '0 0 auto' }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

PersonCell.propTypes = {
  value: PropTypes.any,
  data: PropTypes.object,
  colDef: PropTypes.object,
};
