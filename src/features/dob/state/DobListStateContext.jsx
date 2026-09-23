// src/features/dob/state/DobListStateContext.jsx
// Shared state between the AppBar (toolbar with buttons) and the AG Grid (DobGrid).
// Only what is actually shared — dirty/save logic, selection, refresh handle.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNotifications } from '../../../NotificationsProvider';
import { updateDobItem } from '../api/dobApi';

const DobListStateCtx = createContext(null);

export function useDobListState() {
  const ctx = useContext(DobListStateCtx);
  if (!ctx) {
    throw new Error('useDobListState must be used inside <DobListStateProvider>');
  }
  return ctx;
}

/**
 * Holds the editable state of the DOB list:
 *  - dirty: Map(id -> payload diff)
 *  - saving, saveError
 *  - selectedId (currently selected row id)
 *
 * Exposes imperative API via callbacks used by the AppBar:
 *  - handleSave()    -> save all dirty rows
 *  - handleRevert()  -> discard local edits + reload from server
 *  - handleRefresh() -> reload from server
 *  - openEdit(id)    -> navigate to #dob_tasks/<id>
 */
export function DobListStateProvider({ fields, rows, onRefresh, loading, isFetching, children }) {
  const { notify } = useNotifications();

  const [dirty, setDirty] = useState(() => new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const handleSave = useCallback(async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    setSaveError('');
    const entries = Array.from(dirty.entries());
    let success = 0;
    let fail = 0;
    for (const [id, payload] of entries) {
      // Strip `_orig` (snapshot of the row before editing) before sending to SharePoint.
      const { _orig: _origUnused, ...rest } = payload; // eslint-disable-line no-unused-vars
      try {
        await updateDobItem(id, rest);
        success += 1;
        setDirty((prev) => {
          const n = new Map(prev);
          n.delete(id);
          return n;
        });
      } catch (e) {
        fail += 1;
        const msg = e?.response?.data?.error?.message?.value || e?.message || 'Ошибка';
        setSaveError(`ID ${id}: ${String(msg).slice(0, 200)}`);
      }
    }
    setSaving(false);
    if (success) {
      notify(
        `Сохранено ${success} строк${fail ? `, ошибок ${fail}` : ''}`,
        { severity: fail ? 'warning' : 'success' },
      );
    }
    if (success && onRefresh) {
      // Refresh so calculated fields pick up server-side updates.
      setTimeout(() => onRefresh(), 500);
    }
  }, [dirty, notify, onRefresh]);

  const handleRevert = useCallback(() => {
    setDirty(new Map());
    setSaveError('');
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  const handleRefresh = useCallback(() => {
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  const openEdit = useCallback((id) => {
    if (!id) return;
    window.location.hash = `#dob_tasks/${id}`;
  }, []);

  const clearSaveError = useCallback(() => setSaveError(''), []);

  const ctx = useMemo(
    () => ({
      fields,
      rows,
      loading,
      isFetching,
      dirty,
      saving,
      saveError,
      selectedId,

      setDirty,
      setSelectedId,

      handleSave,
      handleRevert,
      handleRefresh,
      openEdit,
      clearSaveError,
    }),
    [
      fields,
      rows,
      loading,
      isFetching,
      dirty,
      saving,
      saveError,
      selectedId,
      handleSave,
      handleRevert,
      handleRefresh,
      openEdit,
      clearSaveError,
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
  children: PropTypes.node,
};