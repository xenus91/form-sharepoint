// src/hooks/useUserProfile.js
// Общий хук профиля пользователя (Office/Department/DisplayName/Title).
//
// Раньше /SP.UserProfiles.PeopleManager/GetMyProperties дёргался:
//   - App.jsx (в fetchUserProfile, на mount)
//   - TasksView.jsx (в mount-эффекте, если propUserProfile ещё не пришёл)
//
// Сейчас: один useQuery — оба потребителя делят кэш и получают свежие данные
// без дубля запроса.

import { useQuery } from "@tanstack/react-query";
import apiClient from "../api";

export const USER_PROFILE_KEY = ["user-profile"];

function findUserProfileProperty(props, key) {
  if (!Array.isArray(props)) return null;
  return props.find((p) => p?.Key === key) || null;
}

async function fetcher() {
  const { data } = await apiClient.get(
    "/SP.UserProfiles.PeopleManager/GetMyProperties",
    { headers: { Accept: "application/json;odata=verbose" } }
  );
  const d = data?.d || {};
  const userProperties = d.UserProfileProperties?.results || [];

  const userDepartment =
    findUserProfileProperty(userProperties, "Department")?.Value || "Не указано";
  const userOfficeRaw =
    findUserProfileProperty(userProperties, "Office")?.Value || "Не указано";
  const userDisplayName =
    findUserProfileProperty(userProperties, "PreferredName")?.Value || "Не указано";
  const userTitle = d.Title || "";

  // Локальная корректировка для перехода между РЦ
  const userOffice =
    userOfficeRaw === "РЦ-8117" && userDepartment === "Группа отгрузки РЦ"
      ? "РЦ-8114"
      : userOfficeRaw;

  return { userDepartment, userOffice, userDisplayName, userTitle };
}

export function useUserProfile() {
  return useQuery({
    queryKey: USER_PROFILE_KEY,
    queryFn: fetcher,
    staleTime: 5 * 60_000, // профиль меняется редко
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}