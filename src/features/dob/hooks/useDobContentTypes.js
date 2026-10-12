// src/features/dob/hooks/useDobContentTypes.js
// Типы контента списка заявок (с FieldLinks) — состав колонок таблицы и выбор
// типа в форме создания заявки.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDobContentTypes } from '../api/dobApi';
import { collectCtFieldNames } from '../lib/requestFields';
import { DOB_LIST_GUID } from '../api/dobClient';

export function useDobContentTypes(listGuid = DOB_LIST_GUID, opts = {}) {
  const q = useQuery({
    queryKey: ['dob', 'contenttypes', String(listGuid || '').toLowerCase()],
    queryFn: () => getDobContentTypes(listGuid),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    ...opts,
  });
  const contentTypes = useMemo(() => q.data || [], [q.data]);
  // Внутренние имена полей типов контента — для колонок таблицы заявок.
  const ctFieldNames = useMemo(() => collectCtFieldNames(contentTypes), [contentTypes]);
  return { ...q, contentTypes, ctFieldNames };
}
