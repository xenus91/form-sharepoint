// src/features/dob/components/requestForm/useRequestForm.js
// Состояние формы создания заявки: выбранный тип контента → поля этого типа →
// значения → валидация → запись в список (createDobItem).
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createDobItem, getDobContentTypeFields } from "../../api/dobApi";
import { DOB_LIST_GUID } from "../../api/dobClient";
import { validateRequiredFields } from "../../../../tasks/contentTypeFields";
import { buildRequestFormControls } from "../../lib/requestFormFields";
import { toCreatePayload } from "./toCreatePayload";

export function useRequestForm({ listGuid = DOB_LIST_GUID } = {}) {
  const [ctId, setCtId] = useState("");
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [invalidNames, setInvalidNames] = useState([]);
  const [created, setCreated] = useState(null);

  // Поля выбранного типа контента — состав формы.
  const fieldsQ = useQuery({
    queryKey: ["dob", "request-form", String(listGuid || "").toLowerCase(), ctId],
    queryFn: () => getDobContentTypeFields(ctId, listGuid),
    enabled: !!ctId,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Состав формы — поля выбранного типа контента (FieldLinks), без служебных.
  const controls = useMemo(() => buildRequestFormControls(fieldsQ.data || []), [fieldsQ.data]);

  const selectContentType = useCallback((nextId) => {
    setCtId(String(nextId || ""));
    setValues({});
    setProblems([]);
    setInvalidNames([]);
    setError("");
    setCreated(null);
  }, []);

  const setValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (!ctId) {
      setProblems(["Выберите тип заявки"]);
      return null;
    }
    const found = validateRequiredFields(controls, values);
    setProblems(found);
    setInvalidNames(controls
      .filter((c) => c.required && found.some((p) => p.includes(c.title)))
      .map((c) => c.internalName));
    if (found.length) return null;

    setSaving(true);
    setError("");
    try {
      const payload = toCreatePayload(controls, values);
      // Тип контента нового элемента — выбранный в форме.
      const body = { ...payload, ContentTypeId: ctId };
      const item = await createDobItem(body, listGuid);
      setCreated(item?.Id ?? item?.ID ?? null);
      return item;
    } catch (e) {
      const msg = e?.response?.data?.error?.message?.value || e?.message || String(e);
      setError(String(msg).slice(0, 600));
      return null;
    } finally {
      setSaving(false);
    }
  }, [ctId, controls, values, listGuid]);

  return {
    ctId,
    selectContentType,
    controls,
    values,
    setValue,
    problems,
    invalidNames,
    loadingFields: !!ctId && fieldsQ.isFetching,
    fieldsError: fieldsQ.isError ? String(fieldsQ.error?.message || "Не удалось загрузить поля типа") : "",
    saving,
    error,
    created,
    submit,
  };
}
