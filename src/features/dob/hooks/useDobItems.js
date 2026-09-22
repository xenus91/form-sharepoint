// src/features/dob/hooks/useDobItems.js
import { useQuery } from '@tanstack/react-query';
import { getDobItems, getDobItemsPaged } from '../api/dobApi';

export function useDobItems({ enabled = true, top = 100, filter = '' } = {}) {
  return useQuery({
    queryKey: ['dob', 'items', { top, filter }],
    queryFn: () => getDobItems({ top, filter }).then(r => r.results),
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useDobItemsPaged({ enabled = true, pageSize = 100 } = {}) {
  return useQuery({
    queryKey: ['dob', 'itemsPaged', pageSize],
    queryFn: () => getDobItemsPaged({ pageSize }),
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}
