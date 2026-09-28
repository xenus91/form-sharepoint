// src/features/tasks/hooks/useTasksMetadata.js
// Вынесено из TasksView.jsx — PR1 (декомпозиция, хуки)
// Отвечает за fieldsLoading, entityType, choices/status, resultFieldsMeta/ctResultMap, additionalRequiredIsBoolean, fieldDefaultActions, taskConfiguration
import { useState, useEffect } from "react";
import apiClient from "../../../api";
import { fetchResultFieldsMeta, fetchContentTypeResultMap } from "../../../tasks/resultField";
import { TASKS_LIST_API, fetchAdditionalActionsDefault, getCachedAdditionalActionsDefaultSync } from "../../../tasks/config";
import { useTaskConfiguration } from "./useTaskConfiguration";

export function useTasksMetadata() {
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const taskConfiguration = useTaskConfiguration({ enabled: !fieldsLoading });
  const [choices, setChoices] = useState([]);
  const [statusChoices, setStatusChoices] = useState([]);
  const [completedStatusValue, setCompletedStatusValue] = useState(null);
  const [inProgressStatusValue, setInProgressStatusValue] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [resultFieldsMeta, setResultFieldsMeta] = useState([]);
  const [ctResultMap, setCtResultMap] = useState(() => new Map());
  const [additionalRequiredIsBoolean, setAdditionalRequiredIsBoolean] = useState(null);
  const [fieldDefaultActions, setFieldDefaultActions] = useState(() => {
    const sync = getCachedAdditionalActionsDefaultSync();
    return sync !== null ? sync : null;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFieldsLoading(true);
      const promises = [];
      promises.push(
        apiClient.get(`${TASKS_LIST_API}?$select=ListItemEntityTypeFullName`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(async ({ data }) => {
            if (cancelled) return;
            const name = data?.d?.ListItemEntityTypeFullName || null;
            if (name) { setEntityType(name); return; }
            // Фолбэк: тип элемента из любого item (иногда list-level GET не проходит через прокси)
            try {
              const res = await apiClient.get(`${TASKS_LIST_API}/items?$top=1&$select=Id`, { headers: { Accept: "application/json;odata=verbose" } });
              const t = res?.data?.d?.results?.[0]?.__metadata?.type || null;
              if (!cancelled && t) setEntityType(t);
            } catch {}
          })
          .catch(() => { if (!cancelled) setEntityType(null); })
      );
      promises.push(
        apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'ResultSearchTHU'`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(({ data }) => {
            const field = data?.d?.results?.[0];
            if (!cancelled) {
              if (field?.Choices?.results) setChoices(field.Choices.results);
              else if (Array.isArray(field?.Choices)) setChoices(field.Choices);
              else setChoices([]);
            }
          }).catch(() => { if (!cancelled) setChoices([]); })
      );
      promises.push(
        apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'Status'`, { headers: { Accept: "application/json;odata=verbose" } })
          .then(({ data }) => {
            const field = data?.d?.results?.[0];
            let arr = [];
            if (field?.Choices?.results) arr = field.Choices.results;
            else if (Array.isArray(field?.Choices)) arr = field.Choices;
            if (!cancelled) {
              setStatusChoices(arr);
              let found = arr.find((v) => String(v).toLowerCase().includes("заверш"));
              if (!found) found = arr.find((v) => String(v).toLowerCase().includes("completed"));
              if (!found) {
                found = arr.find((v) => {
                  const s = String(v).toLowerCase();
                  return s.includes("выполн") && !s.includes("в процессе");
                });
              }
              if (found) setCompletedStatusValue(found);
              else if (arr.length > 0) setCompletedStatusValue(arr[arr.length - 1]);
              else setCompletedStatusValue("Завершена");
              let inProg = arr.find((v) => String(v).toLowerCase().includes("в процессе"));
              if (!inProg) inProg = arr.find((v) => String(v).toLowerCase().includes("in progress"));
              if (!inProg) inProg = arr.find((v) => String(v).toLowerCase().includes("в работе"));
              if (inProg) setInProgressStatusValue(inProg);
              else setInProgressStatusValue("В процессе выполнения");
            }
          }).catch(() => {
            if (!cancelled) {
              setStatusChoices([]);
              setCompletedStatusValue("Завершена");
              setInProgressStatusValue("В процессе выполнения");
            }
          })
      );
      promises.push(
        apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'AdditionalsActionsRequired'`, { headers: { Accept: "application/json;odata=verbose" } })
          .catch((err)=>{
            const msg=String(err?.response?.data?.error?.message?.value||"").toLowerCase();
            const notFound = err?.response?.status===404 || msg.includes("не существует");
            if(notFound){
              return apiClient.get(`${TASKS_LIST_API}/fields?$filter=InternalName eq 'AdditionalActionsRequired'`, { headers: { Accept: "application/json;odata=verbose" } });
            }
            throw err;
          })
          .then(({ data }) => {
            const field = data?.d?.results?.[0];
            if (!cancelled && field) {
              const typeStr = String(field.TypeAsString || field.TypeDisplayName || "").toLowerCase();
              const isBool = typeStr.includes("boolean") || typeStr.includes("yes/no") || typeStr === "boolean" || typeStr === "yesno";
              setAdditionalRequiredIsBoolean(isBool);
            } else if (!cancelled) {
              setAdditionalRequiredIsBoolean(false);
            }
          }).catch(() => { if (!cancelled) setAdditionalRequiredIsBoolean(false); })
      );
      promises.push(
        (async () => {
          try {
            const metas = await fetchResultFieldsMeta(apiClient);
            if (cancelled) return;
            setResultFieldsMeta(metas);
            try {
              const map = await fetchContentTypeResultMap(apiClient);
              if (!cancelled) setCtResultMap(map);
            } catch {}
            if (metas.length > 0 && metas[0].choices && metas[0].choices.length > 0) {
              setChoices((prev) => (prev && prev.length > 0 ? prev : metas[0].choices));
            }
          } catch (e) {
            console.warn("[resultField] fetch failed", e?.message);
          }
        })()
      );
      promises.push(
        fetchAdditionalActionsDefault(apiClient).then((vals) => {
          if (!cancelled) setFieldDefaultActions(vals);
        }).catch(() => { if (!cancelled) setFieldDefaultActions([]); })
      );
      await Promise.allSettled(promises);
      if (!cancelled) setFieldsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    fieldsLoading, setFieldsLoading,
    taskConfiguration,
    choices, setChoices,
    statusChoices, setStatusChoices,
    completedStatusValue, setCompletedStatusValue,
    inProgressStatusValue, setInProgressStatusValue,
    entityType, setEntityType,
    resultFieldsMeta, setResultFieldsMeta,
    ctResultMap, setCtResultMap,
    additionalRequiredIsBoolean, setAdditionalRequiredIsBoolean,
    fieldDefaultActions, setFieldDefaultActions,
  };
}
