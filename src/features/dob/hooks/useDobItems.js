// src/features/dob/hooks/useDobItems.js
import { useQuery } from '@tanstack/react-query';
import { getDobItems, getDobItemsPaged } from '../api/dobApi';

export function useDobItems({ enabled = true, top = 100, filter = '', fields = null } = {}) {
  return useQuery({
    queryKey: ['dob', 'items', { top, filter, fieldsHash: fields ? fields.length : 0 }],
    queryFn: () => getDobItems({ top, filter, fields }).then(r => r.results),
    enabled: enabled && (fields === null || fields.length > 0),
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useDobItemsPaged({ enabled = true, pageSize = 100, fields = null } = {}) {
  return useQuery({
    queryKey: ['dob', 'itemsPaged', pageSize, fields ? fields.length : 0, fields ? fields.map(f=>f.InternalName).join(',').slice(0,60) : ''],
    queryFn: () => getDobItemsPaged({ pageSize, fields }),
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}
