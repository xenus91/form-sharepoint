// src/hooks/useProblemChoices.js
// ProblemsPallet.Problems — набор проблем для классификации задач.
// Список меняется крайне редко (админ раз в месяцы), кэшируем 7 дней.

import { useQuery } from "@tanstack/react-query";
import apiClient from "../api";

export const PROBLEM_CHOICES_KEY = ["problem-choices"];

async function fetcher() {
  const { data } = await apiClient.get(
    `/web/lists/getbytitle('ProblemsPallet')/fields?$filter=InternalName eq 'Problems'`
  );
  const field = data?.d?.results?.[0];
  return field?.Choices?.results || [];
}

export function useProblemChoices() {
  return useQuery({
    queryKey: PROBLEM_CHOICES_KEY,
    queryFn: fetcher,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 дней
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}