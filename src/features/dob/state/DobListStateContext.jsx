// src/features/dob/state/DobListStateContext.jsx
// Общее состояние шапки (#dob_requests) и таблицы (DobGrid).
//
// Правки заявок здесь больше нет (требование 2026-10-15: «убрать из
// #dob_requests возможность изменения заявок совсем») — раньше провайдер копил
// dirty-строки и отправлял их пакетным MERGE. Осталось только то, что реально
// разделяют шапка и таблица: отфильтрованные строки, фильтры шапки
// (статус / тип заявки), признак группировки по статусу и переход к заявке.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { buildDobItemHash } from '../lib/dobRoute';

const DobListStateCtx = createContext(null);

export function useDobListState() {
  const ctx = useContext(DobListStateCtx);
  if (!ctx) {
    throw new Error('useDobListState must be used inside <DobListStateProvider>');
  }
  return ctx;
}

/**
 * Выбранная строка (selectedId) нужна шапке для кнопки «Открыть».
 *
 * @param {object} props
 * @param {Array<object>} props.fields — метаданные полей списка
 * @param {Array<object>} props.rows — строки ПОСЛЕ фильтра по подразделению
 *   (остальные фильтры, группировку и закрепление колонок пользователь
 *   настраивает средствами AG Grid — панели «Колонки» и «Фильтры»)
 * @param {Function} props.onRefresh — перезагрузить список
 * @param {string} [props.scopeNote] — по какому правилу отобраны заявки
 * @param {string} [props.scopeWarning] — если правило применить не удалось
 */
export function DobListStateProvider({
  fields,
  rows,
  onRefresh,
  loading,
  isFetching,
  scopeNote = '',
  scopeWarning = '',
  children,
}) {
  const [selectedId, setSelectedId] = useState(null);

  const handleRefresh = useCallback(() => {
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  // Заявка открывается только на просмотр (форма в режиме readOnly).
  const openItem = useCallback((id) => {
    if (!id) return;
    window.location.hash = buildDobItemHash(id);
  }, []);

  const ctx = useMemo(
    () => ({
      fields,
      rows,
      loading,
      isFetching,
      selectedId,
      setSelectedId,
      handleRefresh,
      openItem,
      scopeNote,
      scopeWarning,
    }),
    [
      fields,
      rows,
      loading,
      isFetching,
      selectedId,
      handleRefresh,
      openItem,
      scopeNote,
      scopeWarning,
    ],
  );

  return <DobListStateCtx.Provider value={ctx}>{children}</DobListStateCtx.Provider>;
}

DobListStateProvider.propTypes = {
  fields: PropTypes.array,
  rows: PropTypes.array,
  onRefresh: PropTypes.func,
  loading: PropTypes.bool,
  isFetching: PropTypes.bool,
  scopeNote: PropTypes.string,
  scopeWarning: PropTypes.string,
  children: PropTypes.node,
};
