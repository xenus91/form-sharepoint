// src/hooks/useCurrentUser.js
// Общий (и для App, и для TasksView) хук текущего пользователя.
//
// Раньше:
//   - App.jsx делал /web/currentuser внутри fetchUserProfile
//   - TasksView.jsx делал /web/currentuser в своём mount-эффекте
//   - итого 2× на одной и той же странице.
//
// Сейчас: один TanStack Query с gc 5 мин, staleTime 5 мин, оба потребителя
// подписываются на один и тот же ключ — запрос летит ровно один раз.

import { useQuery } from "@tanstack/react-query";
import apiClient from "../api";

export const CURRENT_USER_KEY = ["current-user"];

async function fetcher() {
  const { data } = await apiClient.get("/web/currentuser", {
    headers: { Accept: "application/json;odata=verbose" },
  });
  const d = data?.d || {};
  return {
    Id: d.Id ?? null,
    Title: d.Title ?? "",
  };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetcher,
    staleTime: 5 * 60_000, // пользователь не меняется в рамках сессии
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}