// src/features/tasks/hooks/useCurrentUser.js
// Вынесено из TasksView.jsx — Phase PR1 (декомпозиция, хуки первыми)
// Отвечает за currentUserId / currentUserTitle / Office-Department + taskFieldNames (getTasksListFieldsOverview)
import { useState, useEffect } from "react";
import apiClient from "../../../api";
import { getTasksListFieldsOverview } from "../../../tasks/distribution";

export function useCurrentUser({ propUserProfile, propCurrentUserId }) {
  const [currentUserId, setCurrentUserId] = useState(() => propCurrentUserId ?? null);
  const [userOfficeDept, setUserOfficeDept] = useState({ office: "", department: "" });
  const [taskFieldNames, setTaskFieldNames] = useState([]);
  const [recipientField, setRecipientField] = useState(null);
  const [scNumberField, setScNumberField] = useState(null);
  const [currentUserTitle, setCurrentUserTitle] = useState("");

  useEffect(() => {
    if (propCurrentUserId) {
      setCurrentUserId(propCurrentUserId);
      if (propUserProfile?.userTitle) setCurrentUserTitle(propUserProfile.userTitle);
      else if (propUserProfile?.userDisplayName) setCurrentUserTitle(propUserProfile.userDisplayName);
    } else {
      apiClient
        .get("/web/currentuser", { headers: { Accept: "application/json;odata=verbose" } })
        .then((r) => {
          setCurrentUserId(r?.data?.d?.Id || null);
          if (r?.data?.d?.Title) setCurrentUserTitle(r.data.d.Title);
        })
        .catch(() => setCurrentUserId(null));
    }
    // Fetch Office/Department for distribution filtering (group assignment)
    (async () => {
      try {
        if (propUserProfile && (propUserProfile.userOffice || propUserProfile.userDepartment)) {
          const office = propUserProfile.userOffice || "";
          const dept = propUserProfile.userDepartment || "";
          if (office || dept) {
            setUserOfficeDept({ office, department: dept });
          }
        } else {
          const resp = await apiClient.get("/SP.UserProfiles.PeopleManager/GetMyProperties", { headers: { Accept: "application/json;odata=verbose" } });
          const props = resp?.data?.d?.UserProfileProperties?.results || [];
          const find = (k) => props.find((p) => p.Key === k)?.Value || "";
          const office = find("Office") || "";
          const dept = find("Department") || "";
          if (office || dept) setUserOfficeDept({ office, department: dept });
        }
      } catch {}
    })();
    // Один запрос вместо 3 параллельных на один и тот же /fields (критично для трафика)
    getTasksListFieldsOverview().then(({ fieldNames, recipientField: rf, scNumberField: scf }) => {
      setTaskFieldNames(fieldNames);
      if (rf) setRecipientField(rf);
      else setRecipientField(null);
      if (scf) setScNumberField(scf);
    }).catch(() => {});
  }, [propUserProfile, propCurrentUserId]);

  return {
    currentUserId, setCurrentUserId,
    currentUserTitle, setCurrentUserTitle,
    userOfficeDept, setUserOfficeDept,
    taskFieldNames, setTaskFieldNames,
    recipientField, setRecipientField,
    scNumberField, setScNumberField,
  };
}
