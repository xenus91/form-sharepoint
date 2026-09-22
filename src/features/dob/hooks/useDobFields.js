// src/features/dob/hooks/useDobFields.js
import { useQuery } from '@tanstack/react-query';
import { getDobFields } from '../api/dobApi';

export function useDobFields(enabled = true) {
  return useQuery({
    queryKey: ['dob', 'fields'],
    queryFn: getDobFields,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
